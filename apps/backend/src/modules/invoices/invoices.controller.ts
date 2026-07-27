import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('invoices')
@Controller('invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @RequirePermissions('invoices:create')
  @ApiOperation({ summary: 'Create an invoice' })
  create(@CurrentUser('id') userId: string, @CurrentUser('branches') branches: string[], @Body() dto: any) {
    const items = dto.items || dto.lineItems || [];
    const branchId = dto.branchId || branches?.[0];
    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }
    return this.invoicesService.create(branchId, userId, { ...dto, items });
  }

  @Get()
  @RequirePermissions('invoices:read')
  @ApiOperation({ summary: 'List invoices' })
  findAll(
    @Query('branchId') branchId: string,
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.invoicesService.findAll(branchId, { ...pagination, status });
  }

  @Get('overdue')
  @RequirePermissions('invoices:read')
  @ApiOperation({ summary: 'Get overdue invoices' })
  getOverdue(@Query('branchId') branchId: string) {
    return this.invoicesService.getOverdueInvoices(branchId);
  }

  @Get(':id')
  @RequirePermissions('invoices:read')
  @ApiOperation({ summary: 'Get invoice details' })
  findOne(@Param('id') id: string) {
    return this.invoicesService.findById(id);
  }

  @Patch(':id/send')
  @RequirePermissions('invoices:update')
  @ApiOperation({ summary: 'Send invoice to customer' })
  send(@Param('id') id: string) {
    return this.invoicesService.send(id);
  }

  @Post(':id/payment')
  @RequirePermissions('invoices:update')
  @ApiOperation({ summary: 'Record a payment against invoice' })
  recordPayment(
    @Param('id') id: string,
    @Body() dto: { amount: number; method: string; reference?: string },
  ) {
    return this.invoicesService.recordPayment(id, dto.amount, dto.method, dto.reference);
  }
}
