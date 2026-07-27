import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { CustomersModule } from './modules/customers/customers.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { FleetModule } from './modules/fleet/fleet.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AiModule } from './modules/ai-receptionist/ai.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { WarrantyModule } from './modules/warranty/warranty.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { MultiBranchModule } from './modules/multi-branch/multi-branch.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60') * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT || '100'),
      },
    ]),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    RolesModule,
    CustomersModule,
    PropertiesModule,
    JobsModule,
    BookingsModule,
    DispatchModule,
    FleetModule,
    InventoryModule,
    WarehouseModule,
    SuppliersModule,
    PurchaseOrdersModule,
    QuotesModule,
    InvoicesModule,
    NotificationsModule,
    AuditModule,
    WebhooksModule,
    AiModule,
    MarketingModule,
    ReviewsModule,
    ReferralsModule,
    WarrantyModule,
    MaintenanceModule,
    ReportingModule,
    CommunicationsModule,
    MultiBranchModule,
  ],
})
export class AppModule {}
