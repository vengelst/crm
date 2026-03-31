import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Global storage module — provides StorageService to the entire application.
 * Other modules can inject StorageService without importing StorageModule.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
