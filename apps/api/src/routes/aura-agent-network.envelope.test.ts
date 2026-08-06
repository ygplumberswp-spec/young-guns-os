import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
const here=dirname(fileURLToPath(import.meta.url));
const route=readFileSync(join(here,'aura-agent-network.ts'),'utf8');
const service=readFileSync(join(here,'../services/aura-agent-network.service.ts'),'utf8');
describe('AURA Agent Network API safety',()=>{
 it('uses envelopes and technician denial',()=>{assert.ok(route.includes('data:'));assert.ok(route.includes('createDenyTechnicianFromOwnerModules'));});
 it('requires owner and never auto-executes',()=>{assert.ok(service.includes('isCompanyOwnerRole'));assert.ok(service.includes('autoExecuted:false'));assert.ok(!service.includes('autoExecuted:true'));});
 it('blocks Personal WhatsApp private context',()=>{assert.ok(service.includes('isForbiddenContextDomain'));assert.ok(service.includes('Personal WhatsApp private context is forbidden'));});
 it('audits AI and workflow actions',()=>{assert.ok(service.includes('securityAuditLogs'));assert.ok(service.includes("'workflow'"));});
});
