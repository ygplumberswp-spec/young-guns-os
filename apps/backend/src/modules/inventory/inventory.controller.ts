import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @RequirePermissions('inventory:create')
  @ApiOperation({ summary: 'Create inventory item' })
  create(@CurrentUser('organizationId') orgId: string, @Body() dto: any) {
    return this.inventoryService.create(orgId, dto);
  }

  @Get()
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'List inventory items' })
  findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query() pagination: PaginationDto,
    @Query('category') category?: string,
    @Query('lowStock') lowStock?: boolean,
  ) {
    return this.inventoryService.findAll(orgId, { ...pagination, category, lowStock });
  }

  @Get('low-stock')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Get items below reorder point' })
  getLowStock(@CurrentUser('organizationId') orgId: string) {
    return this.inventoryService.getLowStockItems(orgId);
  }

  @Get(':id')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Get inventory item details' })
  findOne(@Param('id') id: string) {
    return this.inventoryService.findById(id);
  }

  @Post(':id/adjust')
  @RequirePermissions('inventory:update')
  @ApiOperation({ summary: 'Adjust stock level' })
  adjustStock(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: { warehouseId: string; quantity: number; type: string; notes?: string },
  ) {
    return this.inventoryService.adjustStock(id, dto.warehouseId, dto.quantity, dto.type, userId, dto.notes);
  }
}
