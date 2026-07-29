-- Enterprise Business Evolution, Learning & Continuous Improvement Platform

ALTER TYPE agent_key ADD VALUE IF NOT EXISTS 'business_evolution';

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bev_experiment_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bev_improvement_plan';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bev_maturity_assessment';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bev_benefit_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bev_lessons_learned';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bev_executive_summary';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bev_hypothesis';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bev_process_report';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'draft_bev_agent_improvement';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bev_workflow_status') THEN
    CREATE TYPE bev_workflow_status AS ENUM (
      'draft',
      'review',
      'pending_approval',
      'approved',
      'executed',
      'cancelled',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bev_learning_stage') THEN
    CREATE TYPE bev_learning_stage AS ENUM (
      'observed',
      'analyzed',
      'hypothesized',
      'reviewed',
      'approved_for_testing',
      'tested',
      'measured',
      'validated',
      'rejected',
      'published',
      'monitored',
      'retired'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bev_risk_level') THEN
    CREATE TYPE bev_risk_level AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bev_alert_severity') THEN
    CREATE TYPE bev_alert_severity AS ENUM ('info', 'warning', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bev_alert_status') THEN
    CREATE TYPE bev_alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bev_experiment_status') THEN
    CREATE TYPE bev_experiment_status AS ENUM (
      'draft',
      'review',
      'risk_assessment',
      'approved',
      'scheduled',
      'active',
      'paused',
      'completed',
      'measured',
      'validated',
      'rejected',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bev_recommendation_status') THEN
    CREATE TYPE bev_recommendation_status AS ENUM (
      'created',
      'viewed',
      'accepted',
      'rejected',
      'deferred',
      'approved',
      'implemented',
      'failed',
      'rolled_back',
      'measured',
      'validated'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bev_feedback_rating') THEN
    CREATE TYPE bev_feedback_rating AS ENUM (
      'accurate',
      'inaccurate',
      'useful',
      'not_useful',
      'missing_evidence',
      'wrong_priority',
      'wrong_explanation',
      'unsafe',
      'duplicate',
      'needs_correction',
      'custom'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bev_platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  learning_governance JSONB NOT NULL DEFAULT '{}',
  experiment_safety_defaults JSONB NOT NULL DEFAULT '{}',
  evaluation_templates JSONB NOT NULL DEFAULT '{}',
  aggregation_thresholds JSONB NOT NULL DEFAULT '{}',
  cross_tenant_privacy_rules JSONB NOT NULL DEFAULT '{}',
  agent_improvement_standards JSONB NOT NULL DEFAULT '{}',
  autonomous_allowlist JSONB NOT NULL DEFAULT '{}',
  rollback_requirements JSONB NOT NULL DEFAULT '{}',
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  recommendation_thresholds JSONB NOT NULL DEFAULT '{}',
  learning_scope JSONB NOT NULL DEFAULT '{}',
  data_sources JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  observation_key TEXT NOT NULL,
  source_module TEXT,
  observation_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  learning_stage bev_learning_stage NOT NULL DEFAULT 'observed',
  source_entity_type TEXT,
  source_entity_id UUID,
  evidence JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pattern_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  learning_stage bev_learning_stage NOT NULL DEFAULT 'analyzed',
  confidence_score NUMERIC(5, 2),
  frequency INTEGER NOT NULL DEFAULT 0,
  business_impact TEXT,
  affected_modules JSONB NOT NULL DEFAULT '{}',
  possible_causes JSONB NOT NULL DEFAULT '{}',
  limitations JSONB NOT NULL DEFAULT '{}',
  evidence JSONB NOT NULL DEFAULT '{}',
  time_period_start TIMESTAMPTZ,
  time_period_end TIMESTAMPTZ,
  data_freshness_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  hypothesis_key TEXT NOT NULL,
  title TEXT NOT NULL,
  problem_statement TEXT,
  proposed_change TEXT,
  expected_outcome TEXT,
  supporting_evidence JSONB NOT NULL DEFAULT '{}',
  risk_level bev_risk_level NOT NULL DEFAULT 'medium',
  affected_users JSONB NOT NULL DEFAULT '{}',
  required_approvals JSONB NOT NULL DEFAULT '{}',
  measurement_method TEXT,
  success_criteria TEXT,
  rollback_plan TEXT,
  learning_stage bev_learning_stage NOT NULL DEFAULT 'hypothesized',
  pattern_id UUID REFERENCES bev_patterns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  recommendation_key TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  expected_benefit TEXT,
  expected_cost TEXT,
  confidence_score NUMERIC(5, 2),
  required_effort TEXT,
  risk_level bev_risk_level NOT NULL DEFAULT 'medium',
  dependencies JSONB NOT NULL DEFAULT '{}',
  supporting_evidence JSONB NOT NULL DEFAULT '{}',
  recommended_owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  measurement_plan TEXT,
  rollback_plan TEXT,
  workflow_status bev_recommendation_status NOT NULL DEFAULT 'created',
  hypothesis_id UUID REFERENCES bev_hypotheses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_recommendation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL REFERENCES bev_recommendations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  decision_reason TEXT,
  reviewing_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  implementation_owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expected_outcome TEXT,
  actual_outcome TEXT,
  variance TEXT,
  lessons_learned TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  experiment_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  experiment_type TEXT NOT NULL,
  workflow_status bev_experiment_status NOT NULL DEFAULT 'draft',
  risk_level bev_risk_level NOT NULL DEFAULT 'medium',
  control_group JSONB NOT NULL DEFAULT '{}',
  test_group JSONB NOT NULL DEFAULT '{}',
  eligible_records JSONB NOT NULL DEFAULT '{}',
  exclusions JSONB NOT NULL DEFAULT '{}',
  success_metrics JSONB NOT NULL DEFAULT '{}',
  failure_thresholds JSONB NOT NULL DEFAULT '{}',
  stop_conditions JSONB NOT NULL DEFAULT '{}',
  spending_limit_cents INTEGER,
  safety_controls JSONB NOT NULL DEFAULT '{}',
  hypothesis_id UUID REFERENCES bev_hypotheses(id) ON DELETE SET NULL,
  recommendation_id UUID REFERENCES bev_recommendations(id) ON DELETE SET NULL,
  scheduled_start_at TIMESTAMPTZ,
  scheduled_end_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  experiment_id UUID REFERENCES bev_experiments(id) ON DELETE SET NULL,
  recommendation_id UUID REFERENCES bev_recommendations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  baseline_metrics JSONB NOT NULL DEFAULT '{}',
  after_metrics JSONB NOT NULL DEFAULT '{}',
  control_metrics JSONB NOT NULL DEFAULT '{}',
  operational_impact TEXT,
  financial_impact_cents INTEGER,
  customer_impact TEXT,
  workforce_impact TEXT,
  compliance_impact TEXT,
  side_effects JSONB NOT NULL DEFAULT '{}',
  statistical_confidence NUMERIC(5, 2),
  learning_stage bev_learning_stage NOT NULL DEFAULT 'measured',
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  feedback_rating bev_feedback_rating NOT NULL,
  feedback_text TEXT,
  submitted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_agent_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL,
  task_volume INTEGER NOT NULL DEFAULT 0,
  success_rate NUMERIC(5, 2),
  failure_rate NUMERIC(5, 2),
  approval_rate NUMERIC(5, 2),
  rejection_rate NUMERIC(5, 2),
  correction_rate NUMERIC(5, 2),
  avg_latency_ms INTEGER,
  tool_failure_count INTEGER NOT NULL DEFAULT 0,
  policy_violation_count INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  provider_key TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_agent_improvements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL,
  improvement_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  workflow_status bev_workflow_status NOT NULL DEFAULT 'draft',
  version_label TEXT,
  change_reason TEXT,
  security_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  staging_test_required BOOLEAN NOT NULL DEFAULT FALSE,
  performance_before JSONB NOT NULL DEFAULT '{}',
  performance_after JSONB NOT NULL DEFAULT '{}',
  rollback_version_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_prompt_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL,
  policy_key TEXT NOT NULL,
  version_label TEXT NOT NULL,
  content TEXT NOT NULL,
  change_reason TEXT,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  effective_at TIMESTAMPTZ,
  rollback_version_label TEXT,
  performance_before JSONB NOT NULL DEFAULT '{}',
  performance_after JSONB NOT NULL DEFAULT '{}',
  workflow_status bev_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_ai_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  evaluation_key TEXT NOT NULL,
  evaluation_type TEXT NOT NULL,
  dataset_ref TEXT,
  metrics JSONB NOT NULL DEFAULT '{}',
  workflow_status bev_workflow_status NOT NULL DEFAULT 'draft',
  evaluated_at TIMESTAMPTZ,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_knowledge_reinforcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lesson_title TEXT NOT NULL,
  lesson_content TEXT NOT NULL,
  knowledge_node_ref TEXT,
  linked_entities JSONB NOT NULL DEFAULT '{}',
  validated_at TIMESTAMPTZ,
  validated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  learning_stage bev_learning_stage NOT NULL DEFAULT 'validated',
  source_outcome_id UUID REFERENCES bev_outcomes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_process_mining_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process_key TEXT NOT NULL,
  title TEXT NOT NULL,
  actual_path JSONB NOT NULL DEFAULT '{}',
  expected_path JSONB NOT NULL DEFAULT '{}',
  bottlenecks JSONB NOT NULL DEFAULT '{}',
  rework_loops JSONB NOT NULL DEFAULT '{}',
  deviations JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_strategic_roadmap_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  theme_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  workflow_status bev_workflow_status NOT NULL DEFAULT 'draft',
  expected_outcomes JSONB NOT NULL DEFAULT '{}',
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  dependencies JSONB NOT NULL DEFAULT '{}',
  budget_cents INTEGER,
  milestones JSONB NOT NULL DEFAULT '{}',
  progress_percent NUMERIC(5, 2),
  benefit_realized_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_maturity_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  framework_key TEXT NOT NULL,
  domain TEXT NOT NULL,
  criteria JSONB NOT NULL DEFAULT '{}',
  evidence JSONB NOT NULL DEFAULT '{}',
  score NUMERIC(5, 2),
  scoring_method TEXT,
  reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  confidence_score NUMERIC(5, 2),
  gaps JSONB NOT NULL DEFAULT '{}',
  recommended_steps JSONB NOT NULL DEFAULT '{}',
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_continuous_improvement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  workflow_status bev_workflow_status NOT NULL DEFAULT 'draft',
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expected_benefit TEXT,
  evidence JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_autonomous_optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  optimization_key TEXT NOT NULL,
  allowlist_key TEXT,
  title TEXT NOT NULL,
  description TEXT,
  workflow_status bev_workflow_status NOT NULL DEFAULT 'draft',
  risk_level bev_risk_level NOT NULL DEFAULT 'medium',
  rollback_plan TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  output JSONB NOT NULL DEFAULT '{}',
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_evolution_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity bev_alert_severity NOT NULL DEFAULT 'warning',
  status bev_alert_status NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  source_module TEXT,
  incident_id UUID,
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_records JSONB NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_status bev_workflow_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metrics JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bev_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
