-- UX-B closure: allow workflows to trigger on job.material_used business events (observability
-- for a future stock-decrement automation; this migration does not implement the decrement).
ALTER TYPE "workflow_trigger_type" ADD VALUE IF NOT EXISTS 'job_material_used';
