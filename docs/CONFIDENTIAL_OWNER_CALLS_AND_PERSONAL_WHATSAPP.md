# Confidential Owner Calls & Personal WhatsApp Workflow

**Status: ⬜ Planned / required for TITAN V1.0 — NOT started, no implementation exists.**

This document records approved scope only. **No code has been written for this feature and none may
be started yet.** It is written so the work can be picked up in the correct phase without
re-deciding the requirements.

Do **not** implement this in parallel with the Xero Complete Historical Sync phase or any other
major phase. When it is implemented it is committed and reported **separately** from department
work, and only after explicit Owner approval to begin.

**Privacy note:** the Owner phone number is intentionally recorded in this document as the
configured Owner contact for this feature. Treat it as **sensitive configuration scope** — it is
recorded here because the feature cannot be specified or verified without it, not as general
business content.

---

## Purpose

The Owner's phone number is used for **both business and personal life**. Today that single number
carries Young Guns work calls, Young Guns WhatsApp threads, and entirely private family, medical,
financial and social conversations in the same place.

TITAN must be able to help with the **business** side of that number — answering business calls the
Owner cannot take, capturing what the caller needs, linking it to the right customer, job, quote or
lead, and surfacing it to the Owner — while treating the **personal** side as private and
off-limits to the business, to staff, and to the platform's business intelligence.

The single non-negotiable outcome: **business gets handled, personal stays private.** A feature that
handles business calls well but leaks one personal conversation has failed.

**Explicitly out of scope:**

- **No new receptionist.** The existing Voice AI Receptionist (Department 9.1, migration `0153`) is
  extended, not replaced.
- **No new WhatsApp stack.** The existing Communications Platform (`0121`), Personal WhatsApp
  Intelligence (`0127`) and Personal WhatsApp Connection Layer (`0131`) are extended, not replaced.
- **No new AURA, approval queue or audit system.** Existing AURA orchestration, the existing
  approval queue and `security_audit_logs` are used.
- **No unlawful or unsupported WhatsApp access** (see *Lawful methods only* below).
- **No personal-life intelligence product.** TITAN never analyses, scores, summarises or reports on
  the Owner's personal conversations.

---

## Owner contact configuration

| Field | Value |
|-------|-------|
| Owner mobile (local format) | `066 234 6301` |
| Owner mobile (E.164 / international) | `+27 66 234 6301` |
| Usage | **Dual** — personal and business on the same number |
| Classification | Sensitive configuration, Owner-only visibility |

Requirements:

- The number is stored as **configuration**, not as a customer record, not as a lead, and not as a
  CRM contact. It must never appear in a customer list, marketing list, campaign audience, export
  or report.
- Both formats must resolve to the same Owner identity. Number normalisation must handle `066…`,
  `+2766…`, `002766…` and spacing/punctuation variants without creating a second identity.
- Only the Platform Owner may view or change this configuration. Every read and change is audited.
- The number is scoped to the company like all other data (`companyId`) and is never shared across
  tenants.

---

## Lawful methods only

This feature may only be built on **lawful, provider-supported methods**.

Permitted:

- Official telephony providers for the call path.
- The official WhatsApp Business Platform / Meta Graph API for business messaging, within its
  documented capabilities and policies.
- Any officially supported device-link or pairing mechanism that the provider offers and that the
  Owner explicitly authorises for their own number.
- Owner-initiated, Owner-visible forwarding, routing and voicemail arrangements offered by the
  Owner's own carrier.

Forbidden, without exception:

- **No unofficial WhatsApp automation.** No unofficial libraries, reverse-engineered clients, or
  automation of the personal WhatsApp app.
- **No scraping** of WhatsApp web, desktop or mobile interfaces.
- **No session hijacking**, credential reuse, QR-session theft, token extraction or impersonation of
  the Owner's WhatsApp session.
- **No circumvention** of WhatsApp / Meta terms of service, rate limits or policy controls.
- **No silent interception** of the Owner's personal messages by any means.

Honesty requirements:

- Every capability in this document must **document its real limitation** against what the provider
  actually supports. Where the provider does not support a capability, the limitation is recorded in
  the doc and shown honestly in the Owner UI as `unavailable` with the reason — it is not worked
  around.
