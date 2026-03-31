/**
 * Migration script: copies existing local files to MinIO.
 *
 * Usage:
 *   pnpm --filter api migrate:minio              # real run
 *   pnpm --filter api migrate:minio -- --dry-run  # preview only
 *
 * Reads env from ../../.env and .env (same as the API app).
 * Does NOT delete local files — that is a separate, later step.
 * Does NOT overwrite objects that already exist in MinIO.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as Minio from 'minio';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';

// ── Load env from .env files (no external deps) ─────
function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(resolve(__dirname, '..', '..', '..', '.env'));
loadEnvFile(resolve(__dirname, '..', '.env'));

const DRY_RUN = process.argv.includes('--dry-run');

// ── DB ──────────────────────────────────────────────
const dbUrl =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:55432/crm_monteur';
const adapter = new PrismaPg({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

// ── MinIO ───────────────────────────────────────────
const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
const port = Number(process.env.MINIO_PORT ?? '9000');
const useSSL = process.env.MINIO_USE_SSL === 'true';
const bucket = process.env.MINIO_BUCKET ?? 'crm-documents';

const minio = new Minio.Client({
  endPoint: endpoint,
  port,
  useSSL,
  accessKey: process.env.MINIO_ROOT_USER ?? 'minioadmin',
  secretKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin',
});

const storageRoot = resolve(process.cwd(), 'storage');

// ── Helpers ─────────────────────────────────────────

async function objectExists(key: string): Promise<boolean> {
  try {
    await minio.statObject(bucket, key);
    return true;
  } catch {
    return false;
  }
}

function mimeFromExt(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
  };
  return map[ext] ?? 'application/octet-stream';
}

// ── Stats ───────────────────────────────────────────

const stats = {
  documents: {
    total: 0,
    migrated: 0,
    alreadyInMinio: 0,
    localMissing: 0,
    errors: 0,
  },
  logo: {
    total: 0,
    migrated: 0,
    alreadyInMinio: 0,
    localMissing: 0,
    errors: 0,
  },
  orphanFiles: { found: 0, uploaded: 0, errors: 0 },
};

// ── Main ────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  MinIO Migration Script');
  console.log(`  Mode:     ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`  Endpoint: ${endpoint}:${port} (SSL: ${useSSL})`);
  console.log(`  Bucket:   ${bucket}`);
  console.log(`  Storage:  ${storageRoot}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Ensure bucket
  if (!DRY_RUN) {
    const exists = await minio.bucketExists(bucket);
    if (!exists) {
      await minio.makeBucket(bucket);
      console.log(`✓ Bucket "${bucket}" created.`);
    }
  }

  // 1) Migrate documents from DB
  await migrateDocuments();

  // 2) Migrate logo
  await migrateLogo();

  // 3) Scan for orphan files in storage/uploads not tracked in DB
  await migrateOrphanFiles();

  // Summary
  printSummary();

  await prisma.$disconnect();
}

async function migrateDocuments() {
  console.log('── Documents ──────────────────────────────────────');

  const documents = await prisma.document.findMany({
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      originalFilename: true,
    },
  });
  stats.documents.total = documents.length;
  console.log(`  Found ${documents.length} documents in database.`);

  for (const doc of documents) {
    const label = `[${doc.id}] ${doc.storageKey}`;
    try {
      // Already in MinIO?
      const inMinio = await objectExists(doc.storageKey);
      if (inMinio) {
        stats.documents.alreadyInMinio++;
        console.log(`  ○ ${label} — already in MinIO, skipped.`);
        continue;
      }

      // Local file?
      const localPath = resolve(storageRoot, doc.storageKey);
      if (!existsSync(localPath)) {
        stats.documents.localMissing++;
        console.log(`  ✗ ${label} — local file missing, skipped.`);
        continue;
      }

      if (DRY_RUN) {
        stats.documents.migrated++;
        console.log(`  → ${label} — would upload (dry run).`);
        continue;
      }

      const buf = readFileSync(localPath);
      await minio.putObject(bucket, doc.storageKey, buf, buf.length, {
        'Content-Type': doc.mimeType,
      });
      stats.documents.migrated++;
      console.log(`  ✓ ${label} — uploaded (${buf.length} bytes).`);
    } catch (err) {
      stats.documents.errors++;
      console.error(
        `  ✗ ${label} — ERROR: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  console.log('');
}

async function migrateLogo() {
  console.log('── Logo ───────────────────────────────────────────');

  const logoRow = await prisma.setting.findUnique({
    where: { key: 'company.logoPath' },
  });
  const logoPath =
    typeof logoRow?.valueJson === 'string' ? logoRow.valueJson : null;

  if (!logoPath) {
    console.log('  No logo configured, skipping.');
    console.log('');
    return;
  }

  stats.logo.total = 1;
  const label = logoPath;

  try {
    const inMinio = await objectExists(logoPath);
    if (inMinio) {
      stats.logo.alreadyInMinio++;
      console.log(`  ○ ${label} — already in MinIO, skipped.`);
      console.log('');
      return;
    }

    const localPath = resolve(storageRoot, logoPath);
    if (!existsSync(localPath)) {
      stats.logo.localMissing++;
      console.log(`  ✗ ${label} — local file missing, skipped.`);
      console.log('');
      return;
    }

    if (DRY_RUN) {
      stats.logo.migrated++;
      console.log(`  → ${label} — would upload (dry run).`);
      console.log('');
      return;
    }

    const buf = readFileSync(localPath);
    const ct = mimeFromExt(logoPath);
    await minio.putObject(bucket, logoPath, buf, buf.length, {
      'Content-Type': ct,
    });
    stats.logo.migrated++;
    console.log(`  ✓ ${label} — uploaded (${buf.length} bytes).`);
  } catch (err) {
    stats.logo.errors++;
    console.error(
      `  ✗ ${label} — ERROR: ${err instanceof Error ? err.message : err}`,
    );
  }
  console.log('');
}

async function migrateOrphanFiles() {
  console.log('── Orphan files (local but not in DB) ─────────────');

  const uploadsDir = resolve(storageRoot, 'uploads');
  if (!existsSync(uploadsDir)) {
    console.log('  No uploads directory found, skipping.');
    console.log('');
    return;
  }

  // Build set of known storage keys from DB
  const knownKeys = new Set(
    (await prisma.document.findMany({ select: { storageKey: true } })).map(
      (d) => d.storageKey,
    ),
  );

  const files = readdirSync(uploadsDir);
  let orphanCount = 0;

  for (const file of files) {
    const storageKey = `uploads/${file}`;
    if (knownKeys.has(storageKey)) continue; // tracked in DB, already handled above

    orphanCount++;
    stats.orphanFiles.found++;
    const label = storageKey;

    try {
      const inMinio = await objectExists(storageKey);
      if (inMinio) {
        console.log(`  ○ ${label} — already in MinIO (orphan), skipped.`);
        continue;
      }

      if (DRY_RUN) {
        stats.orphanFiles.uploaded++;
        console.log(`  → ${label} — would upload orphan (dry run).`);
        continue;
      }

      const localPath = resolve(uploadsDir, file);
      const buf = readFileSync(localPath);
      const ct = mimeFromExt(file);
      await minio.putObject(bucket, storageKey, buf, buf.length, {
        'Content-Type': ct,
      });
      stats.orphanFiles.uploaded++;
      console.log(`  ✓ ${label} — orphan uploaded (${buf.length} bytes).`);
    } catch (err) {
      stats.orphanFiles.errors++;
      console.error(
        `  ✗ ${label} — ERROR: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  if (orphanCount === 0) {
    console.log('  No orphan files found.');
  }
  console.log('');
}

function printSummary() {
  const d = stats.documents;
  const l = stats.logo;
  const o = stats.orphanFiles;

  console.log('═══════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');
  console.log('  Documents:');
  console.log(`    Total in DB:       ${d.total}`);
  console.log(`    Migrated:          ${d.migrated}`);
  console.log(`    Already in MinIO:  ${d.alreadyInMinio}`);
  console.log(`    Local missing:     ${d.localMissing}`);
  console.log(`    Errors:            ${d.errors}`);
  console.log('');
  console.log('  Logo:');
  console.log(`    Configured:        ${l.total}`);
  console.log(`    Migrated:          ${l.migrated}`);
  console.log(`    Already in MinIO:  ${l.alreadyInMinio}`);
  console.log(`    Local missing:     ${l.localMissing}`);
  console.log(`    Errors:            ${l.errors}`);
  console.log('');
  console.log('  Orphan files (local but not in DB):');
  console.log(`    Found:             ${o.found}`);
  console.log(`    Uploaded:          ${o.uploaded}`);
  console.log(`    Errors:            ${o.errors}`);
  console.log('');

  const totalErrors = d.errors + l.errors + o.errors;
  if (totalErrors > 0) {
    console.log(`  ⚠  ${totalErrors} error(s) occurred. Check output above.`);
  } else if (DRY_RUN) {
    console.log('  ℹ  Dry run complete. Re-run without --dry-run to execute.');
  } else {
    console.log('  ✓  Migration complete. No errors.');
    console.log('');
    console.log(
      '  Next step: verify that all files are accessible via the API,',
    );
    console.log('  then the local fallback can be removed in a future update.');
  }
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
