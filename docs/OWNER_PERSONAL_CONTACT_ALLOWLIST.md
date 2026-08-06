# Owner Personal Contact Allowlist

**Status: ⬜ Planned / required — Communications / Personal WhatsApp / Voice / Owner privacy. NOT
started. Do not begin while Xero is active.**

This document records approved scope only. **No implementation exists for this phase and none may be
started yet.** It is written so the work can be picked up later without re-deciding the requirements.

The **Xero Complete Historical Sync & Financial Memory** phase may be active. Do not begin this work
alongside it, and do not touch Xero or Finance work-in-progress files while recording or implementing
this scope. See
[`XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md`](./XERO_COMPLETE_HISTORICAL_SYNC_AND_FINANCIAL_MEMORY.md).

---

## Objective

The Platform Owner keeps a **private allowlist of contacts and groups that TITAN must always treat as
personal**. When a call or WhatsApp message involves an allowlisted contact, TITAN stays out of it:
it does not analyse the conversation for business intent, does not create or update any business
record, does not store the content, and does not expose it to staff, search, analytics, AURA business
memory or AI training.

The Owner uses one phone and one WhatsApp account for both business and personal life. The allowlist
is how the Owner draws that line **explicitly and in advance**, rather than relying on TITAN to guess
correctly after the fact.

**What this is not:**

- **Not a general contact manager.** It is a small, private classification list owned by the Platform
  Owner. Customer and supplier contact data stays in CRM and procurement.
- **Not a replacement for the existing personal/business detection.** Where automatic detection
  already exists in the Personal WhatsApp layer, the allowlist is an **explicit override** that wins
  over any inferred classification. It does not remove the need for honest handling of unlisted
  contacts.
- **Not a staff-visible setting.** It is not part of ordinary company settings, and it is not
  administrable by Admin, Manager or any other role.
- **Not a way to hide business activity from the audit trail.** Classification changes are audited.
  The **content** of private conversations is what is never stored — not the fact that a rule exists
  or changed.
- **Not a new WhatsApp or voice stack.** It extends the existing Communications Platform, Personal
  WhatsApp layer and Voice AI Receptionist.

---

## Global rules

These apply to every part of this phase.

1. **Owner-only.** The list is created, read, changed, exported and deleted by the **Platform Owner
   only**, decided by role — not by permission breadth. A wildcard permission does not grant access.
   Admin, Manager, Dispatcher, Accountant, Staff, Technician and Client are **denied**.
2. **The allowlist wins.** An explicit `ALWAYS PERSONAL` entry overrides any automatic classification,
   any keyword signal, and any business-intent heuristic. There is no "but it looked like a job"
   exception.
3. **Content is never stored for personal contacts.** No transcript, no audio, no message body, no
   attachment, no derived summary. Absence of content is the requirement, not a retention setting.
4. **Minimal technical metadata only.** Where a channel technically cannot function without a
   minimum record (for example a provider message identifier needed for delivery deduplication), only
   that minimum is retained, its necessity is documented, and it is never surfaced as business
   information.
5. **No staff exposure.** Personal contacts, personal conversations and the allowlist itself never
   appear in any staff-facing inbox, timeline, list, export, notification or report.
6. **No AI learning.** Personal conversations never enter AURA business memory, embeddings, search
   indexes, analytics aggregates, model training, or fine-tuning of any kind.
7. **Tenant isolation.** Every allowlist entry, classification decision and audit row is scoped by
   `companyId`. Cross-tenant reads and cross-tenant entry references are **refused, not merged**.
8. **Audit without content.** Every add, edit, remove, reclassification, pause, export and delete is
   recorded via `security_audit_logs` with acting user, company, action and result — and **never**
   with private conversation content.
9. **Encrypted at rest.** Phone numbers, WhatsApp identifiers, contact names, relationship labels and
   notes are stored encrypted, and are never logged, never returned in error messages, and never
   included in diagnostics.
10. **Honest state.** Where a channel cannot enforce the rule (an unsupported provider, a
    disconnected integration, a group whose membership cannot be read), report `unavailable` with the
    reason. **Never claim protection that is not actually enforced.**
11. **Fail closed.** If classification cannot be determined with confidence for a contact that
    matches an allowlist entry ambiguously, treat it as personal and ask the Owner — never default to
    business processing.
12. **Separate commit.** This phase lands as its own commit or series, separate from Xero and from
    any department work.