- **Nothing may be claimed to work until it is verified** against a real provider account with real
  traffic. A page, a nav label, a mocked test, a green badge or a plausible implementation is
  **never** evidence. Unverified capabilities stay marked unverified.
- Where the lawful path can only achieve part of the intent, the partial capability is delivered and
  labelled partial. Overstating a capability is a defect.

---

## Scope areas

This feature is delivered across existing areas. Each is an extension of what already exists.

| # | Area | What this feature adds |
|---|------|------------------------|
| 1 | **Personal WhatsApp Connection Layer** (`0127` / `0131`) | Owner-number pairing within provider-supported limits, personal/business separation at the connection boundary, honest capability and testing matrix |
| 2 | **Voice AI Receptionist** (Dept 9.1, `0153`) | Confidential call handling for the Owner's dual-use number, disclosure greeting, classification, disengagement, Owner Call-In Mode |
| 3 | **Communication AURA** (`0132`) | Business-only prioritisation, drafts and summaries; hard exclusion of personal content from every AURA input |
| 4 | **Owner Command Centre** (`aura-command-centre` `0133`, Executive Command Centre `0166`) | Owner-only confidential view, overrides, classification corrections, allowlist management |
| 5 | **CX / Customer 360** | Business call and message outcomes linked to the real customer where a confident match exists |
| 6 | **Jobs / Leads** | Business calls that are work requests become draft jobs, quote requests or leads for approval — never auto-created from an uncertain call |
| 7 | **Documents** | Business attachments received on the Owner's number are filed as business documents; personal media is never ingested |
| 8 | **Finance** | Business payment and invoice discussions are surfaced as follow-ups only; no ledger write, no Xero write, no payment from a call or message |
| 9 | **Security & Privacy** | Classification enforcement, confidentiality boundary, consent and recording compliance, RBAC, tenant isolation, full audit, fail-safe defaults |

Call Intelligence Engine (Dept 9.2, `0156`) consumes **business** call records from this path under
the same privacy gates it already applies. It must never receive personal call content.

---

## Classification

Every inbound interaction on the Owner's number is assigned **exactly one** classification. There
is no unclassified state and no default of `BUSINESS`.

| Classification | Meaning | Default handling |
|----------------|---------|------------------|
| **BUSINESS** | Young Guns work — customer, supplier, staff, quote, job, account, complaint | Full business handling: collect details, take notes, connect to records, surface to Owner |
| **PERSONAL** | Private life — family, friends, medical, financial, legal, social, anything not Young Guns | Disengage politely, hand off to the Owner, record **nothing** beyond a minimal technical exclusion record |
| **UNCERTAIN** | Cannot be established with confidence which of the two it is | Ask a single clarifying question; if still unresolved, treat as **PERSONAL** |
| **OWNER COMMAND** | The verified Owner themselves, commanding the business | Owner Command Mode per [`OWNER_VOICE_WHATSAPP_COMMAND_MODE.md`](./OWNER_VOICE_WHATSAPP_COMMAND_MODE.md) |
| **SPAM** | Automated, scam, sales spam, robocall, fraudulent | End politely, record as spam only, never create a lead, job, customer or note |
| **EMERGENCY BUSINESS** | Genuine plumbing emergency (burst pipe, flooding, sewage, no water, geyser failure) | Prioritised business handling and immediate Owner/dispatch escalation |

Rules:

- **Uncertainty resolves to private, never to business.** When confidence is below the configured
  threshold and clarification did not resolve it, the interaction is handled as PERSONAL.
- Classification is based on the **caller/sender identity and the stated purpose**, in that order.
  A number on the Owner Personal Contact Allowlist is PERSONAL regardless of what is said.
- Classification of a **business** interaction may be corrected by the Owner. Correcting a
  BUSINESS interaction to PERSONAL must **purge** the business content that was captured, not merely
  hide it, and the purge is audited.
- **EMERGENCY BUSINESS never overrides the personal boundary.** An emergency claim from an allowlisted
  personal contact is still PERSONAL; urgency is not a classification bypass.
