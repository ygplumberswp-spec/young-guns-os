import { Module } from '@nestjs/common';
import { XeroService } from './xero.service';
import { XeroController } from './xero.controller';

@Module({
  controllers: [XeroController],
  providers: [XeroService],
  exports: [XeroService],
})
export class XeroModule {}
