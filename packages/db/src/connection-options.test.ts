import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPostgresClientOptions,
  resolveDbPoolMax,
  sanitizeDbError,
  SESSION_POOLER_DB_POOL_MAX,
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

describe('resolveDbPoolMax', () => {
  const previous = process.env.DB_POOL_MAX;

  function restorePoolMaxEnv() {
    if (previous === undefined) delete process.env.DB_POOL_MAX;
    else process.env.DB_POOL_MAX = previous;
  }

  it('caps session-mode Supabase pooler below typical pool_size 15', () => {
    delete process.env.DB_POOL_MAX;
    try {
      assert.equal(
        resolveDbPoolMax(
          'postgresql://postgres.abc:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
        ),
        SESSION_POOLER_DB_POOL_MAX,
      );
    } finally {
      restorePoolMaxEnv();
    }
  });

  it('keeps a higher default for transaction-mode pooler and localhost', () => {
    delete process.env.DB_POOL_MAX;
    try {
      assert.equal(
        resolveDbPoolMax(
          'postgresql://postgres.abc:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
        ),
        8,
      );
      assert.equal(resolveDbPoolMax('postgresql://titan:titan@localhost:5432/titan_aura'), 8);
    } finally {
      restorePoolMaxEnv();
    }
  });

  it('honors DB_POOL_MAX when in range', () => {
    process.env.DB_POOL_MAX = '2';
    try {
      assert.equal(
        resolveDbPoolMax(
          'postgresql://postgres.abc:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
        ),
        2,
      );
    } finally {
      restorePoolMaxEnv();
    }
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