- Every classification decision records: the interaction, the classification, the confidence, the
  signals used, and whether it was automatic or Owner-corrected.

See [`OWNER_PERSONAL_CONTACT_ALLOWLIST.md`](./OWNER_PERSONAL_CONTACT_ALLOWLIST.md) for the
allowlist that drives PERSONAL classification by identity. That document is recorded separately and
is the authoritative source for allowlisted personal contacts.

---

## Confidentiality standard

This is the hardest requirement in the feature and is not negotiable.

**Who must never see personal content:**

- Staff — technicians, dispatchers, managers, admin, accountants.
- Clients and portal users.
- Any non-Owner role, regardless of permission breadth. A wildcard permission does **not** grant
  access; access is decided by role identity, not permission count.
- Any other tenant, under any circumstance.
- Support, developer or debug surfaces — including logs, error reports, traces and monitoring.

**What must never be copied, stored, derived or transmitted:**

- Personal call audio, personal recordings, personal transcripts, personal voicemail content.
- Personal message text, personal media, personal attachments, personal contact names or profile
  data.
- Summaries, sentiment, embeddings, extracted entities, keywords, topics, subject lines or previews
  derived from personal content.
- Personal content in AURA context, business memory, prompts, model calls, caches, search indexes,
  analytics, dashboards, exports, reports, backups intended for business use, or notifications.
- Personal counts or metadata that would allow inference (for example, "3 calls from your doctor").

**Minimal technical exclusion record only.** For a PERSONAL interaction, the only thing that may be
recorded is the minimum needed to prove the system behaved correctly:

- An opaque interaction ID.
- Timestamp.
- Channel (call / WhatsApp).
- Classification = `PERSONAL` and the reason code (for example `allowlisted_contact`,
  `stated_personal_purpose`, `uncertain_defaulted_private`).
- The action taken (for example `disengaged_and_handed_off`, `not_ingested`).

Nothing else. No caller identity beyond a non-reversible reference where one is strictly required
to enforce the allowlist, no content, no derived content, no preview. The exclusion record exists to
prove exclusion, not to describe the conversation.

Additional rules:

- **Fail closed.** If classification cannot run, or the allowlist cannot be read, or storage of the
  exclusion record fails, the interaction is treated as PERSONAL and nothing is captured.
- The exclusion record is Owner-visible only, and even to the Owner it shows no content because no
  content exists.
- Deletion of business content on Owner correction is a real delete plus an audit entry, not a flag.

---

## Call workflow

The receptionist answers business-relevant calls on the Owner's number using the required voice
standard in [`SA_FEMALE_RECEPTIONIST_VOICE_STANDARD.md`](./SA_FEMALE_RECEPTIONIST_VOICE_STANDARD.md).

### Disclosure greeting

The assistant is introduced as **Leané**, the Young Guns assistant, and must **not claim or imply
that it is a human**.

- Leané is presented as the Owner's assistant handling the call — accurate, warm, professional, and
  honest about being an assistant service rather than the Owner in person.
- If the caller asks directly whether they are speaking to a person or a machine, the answer is
  honest and immediate. Deflection is a defect.
- The greeting identifies Young Guns, identifies Leané as the assistant, and states that the Owner
  is not available right now and that Leané can help.
- The greeting must be short. It must not read a script at the caller.
- The greeting is **channel- and classification-neutral** — it is delivered before classification is
  known and therefore reveals nothing about the Owner's personal life, whereabouts, activity or
  reason for being unavailable.
- The greeting wording is configurable by the Owner, but the honesty requirement and the "not a
  human" constraint are not configurable.

### Flow

1. Answer with the disclosure greeting.
2. Determine classification from identity and stated purpose.
3. Route to the business, personal, uncertain, Owner, spam or emergency path below.
4. Close the call politely in every path, including spam.
5. Record exactly what that path permits — and nothing more.

---

## Business calls — collection, notes and connections

For a BUSINESS or EMERGENCY BUSINESS call, Leané collects what the business actually needs:

- Caller name and contact number.
- Whether they are an existing customer.
- Property or site address, including suburb — captured accurately per the SA address requirements
  in the voice standard.