---

## Existing surface (starting point)

Recorded so implementation begins from fact, not a blank page. Confirm or correct this with
`file:line` evidence before building.

**Already present:**

- A `personal_whatsapp` channel exists in the Communications Platform schema
  (`packages/db/src/schema/communications-platform.ts`).
- A Personal WhatsApp Connection Layer exists (`packages/db/src/schema/personal-whatsapp-connection.ts`
  — `personal_wa_connections`, `personal_wa_connection_events`) with Owner gating, and live Meta Graph
  / device-link pairing recorded as additive.
- **Personal WhatsApp Intelligence (foundation)** and **Communication AURA Intelligence** are
  complete. Communication AURA explicitly **does not source Personal WhatsApp** — the allowlist must
  preserve that boundary and extend it to voice.
- Voice AI Receptionist (Department 9.1) and Call Intelligence Engine (9.2) handle the call path and
  call transcripts. See [`TITAN_PROGRESS.md`](./TITAN_PROGRESS.md).

**The gap this phase closes:**

- There is **no Owner-maintained allowlist** of contacts or groups, and therefore no explicit
  override of automatic personal/business classification.
- There is **no group-level rule** — WhatsApp group IDs cannot currently be marked personal.
- There is **no shared classification decision point** used by both the WhatsApp path and the call
  path, so the two channels cannot be guaranteed to agree.
- There is **no private classification history** visible to the Owner alone.
- There is **no Owner export or delete** of the classification list.

**Related planned scope:**
[`OWNER_VOICE_WHATSAPP_COMMAND_MODE.md`](./OWNER_VOICE_WHATSAPP_COMMAND_MODE.md) covers the Owner's
**remote command** channels — Owner call-in and Owner WhatsApp commands to the business number. This
document covers the opposite concern: **traffic that must never be processed as business at all**.
Both must resolve identity through the same verified Owner identity mapping, and Owner Command Mode
must never be triggered by a conversation with an allowlisted personal contact.
[`AURA_VOICE_THROUGHOUT_TITAN.md`](./AURA_VOICE_THROUGHOUT_TITAN.md) requires every voice interaction
to produce a readable transcript in AURA Chat plus a separate immutable audit record — **the
allowlist is the documented exception to that rule**, and the two documents must be reconciled during
implementation rather than left contradicting each other.
[`SA_FEMALE_RECEPTIONIST_VOICE_STANDARD.md`](./SA_FEMALE_RECEPTIONIST_VOICE_STANDARD.md) governs the
customer-facing voice and is unaffected — a personal call never reaches the receptionist flow.
[`TITAN_WHATSAPP_CONTACT_ENRICHMENT.md`](../TITAN_WHATSAPP_CONTACT_ENRICHMENT.md) enriches existing
customer records from WhatsApp; an allowlisted personal contact must be **excluded from enrichment
entirely** and must never become or update a CRM record.

---

## Supported entry types

An allowlist entry identifies a person or group by **one or more** of the following. Multiple
identifiers may belong to one entry, because the same person reaches the Owner by more than one
route.

| Entry field | Notes |
|-------------|-------|
| **Phone number** | E.164-normalised, with SA local formats accepted on input. Matching is on the normalised value so `082…`, `+2782…` and `002782…` resolve to one entry |
| **WhatsApp number** | The WhatsApp-registered number, which may differ from the voice number for the same person |
| **Saved contact ID** | The identifier of a contact saved on the Owner's device or in the connected account, where the provider exposes one |
| **Contact name** | The human name for the Owner's own reference. **Name alone is never sufficient to match** an inbound call or message — it is display context, not an identifier |
| **WhatsApp group ID** | The provider group identifier, so an entire group is personal regardless of who posts in it |
| **Relationship label** | Free text chosen by the Owner (wife, mother, brother, friend, doctor, school, church group, neighbour) |
| **Optional notes** | Private Owner note. Never shown to staff, never analysed, never indexed |

**Rules:**

- An entry with no usable identifier (name only) is **rejected with an explanation**, not saved as a
  rule that silently never matches.
- Identifier collisions are surfaced: adding a number already held by another entry, or already
  linked to a CRM customer, is reported to the Owner for an explicit decision.
- **A number belonging to a real customer can still be classified personal.** The Owner decides. Where
  this happens, TITAN states the consequence plainly — that customer's calls and messages will no
  longer create business records — so the choice is made knowingly.
