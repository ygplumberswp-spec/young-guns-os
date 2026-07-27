import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

interface XeroTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tenantId: string;
  tenantName?: string;
}

@Injectable()
export class XeroService {
  private readonly logger = new Logger(XeroService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {}

  getAuthUrl(): string {
    const clientId = this.configService.get<string>('XERO_CLIENT_ID');
    const redirectUri = this.configService.get<string>('XERO_REDIRECT_URI');
    const scopes = this.configService.get<string>('XERO_SCOPES');

    if (!clientId || !redirectUri) {
      throw new Error('Xero client ID and redirect URI must be configured');
    }

    return `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes || 'openid profile email accounting.transactions accounting.contacts')}&state=ygos`;
  }

  async handleCallback(code: string): Promise<XeroTokens> {
    const clientId = this.configService.get<string>('XERO_CLIENT_ID');
    const clientSecret = this.configService.get<string>('XERO_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('XERO_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Xero OAuth credentials not configured');
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      this.logger.error(`Xero token exchange failed: ${errorBody}`);
      throw new UnauthorizedException('Failed to exchange Xero authorization code');
    }

    const tokenData = await tokenResponse.json();

    const connectionsResponse = await fetch('https://api.xero.com/connections', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    let tenantId = '';
    let tenantName: string | undefined;
    if (connectionsResponse.ok) {
      const connections = await connectionsResponse.json();
      if (connections.length > 0) {
        tenantId = connections[0].tenantId;
        tenantName = connections[0].tenantName;
      }
    }

    const tokens: XeroTokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      tenantId,
      tenantName,
    };

    await this.redisService.setJson('xero:tokens', tokens, 30 * 24 * 60 * 60);
    this.logger.log('Xero OAuth callback processed successfully');
    return tokens;
  }

  private async getValidTokens(): Promise<XeroTokens> {
    const tokens = await this.redisService.getJson<XeroTokens>('xero:tokens');
    if (!tokens) {
      throw new UnauthorizedException('Xero is not connected. Please authorize first.');
    }

    if (tokens.expiresAt <= Date.now() + 60000) {
      return this.refreshAccessToken(tokens);
    }

    return tokens;
  }

  private async refreshAccessToken(tokens: XeroTokens): Promise<XeroTokens> {
    const clientId = this.configService.get<string>('XERO_CLIENT_ID');
    const clientSecret = this.configService.get<string>('XERO_CLIENT_SECRET');
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      await this.redisService.del('xero:tokens');
      throw new UnauthorizedException('Xero token refresh failed. Please re-authorize.');
    }

    const tokenData = await response.json();

    const newTokens: XeroTokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      tenantId: tokens.tenantId,
    };

    await this.redisService.setJson('xero:tokens', newTokens, 30 * 24 * 60 * 60);
    return newTokens;
  }

  private async xeroApiRequest(method: string, path: string, body?: unknown): Promise<any> {
    const tokens = await this.getValidTokens();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Xero-Tenant-Id': tokens.tenantId,
    };

    const response = await fetch(`https://api.xero.com/api.xro/2.0${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Xero API error [${method} ${path}]: ${response.status} ${errorBody}`);
      throw new Error(`Xero API request failed: ${response.status}`);
    }

    return response.json();
  }

  async syncInvoiceToXero(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { customer: true, items: true },
    });

    if (!invoice) return null;

    const xeroInvoice = {
      Type: 'ACCREC',
      Contact: {
        ...(invoice.customer.xeroContactId
          ? { ContactID: invoice.customer.xeroContactId }
          : { Name: `${invoice.customer.firstName} ${invoice.customer.lastName}` }),
      },
      LineItems: invoice.items.map((item) => ({
        Description: item.description,
        Quantity: item.quantity,
        UnitAmount: Number(item.unitPrice),
        AccountCode: item.isLabour ? '200' : '210',
        TaxType: 'OUTPUT',
      })),
      Date: invoice.createdAt.toISOString().split('T')[0],
      DueDate: invoice.dueDate.toISOString().split('T')[0],
      Reference: invoice.invoiceNumber,
      Status: 'AUTHORISED',
    };

    const result = await this.xeroApiRequest('POST', '/Invoices', {
      Invoices: [xeroInvoice],
    });

    if (result.Invoices?.[0]?.InvoiceID) {
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { xeroInvoiceId: result.Invoices[0].InvoiceID },
      });
    }

    this.logger.log(`Synced invoice ${invoiceId} to Xero`);
    return result.Invoices?.[0];
  }

  async syncContactToXero(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return null;

    const xeroContact = {
      Name: customer.companyName || `${customer.firstName} ${customer.lastName}`,
      FirstName: customer.firstName,
      LastName: customer.lastName,
      EmailAddress: customer.email,
      Phones: [{ PhoneType: 'DEFAULT', PhoneNumber: customer.phone }],
    };

    const result = await this.xeroApiRequest('POST', '/Contacts', {
      Contacts: [xeroContact],
    });

    if (result.Contacts?.[0]?.ContactID) {
      await this.prisma.customer.update({
        where: { id: customerId },
        data: { xeroContactId: result.Contacts[0].ContactID },
      });
    }

    this.logger.log(`Synced customer ${customerId} to Xero`);
    return result.Contacts?.[0];
  }

  async getXeroStatus(): Promise<{ connected: boolean; tenantId?: string; tenantName?: string }> {
    const tokens = await this.redisService.getJson<XeroTokens>('xero:tokens');
    return {
      connected: !!tokens,
      tenantId: tokens?.tenantId,
      tenantName: tokens?.tenantName,
    };
  }

  async disconnect(): Promise<void> {
    await this.redisService.del('xero:tokens');
    this.logger.log('Xero disconnected');
  }
}
