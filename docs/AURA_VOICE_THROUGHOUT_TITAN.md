# AURA Voice Throughout TITAN

**Status: ⬜ Planned / required scope — NOT started, no implementation exists.**

This document records approved scope only. Nothing here has been built. It is written so the
work can be picked up in the correct phase without re-deciding the requirements.

## Placement in the roadmap

This is part of **TITAN V1.0**, delivered inside the existing AURA / UX / Mobile phase. Voice is
a **new way to reach the modules TITAN already has** — it is not a new product, not a new agent
stack, and not a parallel architecture.

Implementation timing: whenever that AURA / UX / Mobile phase is scheduled. Until then it stays
marked **planned / required**, not started. When it is implemented later, it is committed and
reported separately from the department work.

Related planned scope: [`OWNER_VOICE_WHATSAPP_COMMAND_MODE.md`](./OWNER_VOICE_WHATSAPP_COMMAND_MODE.md).
Owner call-in and Owner WhatsApp are the **remote** channels of the same voice capability
described here, and both share one command / intent layer.

## Core principle

Voice is available **throughout TITAN**, not parked on a single screen.

- A persistent microphone control is available across the platform.
- Speaking opens the **AURA side panel** in place — the user is never navigated away from what
  they were doing.
- The user speaks naturally. There are no memorised command phrases and no rigid syntax.
- AURA keeps **conversational context**, so follow-up requests build on the previous turn
  instead of starting over.
- Before any important action, AURA shows **what it heard and what it intends to do**.
- The user can **cancel, edit or confirm** that interpretation before anything happens.
- There is **no "Voice Intelligence" navigation entry**. Voice does not add menu clutter; it is
  an input method layered over the existing modules.

## Supported areas and capabilities

Voice reaches the modules that already exist. Each area below is served by its existing
services and screens — voice routes to them, it does not reimplement them.

| Area | Voice capability |
|------|------------------|
| Dashboard | Ask for the state of the business, today's position, what needs attention. |
| Finance | Ask about cash position, revenue, outstanding and overdue invoices, supplier bills due. |
| Customers | Look up a customer, their history, properties, jobs and communications; prepare messages. |
| Jobs / Dispatch | Check today's and this week's schedule, who is running late, prioritise an emergency, reassign or re-sequence work. |
| Quotes / Invoices | Find and check quotes and invoices, chase status, prepare follow-ups. |
| Marketing | Ask about campaign status and performance, prepare content and campaign drafts. |
| Fleet | Ask about vehicles, servicing, licensing and vehicle attention items. |
| Inventory / Suppliers | Check stock levels, low stock, supplier orders and supplier invoices due. |
| Documents / Compliance | Find documents, check COCs, certificates and expiries, check compliance attention items. |
| Team | Ask about staff, availability, workload and performance. |
| Personal EA | Reminders, calendar handling, research and personal-assistant requests for the Owner. |

Preparing work, gathering information and recommending actions are allowed. Actions that
commit, send, spend or delete follow the confirmation rules below.

## Technician voice workflow

Technicians can complete job information by speaking instead of typing, on site and hands-busy.

A technician can dictate:

- job notes
- work performed
- materials used
- faults found
- recommendations
- customer instructions
- completion details

AURA converts the dictation into **structured job information** mapped onto the existing job
fields. The technician **reviews the structured result before it is saved** — nothing is written
to the job from speech alone.

## Voice channels

All channels share one command and intent layer:

1. **In-app microphone** — the persistent control across TITAN in the browser.
2. **Mobile app voice** — the same capability for field users on mobile.
3. **Owner Call-In** — the Owner phoning the business number.
4. **Owner WhatsApp voice notes** — voice notes sent to the office number.
5. **WhatsApp text** — the same intent layer reached by typed message.

Channels 3, 4 and 5 are specified in
[`OWNER_VOICE_WHATSAPP_COMMAND_MODE.md`](./OWNER_VOICE_WHATSAPP_COMMAND_MODE.md) and must be
built on the same shared layer rather than a second implementation.

## Conversation transcript and history

Voice is never audio-only. **Every voice interaction also produces a readable text conversation
inside AURA Chat**, so the user can see what was said, what AURA understood, and what happened.

Displayed in the conversation:

- The user's speech as **live or near-live transcription**.
- AURA's spoken response, shown as **text** as well as being spoken.
- **Proposed actions, approvals and execution results**, clearly marked as what they are.
- **Timestamps**, and the **verified user and source channel** the message came from.
- **Edit, Approve, Reject and Cancel** controls wherever they apply to that message.
- **Failures and the explanation for them**, recorded visibly rather than silently dropped.

Honesty rules already stated apply to the visible record as well: AURA never shows an action as
succeeded unless the underlying service or provider confirmed it.

Conversation behaviour:

- Voice messages and typed messages are stored in **one continuous conversation history** — not
  separate voice and chat logs.
