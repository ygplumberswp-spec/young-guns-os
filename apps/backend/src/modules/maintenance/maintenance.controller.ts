import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';

@ApiTags('maintenance')
@Controller('maintenance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post()
  @ApiOperation({ summary: 'Create a maintenance schedule' })
  create(@Body() dto: {
    propertyId: string;
    type: string;
    description: string;
    intervalMonths: number;
    lastServiceDate?: string;
  }) {
    return this.maintenanceService.createSchedule(dto);
  }

  @Get('due')
  @ApiOperation({ summary: 'Get maintenance reminders due soon' })
  getDue(@Query('daysAhead') daysAhead?: string) {
    return this.maintenanceService.getDueReminders();
  }

  @Patch(':id/reminded')
  @ApiOperation({ summary: 'Mark maintenance as reminder sent' })
  markReminded(@Param('id') id: string) {
    return this.maintenanceService.markReminded(id);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Complete a maintenance service' })
  complete(@Param('id') id: string) {
    return this.maintenanceService.completeService(id);
  }
}
