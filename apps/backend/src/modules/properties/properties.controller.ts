import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';

@ApiTags('properties')
@Controller('properties')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post('customer/:customerId')
  @RequirePermissions('properties:create')
  @ApiOperation({ summary: 'Add property to customer' })
  create(@Param('customerId') customerId: string, @Body() dto: any) {
    return this.propertiesService.create(customerId, dto);
  }

  @Get('customer/:customerId')
  @RequirePermissions('properties:read')
  @ApiOperation({ summary: 'Get properties for a customer' })
  findByCustomer(@Param('customerId') customerId: string) {
    return this.propertiesService.findByCustomer(customerId);
  }

  @Get(':id')
  @RequirePermissions('properties:read')
  @ApiOperation({ summary: 'Get property by ID' })
  findOne(@Param('id') id: string) {
    return this.propertiesService.findById(id);
  }

  @Put(':id')
  @RequirePermissions('properties:update')
  @ApiOperation({ summary: 'Update property' })
  update(@Param('id') id: string, @Body() dto: any) {
    return this.propertiesService.update(id, dto);
  }
}
