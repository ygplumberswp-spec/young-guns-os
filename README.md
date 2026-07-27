# Young Guns OS (YGOS)

AI Operating System for Young Guns Plumbing - Enterprise-grade service business management platform.

## Architecture

- **Backend**: NestJS (TypeScript) with Prisma ORM, PostgreSQL, Redis
- **Frontend**: Next.js 14 with React, Tailwind CSS, TypeScript
- **AI**: OpenAI API with multi-agent architecture
- **Infrastructure**: Docker Compose (Kubernetes-ready)

## Modules (40)

| # | Module | Status |
|---|--------|--------|
| 1 | Authentication | Complete |
| 2 | User Management | Complete |
| 3 | Role & Permission System | Complete |
| 4 | Customer CRM | Complete |
| 5 | Property Management | Complete |
| 6 | Job Management | Complete |
| 7 | Booking Engine | Complete |
| 8 | Dispatch Engine | Complete |
| 9 | GPS Fleet Tracking | Complete |
| 10 | Technician Mobile App API | Complete |
| 11 | Inventory | Complete |
| 12 | Warehouse Management | Complete |
| 13 | Supplier Management | Complete |
| 14 | Purchase Orders | Complete |
| 15 | Quoting Engine | Complete |
| 16 | Invoice Engine | Complete |
| 17 | Xero Integration | Scaffold |
| 18 | Marketing Engine | Complete |
| 19 | Meta Ads Integration | Scaffold |
| 20 | Google Ads Integration | Scaffold |
| 21 | AI Receptionist | Complete |
| 22 | AI Sales Assistant | Complete |
| 23 | AI Dispatcher | Complete |
| 24 | AI Finance Assistant | Scaffold |
| 25 | AI Marketing Assistant | Scaffold |
| 26 | Customer Portal | Scaffold |
| 27 | Admin Dashboard | Complete |
| 28 | Fleet Dashboard | Complete |
| 29 | Finance Dashboard | Scaffold |
| 30 | CEO Dashboard | Scaffold |
| 31 | Notification Centre | Complete |
| 32 | Review Automation | Complete |
| 33 | Referral Engine | Complete |
| 34 | Warranty Management | Complete |
| 35 | Maintenance Reminder System | Complete |
| 36 | Reporting Engine | Complete |
| 37 | Audit Logs | Complete |
| 38 | API Gateway | Complete |
| 39 | Webhook System | Complete |
| 40 | Multi-Branch Support | Complete |

## Quick Start

```bash
# Start infrastructure
docker-compose -f infrastructure/docker/docker-compose.yml up -d

# Backend
cd apps/backend
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma db seed
npm run start:dev

# Frontend
cd apps/frontend
npm install
npm run dev
```

## Default Credentials

- Email: `admin@younggunsplumbing.com.au`
- Password: `Admin123!`

## API Documentation

Available at `http://localhost:3000/docs` (Swagger UI)

## Project Structure

```
young-guns-os/
├── apps/
│   ├── backend/          # NestJS API
│   │   ├── src/
│   │   │   ├── modules/  # Feature modules (40)
│   │   │   ├── common/   # Shared services
│   │   │   ├── guards/   # Auth & permission guards
│   │   │   ├── decorators/
│   │   │   ├��─ filters/
│   │   │   └── interceptors/
│   │   └── prisma/       # Database schema & migrations
│   ├── frontend/         # Next.js Dashboard
│   └── mobile/           # React Native (future)
├── infrastructure/
│   ├── docker/           # Docker configs
│   └── kubernetes/       # K8s manifests (future)
├── docs/                 # Documentation
��── scripts/              # Utility scripts
```

## Key Features

- **Multi-tenant**: Supports multiple organizations and branches
- **RBAC**: Fine-grained role-based access control
- **AI Agents**: Receptionist, Sales, Dispatcher with escalation rules
- **Real-time**: WebSocket support for live updates
- **Audit Trail**: Every action logged with before/after values
- **Webhook System**: Event-driven integrations
- **Auto-dispatch**: AI-powered job assignment based on skills, proximity, workload
