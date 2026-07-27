import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('purchase-orders')
@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class PurchaseOrdersController {
  constructor(private readonly poService: PurchaseOrdersService) {}

  @Post()
  @RequirePermissions('inventory:create')
  @ApiOperation({ summary: 'Create a purchase order' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: { supplierId: string; items: Array<{ inventoryId: string; quantity: number; unitPrice: number }>; notes?: string },
  ) {
    return this.poService.create(userId, dto);
  }

  @Get()
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'List purchase orders' })
  findAll(@Query('status') status?: string) {
    return this.poService.findAll(status);
  }

  @Get(':id')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Get purchase order details' })
  findOne(@Param('id') id: string) {
    return this.poService.findById(id);
  }

  @Patch(':id/approve')
  @RequirePermissions('inventory:update')
  @ApiOperation({ summary: 'Approve a purchase order' })
  approve(@Param('id') id: string) {
    return this.poService.approve(id);
  }

  @Patch(':id/order')
  @RequirePermissions('inventory:update')
  @ApiOperation({ summary: 'Mark purchase order as ordered' })
  markOrdered(@Param('id') id: string) {
    return this.poService.markOrdered(id);
  }

  @Post(':id/receive')
  @RequirePermissions('inventory:update')
  @ApiOperation({ summary: 'Receive items against purchase order' })
  receiveItems(
    @Param('id') id: string,
    @Body() dto: { items: Array<{ itemId: string; quantity: number }> },
  ) {
    return this.poService.receiveItems(id, dto.items);
  }
}
