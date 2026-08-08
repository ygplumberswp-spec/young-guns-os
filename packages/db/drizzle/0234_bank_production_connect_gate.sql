-- Row 116 — Production bank-connect gate audit (hard block by default)

CREATE TABLE IF NOT EXISTS bank_production_connect_gate_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment text NOT NULL,
  status text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  mode text NOT NULL,
  missing_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  bypass_attempted boolean NOT NULL DEFAULT false,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  money_movement integer NOT NULL DEFAULT 0,
  connects_fnb boolean NOT NULL DEFAULT false,
  requests_credentials boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_prod_gate_status_chk CHECK (status IN (
    'BLOCKED','PROVIDER_UNAVAILABLE','EVIDENCE_INCOMPLETE','ALLOWED'
  )),
  CONSTRAINT bank_prod_gate_safety_chk CHECK (
    money_movement = 0
    AND connects_fnb = false
    AND requests_credentials = false
  )
);

CREATE INDEX IF NOT EXISTS bank_prod_gate_company_idx
  ON bank_production_connect_gate_decisions (company_id, created_at DESC);
