import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';

@ApiTags('referrals')
@Controller('referrals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post()
  @RequirePermissions('marketing:create')
  @ApiOperation({ summary: 'Create a referral' })
  create(@Body() dto: {
    referrerId: string;
    referredName: string;
    referredPhone: string;
    referredEmail?: string;
    rewardType?: string;
    rewardValue?: number;
    code?: string;
    rewardAmount?: number;
  }) {
    return this.referralsService.create({
      referrerId: dto.referrerId,
      referredName: dto.referredName || 'Pending',
      referredPhone: dto.referredPhone || '',
      referredEmail: dto.referredEmail,
      rewardType: dto.rewardType || 'CREDIT',
      rewardValue: dto.rewardValue || dto.rewardAmount || 50,
    });
  }

  @Get()
  @RequirePermissions('marketing:read')
  @ApiOperation({ summary: 'List referrals' })
  findAll(@Query('status') status?: string) {
    return this.referralsService.findAll(status);
  }

  @Patch(':id/convert')
  @RequirePermissions('marketing:update')
  @ApiOperation({ summary: 'Convert a referral to customer' })
  convert(@Param('id') id: string, @Body() dto: { customerId: string }) {
    return this.referralsService.convert(id, dto.customerId);
  }

  @Patch(':id/reward')
  @RequirePermissions('marketing:update')
  @ApiOperation({ summary: 'Issue referral reward' })
  issueReward(@Param('id') id: string) {
    return this.referralsService.issueReward(id);
  }

  @Get('top-referrers')
  @RequirePermissions('marketing:read')
  @ApiOperation({ summary: 'Get top referrers' })
  getTopReferrers(@Query('limit') limit?: number) {
    return this.referralsService.getTopReferrers(limit);
  }
}
