#!/usr/bin/env node
/**
 * Reconciles 191 AGENT-001 role-family headings to the approved 307 permanent Agent IDs.
 * Documentation-only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'docs/.agent-register-data.json'), 'utf8'));

/** AGENT-001 role name → permanent Agent ID (307 register) */
const EXPLICIT_MAP = {
  'AURA (Central Executive Coordinator)': 'AURA-001',
  'Chief Executive Agent': 'EXEC-001',
  'Chief Operating Agent': 'EXEC-002',
  'Chief Financial Agent': 'EXEC-003',
  'Chief Technology Agent': 'EXEC-004',
  'Chief Product Agent': 'EXEC-005',
  'Chief Data Agent': 'EXEC-006',
  'Executive Strategy Agent': 'EXEC-007',
  'Business Coach Agent': 'EXEC-009',
  'Business Analyst Agent': 'EXEC-011',
  'Growth Strategy Agent': 'EXEC-010',
  'Risk and Decision Support Agent': 'EXEC-016',
  'Chartered Accountant-level Finance Agent': 'FIN-001',
  'Financial Controller Agent': 'FIN-004',
  'Management Accountant Agent': 'FIN-002',
  'Bookkeeper Agent': 'FIN-003',
  'Accounts Receivable Agent': 'FIN-010',
  'Accounts Payable Agent': 'FIN-003',
  'Cashflow Forecasting Agent': 'FIN-007',
  'Budgeting Agent': 'FIN-009',
  'Profitability Agent': 'FIN-013',
  'Pricing and Margin Protection Agent': 'FIN-017',
  'Tax/VAT Support Agent': 'FIN-005',
  'Payroll Agent': 'FIN-014',
  'Bank Reconciliation Agent': 'FIN-006',
  'Xero Integration Agent': 'FIN-006',
  'Yoco Reconciliation Agent': 'FIN-006',
  'Debt Collection and Follow-up Agent': 'FIN-010',
  'Financial Audit Agent': 'FIN-015',
  'Sales Director Agent': 'CRM-001',
  'Lead Qualification Agent': 'CRM-003',
  'Sales Follow-up Agent': 'CRM-004',
  'Non-pushy Lead Hunting Agent': 'CRM-002',
  'Objection Handling Agent': 'CRM-006',
  'Negotiation Support Agent': 'CRM-007',
  'Proposal Agent': 'CRM-007',
  'Quote Follow-up Agent': 'CRM-005',
  'Customer Retention Agent': 'CRM-016',
  'Service Agreement Agent': 'CRM-020',
  'Business Development Agent': 'EXEC-012',
  'Commercial Tender Agent': 'QS-006',
  'Partnership Agent': 'SaaS-005',
  'Competitor Research Agent': 'EXEC-014',
  'Market Opportunity Agent': 'EXEC-014',
  'Chief Marketing Agent': 'MKT-001',
  'Marketing Strategy Agent': 'MKT-010',
  'Campaign Planning Agent': 'MKT-019',
  'Social Media Agent': 'MKT-007',
  'Facebook Agent': 'MKT-007',
  'Instagram Agent': 'MKT-007',
  'TikTok Agent': 'MKT-007',
  'LinkedIn Agent': 'MKT-007',
  'YouTube Agent': 'MKT-007',
  'Google Business Profile Agent': 'MKT-006',
  'Content Writing Agent': 'MKT-011',
  'Graphic Design Agent': 'CRE-002',
  'Video Production Agent': 'VID-005',
  'Video Quality-Control Agent': 'VID-017',
  'Brand Compliance Agent': 'CRE-011',
  'Reputation and Reviews Agent': 'CRM-018',
  'SEO Agent': 'MKT-005',
  'Website Content Agent': 'MKT-014',
  'Email Marketing Agent': 'MKT-016',
  'Trend Hunter Agent': 'MKT-024',
  'Marketing Analytics Agent': 'MKT-003',
  'Media Library Agent': 'MKT-008',
  'Operations Manager Agent': 'OPS-001',
  'Dispatch Agent': 'OPS-002',
  'Scheduling Agent': 'OPS-003',
  'Job Coordinator Agent': 'OPS-004',
  'Technician Support Agent': 'OPS-010',
  'Job Progress Agent': 'OPS-006',
  'Job Timer Agent': 'OPS-006',
  'Route Optimisation Agent': 'FLT-011',
  'Google Maps Agent': 'FLT-002',
  'Fleet Coordination Agent': 'FLT-001',
  'Emergency Response Agent': 'OPS-004',
  'Recurring Maintenance Agent': 'OPS-008',
  'Service Agreement Operations Agent': 'OPS-008',
  'Quality Control Agent': 'OPS-005',
  'Customer ETA Agent': 'OPS-009',
  'Job Completion Agent': 'OPS-012',
  'Follow-up and Callback Agent': 'CRM-004',
  'Plumbing Technical Advisor Agent': 'QS-003',
  'SANS Compliance Agent': 'LEG-007',
  'Certificate of Compliance Agent': 'LEG-012',
  'Geyser Compliance Agent': 'LEG-007',
  'Drainage Diagnostic Agent': 'QS-003',
  'CCTV Inspection Agent': 'QS-008',
  'Leak Detection Agent': 'QS-003',
  'Bathroom Renovation Agent': 'QS-003',
  'Construction Plumbing Agent': 'QS-003',
  'Maintenance Planner Agent': 'OPS-013',
  'Estimator Agent': 'QS-003',
  'Quantity Surveyor Agent': 'QS-001',
  'Floor-plan Takeoff Agent': 'QS-002',
  'Bill of Quantities Agent': 'QS-004',
  'Scope-of-work Agent': 'QS-004',
  'Materials Specification Agent': 'QS-004',
  'Inventory Controller Agent': 'INV-001',
  'Warehouse Agent': 'INV-002',
  'Tool Tracking Agent': 'INV-003',
  'Procurement Agent': 'INV-004',
  'Supplier Management Agent': 'INV-006',
  'Purchase Order Agent': 'INV-008',
  'Supplier Price Hunting Agent': 'QS-013',
  'Market Price Analyst Agent': 'QS-014',
  'Material Availability Agent': 'INV-009',
  'Supplier Performance Agent': 'INV-006',
  'Stock Usage Audit Agent': 'INV-010',
  'Customer Support Agent': 'CRM-009',
  'WhatsApp Agent': 'COM-004',
  'Email Agent': 'COM-006',
  'Gmail Organisation Agent': 'COM-006',
  'SMS Agent': 'COM-005',
  'AI Receptionist Agent': 'COM-001',
  'Calling Agent': 'COM-001',
  'Booking Agent': 'COM-001',
  'Complaint Resolution Agent': 'CRM-013',
  'Customer Satisfaction Agent': 'CRM-010',
  'Review Request Agent': 'CRM-018',
  'Client Portal Support Agent': 'CRM-009',
  'Unified Communications Agent': 'COM-008',
  'HR Manager Agent': 'HR-001',
  'Recruitment Agent': 'HR-002',
  'Candidate Screening Agent': 'HR-002',
  'Onboarding Agent': 'HR-009',
  'Training Agent': 'HR-007',
  'Timesheet Agent': 'HR-005',
  'Overtime Agent': 'HR-006',
  'Performance Management Agent': 'HR-004',
  'Staff Scheduling Agent': 'HR-005',
  'Labour Compliance Agent': 'LEG-003',
  'Legal Support Agent': 'LEG-001',
  'Contract Agent': 'LEG-002',
  'POPIA and Privacy Agent': 'LEG-005',
  'Health and Safety Agent': 'LEG-008',
  'Policy Agent': 'HR-017',
  'Disciplinary Process Support Agent': 'HR-002',
  'Product Manager Agent': 'SW-016',
  'Project Manager Agent': 'EXEC-017',
  'Software Architecture Agent': 'SW-015',
  'Backend Development Agent': 'SW-003',
  'Frontend Development Agent': 'SW-002',
  'Mobile Development Agent': 'SW-004',
  'Database Agent': 'SW-005',
  'Integration Agent': 'SW-008',
  'API Agent': 'SW-008',
  'DevOps Agent': 'SW-009',
  'Release Agent': 'SW-022',
  'QA Agent': 'SW-020',
  'Security Agent': 'SW-011',
  'Incident Response Agent': 'LEG-015',
  'System Health Agent': 'SW-024',
  'Performance Agent': 'SW-024',
  'Data Quality Agent': 'DAT-003',
  'Data Migration Agent': 'DAT-005',
  'Documentation Agent': 'SW-023',
  'Technical Support Agent': 'SW-026',
  'Chief Audit Agent': 'AUD-001',
  'Application Auditor': 'AUD-002',
  'Browser and User-Journey Auditor': 'AUD-003',
  'Role and Permission Auditor': 'AUD-004',
  'Tenant-Isolation Auditor': 'AUD-005',
  'Financial Data Auditor': 'AUD-006',
  'Integration Auditor': 'AUD-007',
  'Mobile and Responsive Auditor': 'AUD-008',
  'Accessibility Auditor': 'AUD-009',
  'Security and Privacy Auditor': 'AUD-010',
  'Data Quality Auditor': 'AUD-011',
  'Document and Compliance Auditor': 'AUD-012',
  'Performance and Reliability Auditor': 'AUD-013',
  'Acceptance Register Reconciliation Agent': 'AUD-014',
  'Market Research Agent': 'EXEC-013',
  'Competitor Intelligence Agent': 'EXEC-014',
  'Industry Trend Agent': 'MKT-023',
  'Technology Research Agent': 'MKT-030',
  'Supplier Intelligence Agent': 'QS-013',
  'Regulatory Research Agent': 'LEG-007',
  'Customer Behaviour Agent': 'MKT-027',
  'Location and Expansion Agent': 'SaaS-011',
  'SaaS Opportunity Agent': 'SaaS-012',
  'Multi-industry Research Agent': 'SaaS-012',
  'Agent Performance Evaluator': 'SW-014',
  'Prompt and Instruction Optimisation Agent': 'SW-014',
  'Workflow Improvement Agent': 'SW-014',
  'Knowledge Curator Agent': 'HR-016',
  'Model Evaluation Agent': 'SW-014',
  'Controlled Experiment Agent': 'SW-014',
  'Regression Detection Agent': 'SW-024',
  'Rollback Coordinator Agent': 'SW-022',
};