- What the problem or request is, in the caller's own words.
- Urgency, and for emergencies the immediate safety-relevant facts (water off or not, active
  flooding, sewage, no water, geyser).
- Access constraints and preferred times.
- Anything the caller volunteers that the business needs in order to quote or attend.

Notes:

- A structured business note is produced from the real call, with the transcript where consent and
  configuration permit, and is attached to the business record — never to a personal record.
- Notes contain what the caller said. They do not contain speculation, invented detail, or an
  assumed diagnosis.
- Where a detail was not captured, the note says it was not captured rather than filling it in.

Connections (all **draft**, all requiring approval):

- Match to an existing customer, property, job or quote where a **confident** match exists; an
  ambiguous match is presented as candidates and **never auto-merged**.
- A new work request becomes a **draft job**, **draft quote request** or **draft lead** for
  Owner/ops approval. Nothing is auto-created from an uncertain call.
- Emergency calls escalate immediately to the Owner and dispatch, and the escalation is real — it is
  not a queued suggestion.
- Business attachments received on the call path (for example a follow-up document the caller sends)
  are filed as business documents with their provenance.
- Payment or invoice discussion produces a **follow-up item only**. No ledger write, no Xero write,
  no payment taken, no invoice status changed.

---

## Personal calls — disengagement and handoff

For a PERSONAL call, Leané ends the interaction quickly, warmly and without extracting anything.

Wording requirements:

- Polite, brief, human-respectful. The caller is a person in the Owner's private life and must not
  be interrogated, screened, profiled or made to explain themselves.
- Leané states that it handles Young Guns business calls, that it will let the Owner know they
  called, and offers nothing further.
- Leané **does not** ask for a reason, a message, a name beyond what was volunteered, a callback
  reason, or any detail.
- Leané **does not** disclose the Owner's location, activity, availability reason, schedule, other
  calls, or anything about the Owner's day.
- Leané **does not** offer business services, quotes, bookings or marketing to a personal contact.
- Leané **does not** record, transcribe or summarise the call.

Handoff:

- The Owner is notified that a personal contact called, at the level of detail the Owner has
  configured — by default, that a personal call occurred and the time, with the identity shown only
  because the Owner already knows the person. No content, because none was captured.
- The Owner's notification of a personal call is delivered on an Owner-only channel and never
  appears in a shared inbox, team feed, dashboard or report.
- If the caller asks to be put through, Leané offers only what the provider lawfully supports and the
  Owner has enabled — for example an Owner-configured transfer — and otherwise says honestly that it
  cannot connect them.

---

## Uncertain calls — clarification

- Ask **one** short, neutral clarifying question to establish whether the call is about Young Guns
  work. For example, whether the call is about a plumbing job or something personal.
- The question must not probe personal life, must not require the caller to disclose private
  information, and must not be repeated.
- If the answer establishes business, continue on the business path.
- If the answer establishes personal, or is evasive, or the caller does not answer, or confidence
  remains below threshold — treat as **PERSONAL** and disengage.
- The clarification itself is not stored as content. Only the classification outcome and reason code
  are recorded.

---

## Owner Call-In Mode

When the Owner calls their own business line, the receptionist switches out of customer mode into
Owner Command Mode as specified in
[`OWNER_VOICE_WHATSAPP_COMMAND_MODE.md`](./OWNER_VOICE_WHATSAPP_COMMAND_MODE.md).

- **Caller ID is never sufficient on its own.** A matching number is a hint, not an authentication.
- Verification requires the configured Owner identity mapping **plus** a short-lived secure
  challenge (voice PIN or equivalent). Number spoofing must not reach Owner Command Mode.
- Every verification attempt, success and failure is audited.
- A failed verification is denied Owner Command Mode and falls back to normal customer handling — it
  is never partially granted.
- In Owner Command Mode the Owner may query the business and prepare work; risky actions (money,
  payroll, bank, deletions, campaign publish, bulk communications, permission changes, important
  cancellations) still require explicit confirmation.
- Owner Command Mode never exposes personal content, because no personal content exists to expose.

---

