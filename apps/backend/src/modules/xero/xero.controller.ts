import { Controller, Get, Post, Delete, Query, Param, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { XeroService } from './xero.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';

@ApiTags('xero')
@Controller('xero')
export class XeroController {
  constructor(
    private readonly xeroService: XeroService,
    private readonly configService: ConfigService,
  ) {}

  @Get('auth-url')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @RequirePermissions('invoices:update')
  @ApiOperation({ summary: 'Get Xero OAuth authorization URL' })
  getAuthUrl() {
    return { url: this.xeroService.getAuthUrl() };
  }

  @Get('callback')
  @ApiOperation({ summary: 'Handle Xero OAuth callback' })
  async handleCallback(@Query('code') code: string, @Res() res: Response) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    try {
      await this.xeroService.handleCallback(code);
      res.redirect(`${frontendUrl}/settings?xero=connected`);
    } catch {
      res.redirect(`${frontendUrl}/settings?xero=error`);
    }
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Xero connection status' })
  getStatus() {
    return this.xeroService.getXeroStatus();
  }

  @Post('sync/invoice/:invoiceId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @RequirePermissions('invoices:update')
  @ApiOperation({ summary: 'Sync invoice to Xero' })
  syncInvoice(@Param('invoiceId') invoiceId: string) {
    return this.xeroService.syncInvoiceToXero(invoiceId);
  }

  @Post('sync-invoice/:invoiceId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @RequirePermissions('invoices:update')
  @ApiOperation({ summary: 'Sync invoice to Xero (n8n compatible)' })
  syncInvoiceAlias(@Param('invoiceId') invoiceId: string) {
    return this.xeroService.syncInvoiceToXero(invoiceId);
  }

  @Post('sync/contact/:customerId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Sync customer to Xero as contact' })
  syncContact(@Param('customerId') customerId: string) {
    return this.xeroService.syncContactToXero(customerId);
  }

  @Delete('disconnect')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @RequirePermissions('invoices:update')
  @ApiOperation({ summary: 'Disconnect Xero integration' })
  disconnect() {
    return this.xeroService.disconnect();
  }
}
