import { Controller, Get, Post, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { XeroService } from './xero.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';

@ApiTags('xero')
@Controller('xero')
export class XeroController {
  constructor(private readonly xeroService: XeroService) {}

  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @RequirePermissions('invoices:update')
  @ApiOperation({ summary: 'Get Xero OAuth authorization URL' })
  getAuthUrl() {
    return { url: this.xeroService.getAuthUrl() };
  }

  @Get('callback')
  @ApiOperation({ summary: 'Handle Xero OAuth callback' })
  handleCallback(@Query('code') code: string) {
    return this.xeroService.handleCallback(code);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Xero connection status' })
  getStatus() {
    return this.xeroService.getXeroStatus();
  }

  @Post('sync/invoice/:invoiceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @RequirePermissions('invoices:update')
  @ApiOperation({ summary: 'Sync invoice to Xero' })
  syncInvoice(@Param('invoiceId') invoiceId: string) {
    return this.xeroService.syncInvoiceToXero(invoiceId);
  }

  @Post('sync/contact/:customerId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Sync customer to Xero as contact' })
  syncContact(@Param('customerId') customerId: string) {
    return this.xeroService.syncContactToXero(customerId);
  }
}
