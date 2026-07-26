import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FleetService } from './fleet.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';

@ApiTags('fleet')
@Controller('fleet')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Get('vehicles')
  @RequirePermissions('fleet:read')
  @ApiOperation({ summary: 'List all vehicles' })
  getVehicles(@Query('branchId') branchId: string) {
    return this.fleetService.getVehicles(branchId);
  }

  @Get('vehicles/:id')
  @RequirePermissions('fleet:read')
  @ApiOperation({ summary: 'Get vehicle details' })
  getVehicle(@Param('id') id: string) {
    return this.fleetService.getVehicleById(id);
  }

  @Post('vehicles')
  @RequirePermissions('fleet:create')
  @ApiOperation({ summary: 'Add a vehicle' })
  createVehicle(@Query('branchId') branchId: string, @Body() dto: any) {
    return this.fleetService.createVehicle(branchId, dto);
  }

  @Get('live')
  @RequirePermissions('fleet:read')
  @ApiOperation({ summary: 'Get live fleet locations' })
  getLiveLocations(@Query('branchId') branchId: string) {
    return this.fleetService.getLiveLocations(branchId);
  }

  @Post('vehicles/:id/location')
  @ApiOperation({ summary: 'Update vehicle GPS location' })
  updateLocation(
    @Param('id') id: string,
    @Body() dto: { latitude: number; longitude: number; speed?: number; heading?: number },
  ) {
    return this.fleetService.updateLocation(id, dto.latitude, dto.longitude, dto.speed, dto.heading);
  }

  @Get('maintenance-due')
  @RequirePermissions('fleet:read')
  @ApiOperation({ summary: 'Get vehicles needing service' })
  getMaintenanceDue(@Query('branchId') branchId: string) {
    return this.fleetService.getVehiclesNeedingService(branchId);
  }
}
