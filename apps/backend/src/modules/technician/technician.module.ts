import { Module } from '@nestjs/common';
import { TechnicianController } from './technician.controller';
import { TechnicianService } from './technician.service';

@Module({
  controllers: [TechnicianController],
  providers: [TechnicianService],
  exports: [TechnicianService],
})
export class TechnicianModule {}
