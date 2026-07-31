import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPostgresClientOptions,
  sanitizeDbError,
  summarizeDatabaseUrl,
} from './connection-options.js';

describe('summarizeDatabaseUrl', () => {
  it('detects Supabase direct hosts', () => {
    const summary = summarizeDatabaseUrl(
      'postgresql://postgres:secret@db.abc123.supabase.co:5432/postgres',
    );
    assert.equal(summary.isSupabaseDirect, true);
    assert.equal(summary.isSupabasePooler, false);
    assert.equal(summary.host, 'db.abc123.supabase.co');
    assert.equal(summary.port, 5432);
  });

  it('detects Supabase pooler hosts', () => {
    const summary = summarizeDatabaseUrl(
      'postgresql://postgres.abc:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require',
    );
    assert.equal(summary.isSupabasePooler, true);
    assert.equal(summary.isSupabaseDirect, false);
    assert.equal(summary.port, 6543);
    assert.equal(summary.sslmode, 'require');
  });
});

describe('buildPostgresClientOptions', () => {
  it('requires SSL and disables prepare for pooler hosts', () => {
    const options = buildPostgresClientOptions(
      'postgresql://postgres.abc:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
    );
    assert.equal(options.ssl, 'require');
    assert.equal(options.prepare, false);
  });

  it('does not force SSL for localhost', () => {
    const options = buildPostgresClientOptions(
      'postgresql://titan:titan@localhost:5432/titan_aura',
    );
    assert.equal(options.ssl, undefined);
    assert.equal(options.prepare, undefined);
  });
});

describe('sanitizeDbError', () => {
  it('redacts connection strings and passwords', () => {
    const sanitized = sanitizeDbError(
      new Error('connect ENETUNREACH postgresql://postgres:hunter2@db.x.supabase.co:5432/postgres'),
    );
    assert.match(sanitized.message, /REDACTED/);
    assert.doesNotMatch(sanitized.message, /hunter2/);
    assert.doesNotMatch(sanitized.message, /postgresql:\/\//);
  });
});
