import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TechnicianService } from './technician.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('technician')
@Controller('technician')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TechnicianController {
  constructor(private readonly technicianService: TechnicianService) {}

  @Get('jobs')
  @ApiOperation({ summary: 'Get my jobs for today or a specific date' })
  getMyJobs(@CurrentUser('id') userId: string, @Query('date') date?: string) {
    return this.technicianService.getMyJobs(userId, date ? new Date(date) : undefined);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get my technician profile' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.technicianService.getProfile(userId);
  }

  @Post('location')
  @ApiOperation({ summary: 'Update my GPS location' })
  updateLocation(
    @CurrentUser('id') userId: string,
    @Body() dto: { latitude: number; longitude: number },
  ) {
    return this.technicianService.updateLocation(userId, dto.latitude, dto.longitude);
  }

  @Patch('jobs/:jobId/start')
  @ApiOperation({ summary: 'Start a job' })
  startJob(@CurrentUser('id') userId: string, @Param('jobId') jobId: string) {
    return this.technicianService.startJob(userId, jobId);
  }

  @Patch('jobs/:jobId/complete')
  @ApiOperation({ summary: 'Complete a job' })
  completeJob(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
    @Body() dto: { notes?: string; photos?: string[] },
  ) {
    return this.technicianService.completeJob(userId, jobId, dto.notes, dto.photos);
  }

  @Patch('availability')
  @ApiOperation({ summary: 'Set my availability' })
  setAvailability(@CurrentUser('id') userId: string, @Body('isAvailable') isAvailable: boolean) {
    return this.technicianService.setAvailability(userId, isAvailable);
  }
}
