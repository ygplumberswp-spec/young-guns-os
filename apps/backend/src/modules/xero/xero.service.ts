import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

interface XeroTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tenantId: string;
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

    return `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri!)}&scope=${encodeURIComponent(scopes!)}&state=ygos`;
  }

  async handleCallback(code: string): Promise<XeroTokens> {
    const clientId = this.configService.get<string>('XERO_CLIENT_ID');
    const clientSecret = this.configService.get<string>('XERO_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('XERO_REDIRECT_URI');

    // In production: exchange code for tokens via Xero OAuth2
    const tokens: XeroTokens = {
      accessToken: 'placeholder',
      refreshToken: 'placeholder',
      expiresAt: Date.now() + 1800000,
      tenantId: 'placeholder',
    };

    await this.redisService.setJson('xero:tokens', tokens, 1800);
    this.logger.log('Xero OAuth callback processed');
    return tokens;
  }

  async syncInvoiceToXero(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { customer: true, items: true },
    });

    if (!invoice) return null;

    // Map to Xero invoice format
    const xeroInvoice = {
      Type: 'ACCREC',
      Contact: {
        ContactID: invoice.customer.xeroContactId,
        Name: `${invoice.customer.firstName} ${invoice.customer.lastName}`,
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

    // In production: POST to Xero API
    this.logger.log(`Syncing invoice ${invoiceId} to Xero`);

    return xeroInvoice;
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

    // In production: POST/PUT to Xero API
    this.logger.log(`Syncing customer ${customerId} to Xero`);

    return xeroContact;
  }

  async getXeroStatus(): Promise<{ connected: boolean; tenantId?: string; lastSync?: Date }> {
    const tokens = await this.redisService.getJson<XeroTokens>('xero:tokens');
    return {
      connected: !!tokens && tokens.expiresAt > Date.now(),
      tenantId: tokens?.tenantId,
    };
  }
}
