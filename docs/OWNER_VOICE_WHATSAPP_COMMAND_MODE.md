# Owner Voice & WhatsApp Command Mode

**Status: ⬜ Planned / required scope — NOT started, no implementation exists.**

This document records approved scope only. Nothing here has been built. It is written
so the work can be picked up in the correct phase without re-deciding the requirements.

## Placement in the roadmap

This is part of **TITAN V1.0**, delivered inside the existing Communications / Executive
Assistant / Voice AI Receptionist / WhatsApp / AURA orchestration phase. It is **not** a new
parallel architecture and must not be built as a separate product or a separate agent stack.

Implementation timing: whenever that communications / AURA phase is scheduled. If that phase
falls after the remaining departments, this waits for it. Until then it stays marked
**planned / required**, not started. When it is implemented later, it is committed and
reported separately from the department work.

Related planned scope: [`AURA_VOICE_THROUGHOUT_TITAN.md`](./AURA_VOICE_THROUGHOUT_TITAN.md).
The Owner channels described here are the **remote** channels of that platform-wide voice
capability, and both must be built on the same shared voice command / intent layer.

Required voice standard (also planned / required, not started): where these channels speak to a
customer — the receptionist call path and WhatsApp voice responses — the voice must be a
natural-sounding **South African female voice** as specified in
[`SA_FEMALE_RECEPTIONIST_VOICE_STANDARD.md`](./SA_FEMALE_RECEPTIONIST_VOICE_STANDARD.md), with
Platform Owner preview and approval required before production activation.

## Channels

The Platform Owner can command the business through two channels:

1. **Phone call** to the Young Guns business number.
2. **WhatsApp message** to the office / business number.

Both channels use the same underlying command handling, identity verification, approval and
audit rules described below.

## Owner Call-In (voice)

- Detect that the caller is the Platform Owner via a verified phone-number mapping.
- Require a secure voice PIN or challenge before any sensitive request is acted on.
- On successful verification, switch the receptionist out of customer mode into
  **Owner Command Mode** for that call.
- Accept natural-language requests, for example: today's and this week's schedule, cash
  position, late or delayed technicians, prioritising an emergency job, reassigning work,
  drafting customer or staff messages, unpaid customer invoices, supplier invoices due,
  outstanding alerts, setting reminders, and AURA recommendations.

## Owner WhatsApp Command

- Recognise verified Owner WhatsApp accounts only.
- Accept natural-language instructions sent to the office number.
- Answer using AURA plus the existing business modules — no separate data path.
- Accept text, and voice notes, images or documents where the WhatsApp provider allows it.
- Reply with short, concrete confirmations of what was found, prepared or queued.

Representative commands (illustrative, not an exhaustive command list): what does today look
like, who is running late, what is our cash position, which invoices are unpaid, prepare a
message to a customer, remind me about something later, what does AURA recommend right now.

## Security requirements

- Caller ID and WhatsApp sender identity are **never sufficient on their own** for a
  high-risk request.
- Identity mapping plus short-lived verification is required, and every verification is
  audit-logged.
- Explicit Owner confirmation is required before: payments, payroll actions, bank actions,
  deletions, publishing campaigns, bulk communications, permission changes, and cancelling
  important bookings.
- Unverified callers and unverified WhatsApp senders are denied Owner Command Mode.
- Standard platform rules still apply: RBAC, tenant isolation, and `companyId` scoping on
  every read and write.
- Every command, response, approval and execution is logged.

## Behaviour rules

- Gathering information, preparing work and recommending actions are allowed.
- Risky actions are never performed without Owner approval.
- When something cannot be done, explain exactly what is missing rather than failing silently.
- Never invent data.
- Never report success for an outbound action that the provider has not confirmed.
- Escalate ambiguous requests instead of guessing.

## Personal assistant scope (low risk)

The Owner may also use these channels for low-risk personal assistance: restaurant research
and booking preparation, calendar handling, reminders, travel arrangements, meeting
coordination, and gift or supplier research. Anything that spends money or makes a commitment
on the Owner's behalf still requires explicit Owner confirmation.

## Product principles

- Simple natural language in, short action-focused answers out.
- No separate technical agent screens for the Owner to operate.
- AURA coordinates the underlying agents and modules behind the scenes.

## Architecture direction

Extend what already exists — do not duplicate it:

- Voice AI Receptionist (Department 9.1) for the inbound call path.
- The existing WhatsApp / Communications platform for the message path.
- AURA orchestration for interpreting requests and coordinating agents.
- The existing approval queue for anything requiring Owner confirmation.
- The existing audit logging for commands, approvals and executions.
- The existing Executive Assistant mode for Owner-facing behaviour.

No new parallel receptionist, no new parallel WhatsApp stack, no new approval or audit system.