- Entries and identifiers can be added and removed individually without recreating the entry.

---

## Classifications

Every entry carries exactly **one** classification.

| Classification | Meaning | Behaviour |
|----------------|---------|-----------|
| **ALWAYS PERSONAL** | Private life. Never business. | Full protection as specified below. No business intent analysis, no records, no content stored, no staff exposure, no AI use |
| **ALWAYS BUSINESS** | A known business contact whose traffic is always business. | Normal business processing under existing rules. Removes ambiguity for a contact that automatic detection keeps getting wrong |
| **ASK OWNER** | Unclear or mixed — the same person is sometimes personal, sometimes business. | **Fails closed to personal handling** while pending: nothing is analysed, recorded or exposed until the Owner answers for that conversation. TITAN asks the Owner privately, once, without exposing content to anyone |
| **BLOCKED / SPAM** | Unwanted. | Never creates a lead, a customer, a job, a quote or a communication record. Never notifies staff. Never enters analytics. May be counted only as a blocked-traffic total with no content and no identity exposed |

**Rules:**

- **Unclassified contacts are not affected by this phase.** They continue under the existing
  Communications and Voice rules. The allowlist changes behaviour only for contacts the Owner has
  listed.
- Reclassifying an entry changes **future** handling. It does not retroactively create business
  records from past personal conversations that were never stored — and TITAN must say so rather than
  implying recoverable history exists.
- Reclassifying **to** personal must offer the Owner an explicit, audited choice about existing
  business records for that contact: leave them, or delete them. Records are never silently removed.

---

## ALWAYS PERSONAL rules

For a contact or group classified `ALWAYS PERSONAL`, **all** of the following are required. Each is a
hard requirement, not a default setting.

1. **No business intent analysis.** The conversation is not scanned, scored, classified, summarised
   or interpreted for job, quote, lead, complaint, emergency or opportunity signals. No agent is
   invoked on it.
2. **No CRM record.** No customer is created, matched, updated or enriched. No lead. No job. No
   quote. No invoice. No appointment.
3. **No communication record.** No entry in the communications inbox, timeline, thread list, activity
   feed or Customer 360 history.
4. **No transcripts, audio, message contents or attachments stored in TITAN.** Not in the database,
   not in file storage, not in caches, not in logs, not in error reports, not in exports, not in
   backups of business tables.
5. **No staff exposure.** Invisible to every non-Owner role in every surface: inboxes, search,
   notifications, dashboards, reports, exports and admin tooling.
6. **No search, analytics or AURA business memory.** Not indexed, not aggregated, not counted in
   communication volumes, response times, sentiment, engagement or any other metric.
7. **No AI training.** Never used for model training, fine-tuning, embeddings, prompt examples,
   evaluation sets or any learning loop, including AURA Evolution / Learning.
8. **No ordinary business-agent access.** No specialist agent, workflow, automation, scheduled job or
   integration sync may read it. This includes the Executive Assistant and Communication AURA.
9. **Minimal technical metadata only where strictly necessary.** Where the channel cannot function
   without a minimal technical record — for example a provider message ID for delivery deduplication,
   or a connection health event — only that minimum is kept, the necessity is documented in code and
   in the implementation report, and it is never presented as business information or joined to
   business data.

**Enforcement requirement:** these rules must be enforced **before** processing, at the earliest
point the sender or caller is identified — not by filtering the results afterwards. A conversation
that has already been analysed and stored has already broken the rule, and deleting it afterwards is
not compliance.

---

## Call handling for known personal contacts

- **Identify before anything else.** The inbound number is matched against the allowlist at the
  earliest point in the call path, before the receptionist flow, before any recording, before any
  transcription and before any customer lookup.
- **No receptionist flow.** A personal caller does not reach the AI receptionist, is not asked
  business qualifying questions, and is not offered booking, quoting or triage.
- **No recording, no transcription, no summary.** No audio is captured or retained, no transcript is
  produced, and no call summary, key points, actions, sentiment or lead extraction is generated.
- **No call record in business modules.** Nothing in Call Intelligence, communications history,
  Customer 360, dashboards or call analytics.
- **Direct handoff to the Owner** per the configured handoff behaviour (see *Owner controls*) —
  straight through to the Owner's personal line or device, without the business path.
- **Owner Command Mode is never triggered** by a personal contact, even if the words spoken resemble
  a business command. Owner commands come from the Owner's own verified identity, not from a personal
  contact's call.
