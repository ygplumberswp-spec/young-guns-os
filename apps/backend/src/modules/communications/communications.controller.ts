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
    channel?: 'SMS' | 'EMAIL' | 'WHATSAPP' | 'PHONE' | 'PUSH' | 'IN_APP';
    type?: string;
    direction?: string;
    subject?: string;
    body: string;
    branchId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const channel = dto.channel || dto.type as any || 'SMS';
    return this.communicationsService.send({ ...dto, channel });
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Send bulk communications' })
  sendBulk(@Body() dto: {
    messages?: Array<{ customerId: string; channel: 'SMS' | 'EMAIL'; subject?: string; body: string }>;
    customerIds?: string[];
    type?: string;
    subject?: string;
    body?: string;
    branchId?: string;
  }) {
    if (dto.messages && dto.messages.length > 0) {
      return this.communicationsService.sendBulk(dto.messages);
    }
    const messages = (dto.customerIds || []).map((customerId) => ({
      customerId,
      channel: (dto.type || 'SMS') as 'SMS' | 'EMAIL',
      subject: dto.subject,
      body: dto.body || '',
    }));
    return this.communicationsService.sendBulk(messages);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get communication history for a customer' })
  getHistory(@Param('customerId') customerId: string) {
    return this.communicationsService.getHistory(customerId);
  }
}
