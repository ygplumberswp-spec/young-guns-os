-- LIVE-001E — WhatsApp inbound idempotency (partial unique indexes)
-- Does NOT delete, rewrite, re-date, or relink historical WhatsApp rows.
-- If duplicate external_message_id groups already exist, unique index creation is skipped
-- (reported via NOTICE) so historical data remains intact for Owner review.

DO $$
DECLARE
  wa_dupes integer;
  hub_dupes integer;
BEGIN
  SELECT COUNT(*)::int INTO wa_dupes FROM (
    SELECT company_id, external_message_id
    FROM whatsapp_messages
    WHERE external_message_id IS NOT NULL
    GROUP BY company_id, external_message_id
    HAVING COUNT(*) > 1
  ) d;

  IF wa_dupes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_company_external_uidx
      ON whatsapp_messages (company_id, external_message_id)
      WHERE external_message_id IS NOT NULL;
  ELSE
    RAISE NOTICE
      'LIVE-001E: skipped whatsapp_messages unique index — % duplicate external_message_id group(s) exist (not auto-cleaned)',
      wa_dupes;
  END IF;

  SELECT COUNT(*)::int INTO hub_dupes FROM (
    SELECT company_id, account_kind, external_message_id
    FROM comm_platform_inbox_index
    WHERE external_message_id IS NOT NULL
    GROUP BY company_id, account_kind, external_message_id
    HAVING COUNT(*) > 1
  ) d;

  IF hub_dupes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS comm_platform_inbox_company_kind_external_uidx
      ON comm_platform_inbox_index (company_id, account_kind, external_message_id)
      WHERE external_message_id IS NOT NULL;
  ELSE
    RAISE NOTICE
      'LIVE-001E: skipped hub unique index — % duplicate external_message_id group(s) exist (not auto-cleaned)',
      hub_dupes;
  END IF;
END $$;
