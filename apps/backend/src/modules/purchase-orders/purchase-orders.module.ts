import { Module } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