## Personal WhatsApp workflow and privacy

The Owner's WhatsApp on this number carries both business and personal threads.

Requirements:

- Personal threads are **never ingested**. Not into the business inbox, not into Communication AURA,
  not into business memory, not into search, not into AURA prompts, not into analytics, not into
  notifications, not into exports.
- Where the lawful provider path cannot separate personal from business at the connection boundary
  with certainty, the connection is **not** made and the limitation is recorded honestly — the
  fallback is less capability, never broader ingestion.
- Media, documents, voice notes and images in personal threads are never downloaded, stored,
  thumbnailed, transcribed, OCR'd or indexed.
- Group chats containing any allowlisted personal contact are PERSONAL in their entirety.
- Contact names, profile photos, status text and presence for personal contacts are never stored.
- Read receipts, typing indicators, replies and reactions are never sent by TITAN on a personal
  thread. TITAN's presence must be invisible in the Owner's personal life.

**Always Personal override:**

- The Owner can mark any contact, number or thread as **Always Personal**.
- Always Personal is **absolute and permanent** until the Owner explicitly removes it. It cannot be
  overridden by classification confidence, by an AURA suggestion, by stated business purpose, by
  urgency, by an emergency claim, or by any staff action.
- Applying Always Personal to a thread that was previously handled as business **purges** the
  captured business content for that thread — messages, notes, derived data, index entries, drafts
  and links — and the purge is audited.
- Always Personal entries are managed only by the Owner, are stored as sensitive configuration, and
  are audited on every change.
- Always Personal is enforced at the earliest possible boundary — before ingestion, before
  classification, before any storage or model call — so that a marked thread never enters the
  business path at all.

---

## Business WhatsApp capabilities

For threads classified BUSINESS on the Owner's number, within provider-supported limits:

- Business messages appear in the existing business inbox with their real provenance (channel,
  sender, timestamp, message ID).
- Business messages are linked to the matching customer, job, quote or lead where a confident match
  exists; ambiguous matches remain candidates.
- Communication AURA may prioritise, summarise, propose a smart reply, propose a follow-up, and
  propose a CRM or timeline link — all as **drafts**.
- Business attachments are filed as business documents with provenance and a content hash.
- Business voice notes may be transcribed where the provider and consent configuration permit,
  labelled as a transcription with its confidence.

**No auto-send.** TITAN must not send, reply, react, forward or auto-respond on the Owner's number
without an approved Owner policy:

- Auto-send is **off by default** and there is no auto-send in V1.0 beyond what the Owner explicitly
  configures and approves.
- Any outbound message requires an approved draft, and the approval is recorded.
- No bulk messaging, no marketing, no campaign, no broadcast from the Owner's personal-and-business
  number.
- Outbound success is reported **only** when the provider confirms it. A queued or failed send is
  never reported as sent.
- Template and policy constraints of the provider are respected; a message that the provider would
  reject is not claimed as sent.

---

## Owner overrides and dashboard

An Owner-only confidential surface inside the Owner Command Centre — not a new top-level product,
and not a new navigation tree.

Capabilities:

- View the classification of recent interactions on the Owner's number, with confidence and reason.
- Correct a classification, including BUSINESS → PERSONAL with purge.
- Manage the Owner Personal Contact Allowlist and Always Personal entries.
- Configure the disclosure greeting wording, notification detail level, transfer behaviour, recording
  and transcription settings, uncertainty threshold, and whether business transcription is enabled.
- See the **honest capability matrix** — per capability: supported / partially supported /
  unavailable, whether it has been **verified against a real provider account**, and the limitation.
- See audit history for classification decisions, purges, verifications, overrides and configuration
  changes.

Constraints:

- Owner role only, enforced at the router gate and again in the service before any database access.
  Technician, Client, Manager, Dispatcher, Accountant, Staff and Admin are denied.
- The dashboard shows **no personal content**, to anyone, including the Owner — there is none.
- Nothing on this surface is auto-executed. Approving a correction records a decision and performs
  only the purge or reclassification described.

---

## Security, consent and fail-safe rules

**Security:**

