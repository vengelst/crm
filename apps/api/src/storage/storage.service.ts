import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'stream';

export interface StorageObjectStat {
  size: number;
  etag: string;
  lastModified: Date;
  metaData: Record<string, string>;
}

/** Max. Groesse fuer Puffer-Lesevorgaenge (OOM-Schutz). */
const MAX_OBJECT_BUFFER_BYTES = 40 * 1024 * 1024;

/**
 * Central S3/MinIO storage service.
 *
 * ── Configuration (all env-based, no hard-coded domains) ──────────
 *
 *   MINIO_ENDPOINT            – hostname (e.g. "minio", "localhost")
 *   MINIO_PORT                – port (default 9000)
 *   MINIO_ROOT_USER           – access key
 *   MINIO_ROOT_PASSWORD       – secret key
 *   MINIO_BUCKET              – default bucket name
 *   MINIO_USE_SSL             – "true" to enable TLS (default "false")
 *   STORAGE_LOCAL_FALLBACK    – "true" to enable local filesystem fallback
 *                                for files not yet migrated to MinIO (default "true").
 *                                Set to "false" after successful migration.
 *
 * ── Storage paths ─────────────────────────────────────────────────
 *
 *   Fully MinIO-based (via this service):
 *     uploads/*     – Document files (documents module)
 *     logo/*        – Company logo (settings module)
 *
 *   Intentionally local (NOT managed by MinIO):
 *     backups/*     – Temporary backup archives (settings module)
 *
 * ── Go-live checklist ─────────────────────────────────────────────
 *
 *   1. Run migration:     pnpm --filter api migrate:minio
 *   2. Verify in MinIO console that all objects are present
 *   3. Set env:           STORAGE_LOCAL_FALLBACK=false
 *   4. Restart API
 *   5. Test: document download, logo display, PDF generation, backup
 *   6. Optionally delete local storage/uploads/ and storage/logo/
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: Minio.Client;
  private readonly bucket: string;

  /**
   * When true, getObjectStreamWithFallback / deleteWithFallback check the
   * local `storage/` directory as a secondary source. Set to false via
   * env `STORAGE_LOCAL_FALLBACK=false` after all files have been migrated.
   */
  readonly localFallbackEnabled: boolean;

  private readonly localStorageRoot: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = Number(config.get<string>('MINIO_PORT', '9000'));
    const useSSL = config.get<string>('MINIO_USE_SSL', 'false') === 'true';

    this.client = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey: config.get<string>('MINIO_ROOT_USER', 'minioadmin'),
      secretKey: config.get<string>('MINIO_ROOT_PASSWORD', 'minioadmin'),
    });

    this.bucket = config.get<string>('MINIO_BUCKET', 'crm-documents');

    this.localFallbackEnabled =
      config.get<string>('STORAGE_LOCAL_FALLBACK', 'true') !== 'false';

    this.localStorageRoot = resolve(process.cwd(), 'storage');

    this.logger.log(
      `MinIO client configured: ${endpoint}:${port} bucket=${this.bucket} ` +
        `ssl=${useSSL} localFallback=${this.localFallbackEnabled}`,
    );
  }

  /** Check / create the default bucket on startup. */
  async onModuleInit() {
    await this.ensureBucket();
  }

  /** Ensure the configured bucket exists, create if missing. */
  async ensureBucket(bucketName?: string): Promise<void> {
    const name = bucketName ?? this.bucket;
    try {
      const exists = await this.client.bucketExists(name);
      if (!exists) {
        await this.client.makeBucket(name);
        this.logger.log(`Bucket "${name}" created.`);
      } else {
        this.logger.log(`Bucket "${name}" already exists.`);
      }
    } catch (error) {
      this.logger.warn(
        `MinIO bucket check failed (${name}): ${error instanceof Error ? error.message : error}. ` +
          'Storage will be retried on first use.',
      );
    }
  }

  /**
   * Upload a file/buffer/stream to MinIO.
   *
   * @param objectKey  – path inside the bucket, e.g. "uploads/abc123.pdf"
   * @param data       – Buffer, Readable stream, or string (file path not supported here)
   * @param size       – byte size (required for streams, optional for Buffer)
   * @param contentType – MIME type, e.g. "application/pdf"
   * @param metadata   – optional custom metadata headers
   */
  async uploadObject(
    objectKey: string,
    data: Buffer | Readable,
    size?: number,
    contentType?: string,
    metadata?: Record<string, string>,
  ): Promise<{ etag: string; versionId: string | null }> {
    const metaData: Record<string, string> = {
      ...(metadata ?? {}),
    };
    if (contentType) {
      metaData['Content-Type'] = contentType;
    }

    const byteSize = size ?? (Buffer.isBuffer(data) ? data.length : undefined);

    const result = await this.client.putObject(
      this.bucket,
      objectKey,
      data,
      byteSize,
      metaData,
    );

    this.logger.debug(`Uploaded ${objectKey} (${byteSize ?? '?'} bytes)`);
    return {
      etag: result.etag,
      versionId: result.versionId ?? null,
    };
  }

  /**
   * Get a readable stream for an object.
   */
  async getObjectStream(objectKey: string): Promise<Readable> {
    return this.client.getObject(this.bucket, objectKey);
  }

  /**
   * Delete an object from the bucket.
   */
  async deleteObject(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
    this.logger.debug(`Deleted ${objectKey}`);
  }

  /**
   * Get metadata / stat for an object (size, etag, lastModified).
   */
  async statObject(objectKey: string): Promise<StorageObjectStat> {
    const stat = await this.client.statObject(this.bucket, objectKey);
    return {
      size: stat.size,
      etag: stat.etag,
      lastModified: stat.lastModified,
      metaData: (stat.metaData ?? {}) as Record<string, string>,
    };
  }

  /**
   * Check whether an object exists without downloading it.
   */
  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, objectKey);
      return true;
    } catch {
      return false;
    }
  }

  /** Expose the raw MinIO client for advanced use (presigned URLs etc.). */
  getClient(): Minio.Client {
    return this.client;
  }

  /** Get the configured bucket name. */
  getBucketName(): string {
    return this.bucket;
  }

  // ── Centralized local-fallback helpers ─────────────

  /**
   * Get a readable stream — MinIO first, then local fallback (if enabled).
   * Returns null if the object is not found in either location.
   */
  async getObjectStreamWithFallback(
    objectKey: string,
  ): Promise<Readable | null> {
    // 1) MinIO
    const inMinio = await this.objectExists(objectKey);
    if (inMinio) {
      return this.client.getObject(this.bucket, objectKey);
    }

    // 2) Local fallback
    if (this.localFallbackEnabled) {
      const localPath = resolve(this.localStorageRoot, objectKey);
      if (existsSync(localPath)) {
        this.logger.warn(
          `[local-fallback] Serving "${objectKey}" from disk — not yet in MinIO.`,
        );
        return createReadStream(localPath);
      }
    }

    return null;
  }

  /**
   * Read an object as Buffer — MinIO first, then local fallback (if enabled).
   * Returns null if not found anywhere.
   */
  async getObjectBufferWithFallback(objectKey: string): Promise<Buffer | null> {
    // 1) MinIO
    const inMinio = await this.objectExists(objectKey);
    if (inMinio) {
      const stream = await this.client.getObject(this.bucket, objectKey);
      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of stream) {
        const buf =
          chunk instanceof Uint8Array ? chunk : Buffer.from(String(chunk));
        total += buf.length;
        if (total > MAX_OBJECT_BUFFER_BYTES) {
          this.logger.warn(
            `Object "${objectKey}" exceeds max buffer size (${MAX_OBJECT_BUFFER_BYTES} bytes); aborting read.`,
          );
          return null;
        }
        chunks.push(buf);
      }
      return Buffer.concat(chunks);
    }

    // 2) Local fallback
    if (this.localFallbackEnabled) {
      const localPath = resolve(this.localStorageRoot, objectKey);
      if (existsSync(localPath)) {
        const size = statSync(localPath).size;
        if (size > MAX_OBJECT_BUFFER_BYTES) {
          this.logger.warn(
            `Local file "${objectKey}" (${size} bytes) exceeds max buffer size; skipping.`,
          );
          return null;
        }
        this.logger.warn(
          `[local-fallback] Reading "${objectKey}" from disk — not yet in MinIO.`,
        );
        return readFileSync(localPath);
      }
    }

    return null;
  }

  /**
   * Delete an object from MinIO and, if local fallback is enabled,
   * also clean up the local copy.
   */
  async deleteObjectWithFallback(objectKey: string): Promise<void> {
    // MinIO
    try {
      const inMinio = await this.objectExists(objectKey);
      if (inMinio) {
        await this.client.removeObject(this.bucket, objectKey);
        this.logger.debug(`Deleted ${objectKey} from MinIO.`);
      }
    } catch (error) {
      this.logger.warn(
        `MinIO delete for "${objectKey}" failed: ${error instanceof Error ? error.message : error}`,
      );
    }

    // Local cleanup (only if fallback is still enabled)
    if (this.localFallbackEnabled) {
      const localPath = resolve(this.localStorageRoot, objectKey);
      if (existsSync(localPath)) {
        try {
          unlinkSync(localPath);
          this.logger.debug(`Deleted local legacy file: ${objectKey}`);
        } catch (error) {
          this.logger.warn(
            `Local delete for "${objectKey}" failed: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    }
  }
}