- **Contextual follow-up questions are preserved**, so reopening a conversation keeps the thread
  of what was being discussed.
- Previous conversations can be **searched, reopened and continued**.
- The user can **switch naturally between speaking and typing in the same conversation**, mid
  thread, without starting over or losing context.

Remote channels behave the same way. An Owner call-in or WhatsApp command specified in
[`OWNER_VOICE_WHATSAPP_COMMAND_MODE.md`](./OWNER_VOICE_WHATSAPP_COMMAND_MODE.md) produces the
same chat record and the same audit trail as an in-app interaction.

## Immutable audit record

Separate from the conversation history — and **not deletable with it** — every interaction
writes an immutable audit record containing:

- Verified user
- Company ID
- Source channel
- Transcript
- Interpreted intent
- Requested action
- Approval status
- Execution result
- Timestamp

Conversation history is the user-facing record; the audit record is the compliance record. The
two are stored separately so that clearing a conversation can never erase the audit trail.

## Audio storage and retention

Storing the audio itself is **optional and configurable** — the transcript and audit record do
not depend on keeping the recording.

- **No secret recording.** Recording status is clearly displayed while it is happening.
- Retention periods and deletion controls are configurable.
- Recordings and transcripts are protected by **RBAC and tenant isolation**, exactly like every
  other record in TITAN.
- Authorised users may delete ordinary conversation history where policy permits, while the
  **required security and audit records are preserved**.

## Security requirements

- Voice respects the speaker's **role and permissions**. A user can only do by voice what they
  can already do in the UI.
- Voice is **never an RBAC bypass**. There is no elevated "voice" permission path.
- Every read and write stays scoped by `companyId` — tenant isolation is unchanged.
- **Remote channels require Owner verification.** Caller ID or WhatsApp sender identity alone is
  never sufficient.
- Explicit confirmation is required before: payments, payroll actions, bank actions, deletions,
  publishing campaigns, bulk communications, permission changes, and cancelling important
  bookings.
- Every interaction is audited: the **transcript**, AURA's **interpretation**, the **approval**,
  and the **execution**.
- **No false success.** AURA never reports that something was sent, paid or saved unless the
  underlying service confirmed it. When something cannot be done, it says exactly what is
  missing. It never invents data.

## Architecture direction

Extend what already exists — do not duplicate it:

- **AURA Chat** — voice is another input into the existing conversation surface.
- **AURA orchestration** — interprets requests and coordinates agents and modules.
- **The existing approval queue** — for anything requiring confirmation.
- **The existing audit logging** — for transcripts, interpretations, approvals and executions.
- **Voice AI Receptionist (Department 9.1)** — the inbound call path.

Additional requirements:

- **One shared voice command / intent layer** serves every channel. No per-channel command
  parsing.
- Voice **routes to existing services**. It does not create parallel business logic, parallel
  data paths, or duplicate module functionality.
- **STT and TTS providers are configurable**, not hard-wired to one vendor.
- The system **degrades to text** when speech is unavailable, unsupported, disabled or failing.
  Losing voice never blocks the user from completing the same work by typing.

## Acceptance criteria

- Voice is reachable from anywhere in TITAN via a persistent microphone control.
- Speaking opens the AURA side panel in place without navigating the user away.
- Natural speech is understood without memorised commands, and follow-ups keep context.
- Important actions show the transcript and intended action, and can be cancelled, edited or
  confirmed before execution.
- No "Voice Intelligence" navigation entry is added.
- Technicians can complete job information by voice, reviewed as structured data before saving.
- All five channels resolve through one shared command / intent layer.
- Voice enforces the speaker's existing role, permissions and `companyId` scoping, with no
  bypass.
- Remote Owner channels require verification before acting on sensitive requests.
- Transcript, interpretation, approval and execution are audited for every interaction.
- Every voice interaction also appears as readable text in AURA Chat, showing the user's
  transcription, AURA's response, proposed actions, approvals, execution results, failures and
  their explanations, with timestamps and the verified user and channel.
- Edit, Approve, Reject and Cancel controls are available on the messages they apply to.
- Voice and typed messages share one continuous conversation history, context is preserved for
  follow-ups, and previous conversations can be searched, reopened and continued.
- The user can switch between speaking and typing inside the same conversation without losing
  context.
- Each interaction writes a separate immutable audit record holding the verified user, company
  ID, source channel, transcript, interpreted intent, requested action, approval status,
  execution result and timestamp.
- Audio storage is optional and configurable, recording status is visible, retention and
  deletion are controllable, and recordings and transcripts are protected by RBAC and tenant
  isolation.
- Deleting ordinary conversation history where policy permits never removes the required
  security and audit records.
- Nothing is ever reported as successful unless the underlying service confirmed it.
- Text remains a complete fallback when speech is unavailable.