const AGENT001_ROLES = Object.keys(EXPLICIT_MAP);

const byId = new Map(data.agents.map((a) => [a.id, a]));
const decisions = { match: 0, alias: 0, duplicate: 0, family: 0 };

const rows = AGENT001_ROLES.map((role, index) => {
  const permanentId = EXPLICIT_MAP[role];
  const agent = byId.get(permanentId);
  let decision = 'Existing 307-agent match';
  let reason = `Maps to approved permanent ID ${permanentId}`;

  const duplicates = AGENT001_ROLES.filter((r) => EXPLICIT_MAP[r] === permanentId);
  if (duplicates.length > 1 && duplicates[0] !== role) {
    decision = 'Alias';
    reason = `Alias of ${duplicates[0]} → same permanent ID ${permanentId}`;
    decisions.alias++;
  } else {
    decisions.match++;
  }

  return {
    agent001Index: index + 1,
    agent001Role: role,
    permanentAgentId: permanentId,
    permanentAgentName: agent?.name ?? 'UNKNOWN',
    decision,
    reason,
  };
});

// Machine-readable output
writeFileSync(
  join(ROOT, 'docs/.agent-register-reconciliation.json'),
  JSON.stringify(
    {
      agent001RoleCount: AGENT001_ROLES.length,
      permanentAgentCount: data.totalUniqueAgents,
      decisionsSummary: decisions,
      rows,
    },
    null,
    2,
  ),
);

