import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiReceptionistService } from './ai-receptionist.service';
import { AiSalesService } from './ai-sales.service';
import { AiDispatcherService } from './ai-dispatcher.service';
import { AiBaseService } from './ai-base.service';

@Module({
  controllers: [AiController],
  providers: [AiBaseService, AiReceptionistService, AiSalesService, AiDispatcherService],
  exports: [AiReceptionistService, AiSalesService, AiDispatcherService],
})
export class AiModule {}