- RBAC as above; role identity decides access, not permission breadth.
- Every read and write scoped by `companyId`; cross-tenant references refused.
- Owner contact configuration, allowlist and Always Personal entries stored as sensitive
  configuration with encryption at rest and Owner-only access.
- Every classification, correction, purge, verification, configuration change, ingestion decision and
  outbound approval audited via `security_audit_logs`.
- Provider credentials and tokens encrypted, never logged, and revocable by the Owner.
- Personal content must not be reachable through any endpoint, export, log, trace, error report,
  monitoring tool or support path — proven by test, not by assertion.
- Inbound calls and messages are treated as **untrusted input**.

**Consent and recording (South African law):**

- Recording, transcription and monitoring must comply with South African law — including RICA
  regarding interception and monitoring of communications, and POPIA regarding the lawful, minimal
  and purpose-limited processing of personal information.
- **No secret recording.** Where a call is recorded, the caller is informed at the start of the call,
  before any recording begins.
- Recording and transcription are **configurable and off unless enabled by the Owner**, and where
  enabled apply to **business** calls only. Personal calls are never recorded or transcribed.
- Lawful basis, purpose, retention period and deletion controls are recorded for business
  recordings and transcripts, with Owner-configurable retention and real deletion.
- Personal information collected on a business call is limited to what the business genuinely needs
  to attend to the request.
- Data subject rights (access, correction, deletion, objection) must be servable against business
  recordings and transcripts.
- Where the Owner's chosen configuration would not be lawful, the system refuses the configuration
  and explains why rather than proceeding.
- Legal compliance must be confirmed for the Owner's actual jurisdiction and provider before
  go-live. This document records the requirement; it is not a legal opinion.

**Fail-safe rules:**

- **Default to private.** Any failure, timeout, ambiguity, missing configuration, unreadable
  allowlist, classification error or storage error results in PERSONAL handling with no capture.
- **Never invent.** No invented caller, customer, job, lead, note, transcript, summary or figure.
- **Never claim success falsely.** No "sent", "booked", "created" or "synced" without confirmation
  from the underlying service or provider.
- **Never bypass approval.** Business record creation, outbound messages and risky actions are
  approval-gated.
- **Explain, don't fail silently.** When something cannot be done, the reason is stated to the Owner.
- **Degrade capability, never privacy.** If the only way to deliver a capability would weaken the
  personal boundary, the capability is dropped and recorded as unavailable.

---

## Acceptance tests

All 26 must pass against **real** calls and real WhatsApp traffic on a real provider account before
any completion claim. A mocked test, a page, a nav label or a green badge satisfies nothing on this
list. Each item requires recorded evidence.