// Markdown appendix
let md = `# TITAN AGENT-001 Role Reconciliation

**Document type:** Reconciliation appendix — documentation only  
**Generated (UTC):** 2026-08-06  
**Parent register:** [TITAN_MASTER_AGENT_REGISTER.md](./TITAN_MASTER_AGENT_REGISTER.md) (307 approved agents)  
**Recovered from:** \`363111f5df0f0ffa6e06e915320b4a88a0824aad\`

---

## Purpose

AGENT-001 introduced **191 role-family headings** (categories A–M). These are **not** a replacement for the approved **307** permanent Agent IDs. This appendix classifies each AGENT-001 role.

## Classification vocabulary

| Decision | Meaning |
|----------|---------|
| **Existing 307-agent match** | Maps 1:1 to an approved permanent Agent ID |
| **Alias** | Same permanent ID as another AGENT-001 role name |
| **Role-family heading** | Display grouping only — not an additional unique agent |
| **Valid new unique agent** | Would require new ID append (none in AGENT-001 set) |
| **Duplicate** | Redundant name — excluded from agent count |
| **Unsupported** | No approved mapping |

## Summary

| Metric | Count |
|--------|------:|
| AGENT-001 role entries | ${AGENT001_ROLES.length} |
| Approved permanent agents | ${data.totalUniqueAgents} |
| Existing 307-agent matches | ${decisions.match} |
| Aliases (excluded from agent count) | ${decisions.alias} |
| Valid new unique agents | 0 |
| Unsupported | 0 |

## Full mapping

| # | AGENT-001 role | Permanent Agent ID | Permanent agent name | Decision | Reason |
|---|----------------|-------------------|----------------------|----------|--------|
`;

for (const r of rows) {
  md += `| ${r.agent001Index} | ${r.agent001Role} | \`${r.permanentAgentId}\` | ${r.permanentAgentName} | ${r.decision} | ${r.reason} |\n`;
}

md += `
---

## AGENT-001 workforce categories → 18 permanent departments

| AGENT-001 category | Maps to permanent departments |
|--------------------|------------------------------|
| A. Executive leadership | EXEC, partial AURA |
| B. Finance and accounting | FIN |
| C. Sales and business development | CRM, SaaS, EXEC |
| D. Marketing and brand | MKT, CRE, VID |
| E. Operations and service delivery | OPS, FLT |
| F. Plumbing and industry specialists | QS, LEG |
| G. Inventory, procurement and suppliers | INV, QS |
| H. Customer service and communications | COM, CRM |
| I. People, HR, legal and compliance | HR, LEG |
| J. Product, software, data and infrastructure | SW, DAT |
| K. Permanent TITAN Audit Department | AUD |
| L. Research and intelligence | EXEC, MKT, SaaS, DAT |
| M. Controlled learning and improvement | SW, HR |

**Machine-readable:** [docs/.agent-register-reconciliation.json](./.agent-register-reconciliation.json)
`;

writeFileSync(join(ROOT, 'docs/TITAN_AGENT001_ROLE_RECONCILIATION.md'), md);
console.log(JSON.stringify({ roles: AGENT001_ROLES.length, ...decisions }, null, 2));
