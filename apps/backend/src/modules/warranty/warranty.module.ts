import { Module } from '@nestjs/common';
import { WarrantyService } from './warranty.service';

@Module({
  providers: [WarrantyService],
  exports: [WarrantyService],
})
export class WarrantyModule {}