- **Missed and unanswered personal calls** produce no business notification, no staff alert, no
  callback task and no follow-up recommendation. If the Owner wants a private missed-call notice, it
  is Owner-only and content-free.
- **Where the telephony provider cannot suppress recording or transcription**, that is reported
  honestly as `unavailable` with the reason. TITAN must not claim protection the provider does not
  actually give.

---

## WhatsApp handling for personal contacts and groups

- **Classify on arrival**, before the message is read into any business pipeline and before any
  attachment is downloaded or stored.
- **Personal messages stay out of the business inbox.** They do not appear in the Email Centre /
  Communications inbox, thread lists, staff queues or notifications.
- **No content retention.** Message text, voice notes, images, documents, location shares, stickers,
  reactions, contact cards, link previews and any generated thumbnails or OCR output are **not stored
  in TITAN**.
- **No enrichment, no matching, no CRM write.** A personal contact is excluded from WhatsApp customer
  contact enrichment entirely and can never create or update a CRM record. See
  [`TITAN_WHATSAPP_CONTACT_ENRICHMENT.md`](../TITAN_WHATSAPP_CONTACT_ENRICHMENT.md).
- **No AURA reading, prioritisation, sentiment, drafting or reply suggestion.** Communication AURA
  already does not source Personal WhatsApp; this preserves and extends that boundary.
- **Group rules cover the whole group.** An allowlisted group ID makes every message in that group
  personal regardless of sender, including messages from numbers that are also real customers.
  Group name, participant list, group photo and membership changes are likewise not stored as business
  data.
- **Group membership churn does not weaken the rule.** A group stays personal even when participants
  join or leave, and a renamed group is still matched by its group ID.
- **Where a group ID cannot be read** from the provider, the limitation is reported as `unavailable`
  and the Owner is told plainly that group-level protection cannot be guaranteed on that connection.
- **Mixed groups are the Owner's decision, stated plainly.** A family group containing a plumber, or
  a neighbourhood group containing customers, is personal if the Owner lists it — and TITAN states
  that genuine business requests in that group will not be captured.
- **Outbound messages** from the Owner to a personal contact or group are treated the same way: not
  logged as business communications, not counted in metrics, not visible to staff.
- **Never auto-reply.** No automated response, acknowledgement, business signature, out-of-office or
  AI reply is ever sent to a personal contact or group.
- **Blocked / spam senders** create no lead, no customer, no job, no communication record and no
  staff notification.

---

## Owner controls

All controls are Owner-only, in a private Owner-only surface — **not** in ordinary company settings.

| Control | Requirement |
|---------|-------------|
| **Add contact** | Add an entry with any supported identifier, relationship label and optional note. Duplicate and CRM-collision warnings shown before saving |
| **Add group** | Add a WhatsApp group by group ID, with the honest limitation stated where the provider cannot supply one |
| **Remove contact / group** | Remove an entry, with a clear statement of what changes going forward. Removal is audited |
| **Change classification** | Move an entry between `ALWAYS PERSONAL`, `ALWAYS BUSINESS`, `ASK OWNER` and `BLOCKED / SPAM`, with the consequence shown before confirming |
| **Pause a rule** | Temporarily suspend an entry without deleting it — for a chosen period or until resumed — so a contact can be handled as business for a specific reason and then protected again. The pause, its reason and its expiry are Owner-visible and audited |
| **Direct-call handoff** | Configure what happens to a personal call: ring straight through to the Owner, forward to a nominated personal number, or take no business action at all. Configured per entry or as a default |
| **Private classification history** | Owner-only view of every add, edit, reclassification, pause and removal, with who and when. **It shows decisions, never conversation content** |
| **Export the list** | Owner-only export of the entries and their classifications, for the Owner's own records. Access-controlled, audited, and never available to staff |
| **Delete the list** | Owner-only deletion of individual entries or the entire list. Deletion is confirmed, audited, and the consequence — that those contacts return to ordinary business handling — is stated before it happens |
| **Disconnect channel** | Owner-only disconnect of the personal WhatsApp or voice connection, which stops all processing on that channel and reports honestly what remains and what was removed |

**Rules:**

- Every control requires the Owner's authenticated identity plus step-up verification for
  destructive actions (delete list, disconnect channel, bulk reclassification).
