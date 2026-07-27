import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DispatchService } from './dispatch.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';

@ApiTags('dispatch')
@Controller('dispatch')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Get('board')
  @RequirePermissions('dispatch:read')
  @ApiOperation({ summary: 'Get dispatch board for a date' })
  getBoard(
    @Query('branchId') branchId: string,
    @Query('date') date?: string,
  ) {
    const targetDate = date ? new Date(date) : new Date();
    return this.dispatchService.getDispatchBoard(branchId, targetDate);
  }

  @Get('technicians')
  @RequirePermissions('dispatch:read')
  @ApiOperation({ summary: 'Get technicians (alias)' })
  getTechnicians(
    @Query('branchId') branchId: string,
    @Query('date') date?: string,
  ) {
    const targetDate = date ? new Date(date) : new Date();
    return this.dispatchService.getAvailableTechnicians(branchId, targetDate);
  }

  @Get('technicians/available')
  @RequirePermissions('dispatch:read')
  @ApiOperation({ summary: 'Get available technicians' })
  getAvailable(
    @Query('branchId') branchId: string,
    @Query('date') date?: string,
  ) {
    const targetDate = date ? new Date(date) : new Date();
    return this.dispatchService.getAvailableTechnicians(branchId, targetDate);
  }

  @Post('recommend/:jobId')
  @RequirePermissions('dispatch:create')
  @ApiOperation({ summary: 'Get AI-powered dispatch recommendation' })
  recommend(
    @Param('jobId') jobId: string,
    @Query('branchId') branchId: string,
  ) {
    return this.dispatchService.recommendTechnician(jobId, branchId);
  }
}