| # | Test |
|---|------|
| A1 | Owner number resolves identically from `066 234 6301`, `+27 66 234 6301` and `002766…`, creating exactly one Owner identity and zero CRM/customer records |
| A2 | Disclosure greeting introduces Leané as the Young Guns assistant, does not claim to be human, and reveals nothing about the Owner's personal situation |
| A3 | Asked directly "am I speaking to a person?", Leané answers honestly and immediately |
| A4 | A real business call is classified BUSINESS and all required details (name, number, address with suburb, problem, urgency, access) are captured accurately from the real call |
| A5 | A business call produces a structured note attached to the correct business record, with uncaptured fields marked uncaptured rather than filled in |
| A6 | A business call from an existing customer links to the correct customer/property/job; an ambiguous match is presented as candidates and not auto-merged |
| A7 | A business work request creates a **draft** job/quote/lead requiring approval — nothing is auto-created |
| A8 | A real emergency call is classified EMERGENCY BUSINESS and escalates immediately to Owner and dispatch |
| A9 | A call from an allowlisted personal contact is classified PERSONAL, disengaged politely, and produces **no** recording, transcript, note, summary, lead or customer record |
| A10 | The personal disengagement wording asks for no reason, no message and no detail, and discloses nothing about the Owner's location, activity or availability reason |
| A11 | A PERSONAL interaction stores only the minimal exclusion record (ID, timestamp, channel, classification, reason code, action) — verified by direct database inspection |
| A12 | An uncertain call receives exactly one neutral clarifying question; an evasive or absent answer results in PERSONAL handling |
| A13 | An allowlisted personal contact claiming an emergency is still handled as PERSONAL — urgency does not bypass classification |
| A14 | Owner Call-In Mode is **denied** on matching caller ID alone and granted only after the short-lived challenge succeeds; both outcomes audited |
| A15 | A spoofed Owner caller ID never reaches Owner Command Mode |
| A16 | A SPAM call is ended politely and creates no lead, customer, job or note |
| A17 | A personal WhatsApp thread is never ingested — absent from the business inbox, Communication AURA, business memory, search, analytics, exports and AURA prompts, verified by inspection of each |
| A18 | Personal WhatsApp media, documents and voice notes are never downloaded, stored, transcribed, OCR'd or indexed |
| A19 | A group containing an allowlisted personal contact is treated as PERSONAL in its entirety |
| A20 | TITAN sends no read receipt, typing indicator, reaction or reply on any personal thread |
| A21 | Always Personal is absolute — it survives high business-classification confidence, an AURA suggestion, a stated business purpose and an emergency claim |
| A22 | Marking a previously-business thread Always Personal **purges** its captured content, notes, derived data, index entries and drafts, verified by inspection, and the purge is audited |
| A23 | No outbound WhatsApp message is sent without an approved draft; auto-send is proven off by default; a provider-failed send is reported as failed, never as sent |
| A24 | Every non-Owner role (Technician, Client, Manager, Dispatcher, Accountant, Staff, Admin) is denied the confidential surface at the router gate **and** again in the service before any database access, including with wildcard permissions |
| A25 | Recording occurs only when Owner-enabled, only on business calls, with the caller informed before recording starts; personal calls are never recorded; retention and real deletion are proven |
| A26 | Induced failures (classification error, unreadable allowlist, storage failure, provider timeout) all result in PERSONAL handling with no capture — fail-closed proven, not assumed |

---

## Completion criteria

This feature may be reported complete only when **all** of the following hold:

1. All 26 acceptance tests pass with recorded real-traffic evidence, listed individually with their
   evidence.
2. The honest capability matrix is published in the Owner UI, with every capability marked supported
   / partial / unavailable and **verified / unverified**, and every limitation stated.
3. Zero personal content exists anywhere in the business path — proven by direct inspection of the
   database, indexes, caches, logs, exports and AURA context, not by assertion.
4. No unofficial WhatsApp automation, scraping or session-based access exists in the codebase.
5. RBAC, tenant isolation, approvals and audit are proven behaviourally, not by code reading.
6. Legal compliance for recording, transcription and personal-information processing is confirmed for
   the Owner's jurisdiction and provider.
7. No fake calls, messages, customers, leads, jobs or transcripts exist anywhere in the feature.
8. Honest gaps are stated. Understating a gap is a defect.
9. No deploy. Yoco `0123` untouched.

---

## Status

**⬜ Planned / required for TITAN V1.0 — NOT started.**

- Scope is approved and recorded. **No code has been written for this feature.**
- Do **not** implement in parallel with the Xero Complete Historical Sync phase or any other major
  phase.
- Explicit Owner approval is required before implementation begins.
- When implemented, it is **committed separately** and reported separately from department work.

**Cross-links:**

- [`OWNER_PERSONAL_CONTACT_ALLOWLIST.md`](./OWNER_PERSONAL_CONTACT_ALLOWLIST.md) — authoritative
  allowlist of Owner personal contacts driving PERSONAL classification by identity.
- [`OWNER_VOICE_WHATSAPP_COMMAND_MODE.md`](./OWNER_VOICE_WHATSAPP_COMMAND_MODE.md) — Owner Command
  Mode for call-in and WhatsApp commands.
- [`AURA_VOICE_THROUGHOUT_TITAN.md`](./AURA_VOICE_THROUGHOUT_TITAN.md) — the shared voice command /
  intent layer this must build on.
- [`SA_FEMALE_RECEPTIONIST_VOICE_STANDARD.md`](./SA_FEMALE_RECEPTIONIST_VOICE_STANDARD.md) — the
  required receptionist voice standard for Leané.
