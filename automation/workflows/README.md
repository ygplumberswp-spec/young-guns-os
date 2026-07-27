# YGOS n8n Workflow Automations

Import these JSON files directly into n8n. Each workflow is self-contained and uses the YGOS API.

## Prerequisites

Set the following n8n environment variables:
- `YGOS_API_URL` - Base URL of the YGOS backend (e.g., `https://api.younggunsplumbing.com.au`)
- `YGOS_REVIEW_URL` - Customer review portal URL

Create a credential named **"YGOS API Auth"** (HTTP Header Auth) with your API key.

## Workflows

| # | File | Trigger | Description |
|---|------|---------|-------------|
| 01 | quote-follow-up | Hourly | Detects quotes >48h without response, triggers AI sales follow-up |
| 02 | technician-delay-notification | Webhook | Auto-notifies customer when technician is >15min late, escalates at 45min |
| 03 | low-stock-purchase-request | Every 6h | Detects low stock, groups by supplier, creates draft POs |
| 04 | overdue-invoice-debtor-workflow | 9am weekdays | Escalation ladder: SMS → email → final notice → debt collection |
| 05 | job-complete-auto-invoice | Webhook | Auto-generates invoice from completed job, syncs to Xero |
| 06 | review-request-after-job | Daily 10am | Sends review request SMS 24-48h after job completion |
| 07 | vehicle-service-due-alert | Monday 7am | Weekly check for vehicles needing service, urgency classification |
| 08 | maintenance-reminder-workflow | Weekday 8am | Sends maintenance reminders to customers 14 days before due |
| 09 | new-customer-welcome | Webhook | Welcome SMS + email + referral code generation for new customers |
| 10 | marketing-campaign-monitor | Weekday 6pm | Monitors campaign KPIs, alerts on poor performance |
| 11 | new-booking-to-job | Webhook | Converts confirmed booking → job → AI auto-dispatch → customer SMS |
| 12 | daily-operations-summary | Weekday 5pm | End-of-day report: jobs, revenue, overdue, ratings |
| 13 | ai-receptionist-inbound-call | Webhook | Routes inbound calls through AI, escalates to human when needed |
| 14 | warranty-expiry-notification | Monthly 1st | Notifies customers of expiring warranties, flags upsell opportunities |

## Webhook Endpoints

Configure these webhooks in your telephony/system integrations:

- `POST /webhook/ygos/technician-delay` - Body: `{ jobId, delayMinutes }`
- `POST /webhook/ygos/job-completed` - Body: `{ jobId }`
- `POST /webhook/ygos/new-customer` - Body: `{ customerId }`
- `POST /webhook/ygos/booking-confirmed` - Body: `{ bookingId }`
- `POST /webhook/ygos/inbound-call` - Body: `{ callerNumber, callType }`