- No control silently changes another. Pausing is not removing; removing is not blocking.
- Where an action cannot fully take effect (a provider that keeps its own copy, a pending sync), say
  so explicitly rather than reporting a clean success.

---

## Security

- **Owner-only access**, decided by role. Admin, Manager, Dispatcher, Accountant, Staff, Technician
  and Client are denied at the router gate **and** again in the service, **before any database
  access**. A wildcard permission does not grant entry.
- **Strong authentication** for access, with step-up verification for classification changes,
  export, delete and channel disconnect. A logged-in session alone is not sufficient for destructive
  actions.
- **Encrypted storage.** Numbers, WhatsApp identifiers, contact IDs, names, relationship labels and
  notes are encrypted at rest. Matching is designed so lookup does not require decrypting the whole
  list into logs or memory dumps.
- **Not in ordinary company settings.** The list has no presence in company settings, admin screens,
  configuration studio, tenant setup, onboarding or any staff-reachable surface, and no nav entry
  outside the Owner's private area.
- **No staff access and no cross-tenant access.** Every read, write, match and audit row is scoped by
  `companyId`. Cross-tenant entry IDs and identifiers are refused, not merged. There is no
  support-impersonation path into this list.
- **Audit classification changes without storing private conversation content.** Every add, edit,
  reclassification, pause, resume, removal, export and disconnect is recorded via
  `security_audit_logs` with acting user, company, action, target entry and result — and never with
  message text, audio, attachments or transcripts.
- **Never logged.** Allowlist identifiers and notes are never written to application logs, error
  reports, monitoring traces, analytics events or crash dumps, and never returned to a non-Owner
  client.
- **No production integration is written to by this phase. No deploy. Never touches Yoco `0123`.**

---

## Honesty & failure handling

- **Never claim protection that is not enforced.** Each channel reports whether the rule is actually
  enforceable on that connection, with `available` / `partial` / `unavailable` and a reason.
- **Fail closed.** An ambiguous match, an unreadable group ID, a provider outage or an
  indeterminate classification results in personal handling plus an Owner question — never in
  business processing "just in case".
- **A leak is a defect, not a gap.** Any personal content that reaches a business table, index,
  metric, export or staff surface is a defect and must be reported as one.
- **No silent partial protection.** If content is suppressed on one channel but not another, say
  which, rather than describing the feature as working.
- **Say what was not captured.** Where the Owner asks about a conversation that was protected, TITAN
  answers honestly that no record exists by design — it never fabricates a summary and never implies
  the content is retrievable.
- **No success claim without evidence** — real inbound calls and real WhatsApp messages from
  allowlisted contacts, with verified absence of stored content and verified absence of staff
  visibility.

---

## Acceptance criteria

Each item requires recorded evidence from **real calls and real WhatsApp traffic** on a test
connection, not synthetic fixtures.

