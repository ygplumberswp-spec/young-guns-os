-- HR Employee Intelligence — compliance connection (Department 6.1 gap-fill)
-- Adds the 'compliance' AURA insight target so qualification-expiry signals derived
-- from real certifications rows can be handed off to Legal & Compliance for Owner review.
-- Forward-only. No new tables. No fake employees. No fake payroll. No automatic HR actions.

ALTER TYPE hei_insight_target ADD VALUE IF NOT EXISTS 'compliance';
