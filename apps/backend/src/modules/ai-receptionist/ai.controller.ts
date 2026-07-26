import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AiReceptionistService } from './ai-receptionist.service';
import { AiSalesService } from './ai-sales.service';
import { AiDispatcherService } from './ai-dispatcher.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(
    private readonly receptionist: AiReceptionistService,
    private readonly sales: AiSalesService,
    private readonly dispatcher: AiDispatcherService,
  ) {}

  @Post('receptionist/call')
  @ApiOperation({ summary: 'Handle incoming call via AI receptionist' })
  handleCall(@Body() dto: { phone: string; branchId: string }) {
    return this.receptionist.handleIncomingCall(dto.phone, dto.branchId);
  }

  @Post('receptionist/message')
  @ApiOperation({ summary: 'Send message to AI receptionist' })
  handleMessage(
    @Body() dto: { conversationId: string; message: string; context?: any },
  ) {
    return this.receptionist.handleMessage(dto.conversationId, dto.message, dto.context);
  }

  @Post('sales/follow-up-quote/:quoteId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @RequirePermissions('ai:execute')
  @ApiOperation({ summary: 'AI Sales follow-up on a quote' })
  followUpQuote(@Param('quoteId') quoteId: string) {
    return this.sales.followUpQuote(quoteId);
  }

  @Post('sales/follow-up-lead/:leadId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @RequirePermissions('ai:execute')
  @ApiOperation({ summary: 'AI Sales follow-up on a lead' })
  followUpLead(@Param('leadId') leadId: string) {
    return this.sales.generateLeadFollowUp(leadId);
  }

  @Get('sales/pipeline')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @RequirePermissions('ai:read')
  @ApiOperation({ summary: 'Get AI Sales pipeline stats' })
  getSalesPipeline() {
    return this.sales.getSalesPipeline();
  }

  @Post('dispatcher/optimize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @RequirePermissions('ai:execute')
  @ApiOperation({ summary: 'AI Dispatcher schedule optimization' })
  optimizeSchedule(@Body() dto: { branchId: string; date?: string }) {
    const date = dto.date ? new Date(dto.date) : new Date();
    return this.dispatcher.optimizeSchedule(dto.branchId, date);
  }

  @Post('dispatcher/delay')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @RequirePermissions('ai:execute')
  @ApiOperation({ summary: 'Report technician delay to AI dispatcher' })
  handleDelay(@Body() dto: { jobId: string; delayMinutes: number }) {
    return this.dispatcher.handleDelay(dto.jobId, dto.delayMinutes);
  }
}
