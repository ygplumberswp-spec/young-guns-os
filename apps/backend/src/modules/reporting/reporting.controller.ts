import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportingService } from './reporting.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('reporting')
@Controller('reporting')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  getDashboard(@CurrentUser('branches') branches: string[], @Query('branchId') branchId?: string) {
    return this.reportingService.getDashboardStats(branchId || branches[0]);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Get revenue report' })
  getRevenue(
    @CurrentUser('branches') branches: string[],
    @Query('branchId') branchId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportingService.getRevenueReport(
      branchId || branches[0],
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('technician-performance')
  @ApiOperation({ summary: 'Get technician performance report' })
  getTechnicianPerformance(
    @CurrentUser('branches') branches: string[],
    @Query('branchId') branchId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportingService.getTechnicianPerformance(
      branchId || branches[0],
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('job-types')
  @ApiOperation({ summary: 'Get job type breakdown' })
  getJobTypes(
    @CurrentUser('branches') branches: string[],
    @Query('branchId') branchId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportingService.getJobTypeBreakdown(
      branchId || branches[0],
      new Date(startDate),
      new Date(endDate),
    );
  }
}
