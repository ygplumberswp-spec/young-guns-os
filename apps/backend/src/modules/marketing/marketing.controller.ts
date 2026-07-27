import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MarketingService } from './marketing.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';

@ApiTags('marketing')
@Controller('marketing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Post('campaigns')
  @RequirePermissions('marketing:create')
  @ApiOperation({ summary: 'Create a marketing campaign' })
  createCampaign(@Body() dto: {
    name: string;
    type: string;
    platform?: string;
    status?: string;
    branchId?: string;
    budget?: number;
    startDate?: string;
    endDate?: string;
    targeting?: Record<string, unknown>;
  }) {
    return this.marketingService.createCampaign(dto);
  }

  @Get('campaigns')
  @RequirePermissions('marketing:read')
  @ApiOperation({ summary: 'List marketing campaigns' })
  getCampaigns(@Query('status') status?: string) {
    return this.marketingService.getCampaigns(status);
  }

  @Get('campaigns/:id/metrics')
  @RequirePermissions('marketing:read')
  @ApiOperation({ summary: 'Get campaign metrics' })
  getCampaignMetrics(@Param('id') id: string) {
    return this.marketingService.getCampaignMetrics(id);
  }

  @Post('leads')
  @RequirePermissions('marketing:create')
  @ApiOperation({ summary: 'Create a marketing lead' })
  createLead(@Body() dto: {
    campaignId?: string;
    branchId?: string;
    source: string;
    name: string;
    phone: string;
    email?: string;
    suburb?: string;
    serviceType?: string;
  }) {
    const { branchId, ...leadData } = dto;
    return this.marketingService.createLead(leadData);
  }

  @Get('leads')
  @RequirePermissions('marketing:read')
  @ApiOperation({ summary: 'List marketing leads' })
  getLeads(@Query('status') status?: string) {
    return this.marketingService.getLeads(status);
  }
}
