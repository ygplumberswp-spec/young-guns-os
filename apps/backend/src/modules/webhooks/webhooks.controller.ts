import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';

@ApiTags('webhooks')
@Controller('webhooks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @RequirePermissions('webhooks:create')
  @ApiOperation({ summary: 'Create webhook endpoint' })
  create(@Body() dto: { url: string; events: string[]; description?: string }) {
    return this.webhooksService.createEndpoint(dto);
  }

  @Get()
  @RequirePermissions('webhooks:read')
  @ApiOperation({ summary: 'List webhook endpoints' })
  findAll() {
    return this.webhooksService.getEndpoints();
  }

  @Get(':id/deliveries')
  @RequirePermissions('webhooks:read')
  @ApiOperation({ summary: 'Get webhook delivery history' })
  getDeliveries(@Param('id') id: string) {
    return this.webhooksService.getDeliveries(id);
  }
}