| # | Criterion |
|---|-----------|
| A1 | An entry can be created with phone, WhatsApp number, saved contact ID, contact name, group ID, relationship label and note; a name-only entry is refused with an explanation |
| A2 | Number matching is normalisation-safe — local, international and prefixed forms of the same SA number resolve to one entry |
| A3 | All four classifications behave as specified, and `ASK OWNER` fails closed to personal while pending |
| A4 | An `ALWAYS PERSONAL` entry overrides automatic personal/business detection in every case |
| A5 | A real personal call produces no recording, no transcript, no summary, no lead, no customer and no call record anywhere in business modules |
| A6 | A personal caller never reaches the AI receptionist and is never asked business qualifying questions |
| A7 | Direct-call handoff behaviour works as configured, per entry and by default |
| A8 | Owner Command Mode is not triggered by a personal contact's call |
| A9 | A real personal WhatsApp message — text, voice note, image, document — leaves **no content** in the database, file storage, caches, logs or exports |
| A10 | An allowlisted group is fully protected regardless of sender, including senders who are real customers, and survives rename and membership changes |
| A11 | A personal contact is excluded from WhatsApp contact enrichment and cannot create or update a CRM record |
| A12 | No auto-reply, acknowledgement or AI-generated response is ever sent to a personal contact or group |
| A13 | Personal traffic is absent from every staff-facing surface, proven across all non-Owner roles |
| A14 | Personal traffic is absent from search, analytics, communication metrics and AURA business memory |
| A15 | Personal traffic is excluded from AI training, embeddings and AURA Evolution / Learning |
| A16 | No agent, workflow, automation, scheduled job or integration sync can read personal traffic |
| A17 | Enforcement occurs **before** processing — proven by the absence of an analysed-then-deleted intermediate record |
| A18 | Every retained technical metadata field is enumerated, justified as strictly necessary, and never joined to business data |
| A19 | `BLOCKED / SPAM` produces no lead, customer, job, communication record or staff notification |
| A20 | Pause suspends a rule without deleting it, expires as configured, and is visible and audited |
| A21 | Reclassifying to personal offers an explicit, audited choice about existing business records; nothing is silently deleted |
| A22 | Reclassifying does not retroactively fabricate business records from unstored personal history, and TITAN says so |
| A23 | Export and delete are Owner-only, audited, and state their consequences before completing |
| A24 | Channel disconnect stops processing and reports honestly what was removed and what remains |
| A25 | Private classification history shows every decision and **no conversation content** |
| A26 | All seven non-Owner roles are denied at the router gate and again in the service, before any database access |
| A27 | A wildcard permission does not grant access |
| A28 | Step-up verification is required for delete, disconnect and bulk reclassification |
| A29 | Entries are encrypted at rest and appear in no log, error report, monitoring trace or analytics event |
| A30 | The list appears nowhere in company settings or any staff-reachable configuration surface |
| A31 | Every entry, decision and audit row is `companyId` scoped; cross-tenant references are refused |
| A32 | Every add, edit, reclassification, pause, resume, removal, export and disconnect appears in `security_audit_logs` without private content |
| A33 | Each channel honestly reports `available` / `partial` / `unavailable` enforcement, and no unenforceable protection is claimed |
| A34 | Ambiguous or indeterminate classification fails closed to personal and asks the Owner |
| A35 | No fake contacts, groups, relationships or classifications exist anywhere in the delivered feature |

---

## Report requirements

The implementation report for this phase must contain:

1. **Existing-surface audit** — confirmation or correction of the starting point above, with
   `file:line` evidence.
2. **What changed** — files, routes, schema, migration number, commit hashes.
3. **Real traffic evidence** — real calls and real WhatsApp messages from allowlisted contacts and
   groups, with proof of absent content across database, storage, caches, logs, indexes, metrics and
   exports.
4. **Enumerated retained metadata** — every technical field kept for an allowlisted contact, with its
   justification.
5. **Acceptance results** — all 35 items, pass/fail, with evidence for each.
6. **Honest gaps** — what remains partial or unenforceable per channel, and why. Understating a gap
   is a defect.
7. **Reconciliation with [`AURA_VOICE_THROUGHOUT_TITAN.md`](./AURA_VOICE_THROUGHOUT_TITAN.md)** —
   how the always-transcribe / always-audit requirement and this exception coexist.
8. **Confirmation** of: Owner-only access, no staff exposure, no cross-tenant access, no content
   stored, no AI training use, audit intact without private content, Xero and Finance untouched,
   Yoco `0123` untouched, no deploy.

---

## Status

**⬜ Planned / required — Communications / Personal WhatsApp / Voice / Owner privacy. NOT started.
Do not begin while Xero is active.**

- Scope is recorded. **No code has been written for this phase.**
- **Do not begin while the Xero Complete Historical Sync phase is active.** That phase's in-progress
  files must not be touched by this work.
- Extends the Communications Platform `personal_whatsapp` channel, the Personal WhatsApp Connection
  Layer, Personal WhatsApp Intelligence, Voice AI Receptionist (9.1) and Call Intelligence (9.2) — it
  does not replace any of them and does not create a parallel WhatsApp or voice stack.
- Related planned scope:
  [`OWNER_VOICE_WHATSAPP_COMMAND_MODE.md`](./OWNER_VOICE_WHATSAPP_COMMAND_MODE.md),
  [`AURA_VOICE_THROUGHOUT_TITAN.md`](./AURA_VOICE_THROUGHOUT_TITAN.md),
  [`SA_FEMALE_RECEPTIONIST_VOICE_STANDARD.md`](./SA_FEMALE_RECEPTIONIST_VOICE_STANDARD.md). Related
  existing specification:
  [`TITAN_WHATSAPP_CONTACT_ENRICHMENT.md`](../TITAN_WHATSAPP_CONTACT_ENRICHMENT.md).
- When implemented, this phase is committed and reported separately from Xero and department work.
