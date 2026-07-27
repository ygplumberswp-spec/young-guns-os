import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WarehouseService } from './warehouse.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('warehouse')
@Controller('warehouses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  @RequirePermissions('warehouse:create')
  @ApiOperation({ summary: 'Create warehouse' })
  create(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('branches') branches: string[],
    @Body() dto: { name: string; code: string; address?: string; type?: string; branchId?: string },
  ) {
    const branchId = dto.branchId || branches[0];
    return this.warehouseService.create(orgId, branchId, dto);
  }

  @Get()
  @RequirePermissions('warehouse:read')
  @ApiOperation({ summary: 'List warehouses' })
  findAll(@CurrentUser('organizationId') orgId: string) {
    return this.warehouseService.findAll(orgId);
  }

  @Get(':id')
  @RequirePermissions('warehouse:read')
  @ApiOperation({ summary: 'Get warehouse details with stock levels' })
  findOne(@Param('id') id: string) {
    return this.warehouseService.findById(id);
  }

  @Post('transfer')
  @RequirePermissions('warehouse:update')
  @ApiOperation({ summary: 'Transfer stock between warehouses' })
  transferStock(
    @CurrentUser('id') userId: string,
    @Body() dto: { inventoryId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number },
  ) {
    return this.warehouseService.transferStock(
      dto.inventoryId,
      dto.fromWarehouseId,
      dto.toWarehouseId,
      dto.quantity,
      userId,
    );
  }
}
