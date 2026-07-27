import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CommunicationsService } from './communications.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';

@ApiTags('communications')
@Controller('communications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Post()
  @ApiOperation({ summary: 'Send a communication (SMS, email, etc.)' })
  send(@Body() dto: {
    customerId: string;
    channel: 'SMS' | 'EMAIL' | 'WHATSAPP' | 'PHONE' | 'PUSH' | 'IN_APP';
    subject?: string;
    body: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.communicationsService.send(dto);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Send bulk communications' })
  sendBulk(@Body() dto: { messages: Array<{ customerId: string; channel: 'SMS' | 'EMAIL'; subject?: string; body: string }> }) {
    return this.communicationsService.sendBulk(dto.messages);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get communication history for a customer' })
  getHistory(@Param('customerId') customerId: string) {
    return this.communicationsService.getHistory(customerId);
  }
}
