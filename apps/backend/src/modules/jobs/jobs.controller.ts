import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { UpdateJobStatusDto } from './dto/update-job-status.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('jobs')
@Controller('jobs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @RequirePermissions('jobs:create')
  @ApiOperation({ summary: 'Create a new job' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateJobDto,
  ) {
    return this.jobsService.create(dto.branchId, userId, dto);
  }

  @Get()
  @RequirePermissions('jobs:read')
  @ApiOperation({ summary: 'List jobs with filters' })
  findAll(
    @Query('branchId') branchId: string,
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('assignedToId') assignedToId?: string,
  ) {
    return this.jobsService.findAll(branchId, { ...pagination, status, assignedToId });
  }

  @Get('technician/:technicianId/today')
  @RequirePermissions('jobs:read')
  @ApiOperation({ summary: 'Get today\'s jobs for a technician' })
  getTechnicianJobs(@Param('technicianId') technicianId: string) {
    return this.jobsService.getJobsForTechnician(technicianId, new Date());
  }

  @Get(':id')
  @RequirePermissions('jobs:read')
  @ApiOperation({ summary: 'Get job by ID with full details' })
  findOne(@Param('id') id: string) {
    return this.jobsService.findById(id);
  }

  @Put(':id')
  @RequirePermissions('jobs:update')
  @ApiOperation({ summary: 'Update job details' })
  update(@Param('id') id: string, @Body() dto: UpdateJobDto) {
    return this.jobsService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('jobs:update')
  @ApiOperation({ summary: 'Update job status with validation' })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateJobStatusDto,
  ) {
    return this.jobsService.updateStatus(id, userId, dto);
  }

  @Patch(':id/assign/:technicianId')
  @RequirePermissions('jobs:update')
  @ApiOperation({ summary: 'Assign technician to job' })
  assignTechnician(
    @Param('id') id: string,
    @Param('technicianId') technicianId: string,
  ) {
    return this.jobsService.assignTechnician(id, technicianId);
  }
}
