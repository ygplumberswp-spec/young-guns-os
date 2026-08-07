-- payments.yoco_payment_id has been declared in the Drizzle schema since the Yoco Checkout
-- webhook work, but no migration ever created it. Every Drizzle query against `payments`
-- selects the column, so finance payments, mission control and the Xero payment import all
-- failed with "column payments.yoco_payment_id does not exist" once they ran against a
-- database built purely from this migration chain.

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "yoco_payment_id" text;
