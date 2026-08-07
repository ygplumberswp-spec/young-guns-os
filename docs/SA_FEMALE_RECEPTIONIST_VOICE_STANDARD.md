# South African Female Receptionist Voice Standard

**Status: ⬜ Planned / required standard — NOT started, no implementation exists.**

This document records an approved requirement only. Nothing here has been built and no voice or
TTS work has been done against it. It is written so the standard can be applied in the correct
phase without re-deciding the requirements.

## Scope

Every **customer-facing receptionist voice** in TITAN must be a natural-sounding **South African
female voice**.

This standard applies to:

- **Voice AI Receptionist** (Department 9.1) — the inbound call path.
- **AURA Voice Throughout TITAN** — see [`AURA_VOICE_THROUGHOUT_TITAN.md`](./AURA_VOICE_THROUGHOUT_TITAN.md).
- **WhatsApp voice responses** — see [`OWNER_VOICE_WHATSAPP_COMMAND_MODE.md`](./OWNER_VOICE_WHATSAPP_COMMAND_MODE.md).
- **Mobile voice phases** — the same capability delivered to field and mobile users.

It is a **configuration and quality standard**, not a new architecture. It does not add a
module, a navigation entry, a parallel voice stack or a second receptionist. It constrains which
provider voices and speaking instructions are acceptable for the voice paths those phases
already plan to build.

## Required voice characteristics

The selected voice must be:

- **Warm** — pleasant to listen to, not flat or cold.
- **Professional** — appropriate for a real business answering real customers.
- **Clear** — easily understood on a first listen.
- **Confident** — sounds like someone who knows the business.
- **Friendly without being casual** — never slang, never over-familiar.
- **Naturally paced** — realistic pacing, pauses and breathing rather than a continuous read.
- **Low robotic character** — no obviously synthetic delivery, clipping or flat monotone.
- **Premium** — consistent with a premium Cape Town service business.
- **Intelligible on ordinary connections** — understandable over normal mobile and landline
  audio quality, not only over high-fidelity playback.

## Local language and pronunciation

The voice must sound local to the customers it serves, and must pronounce correctly:

- **South African English** accent and phrasing.
- **Cape Town suburb names.**
- **South African personal names.**
- **Street names and addresses.**
- **Rand amounts.**
- **South African date, time and phone number formats.**
- **Plumbing terminology** as used in the trade locally.
- **Young Guns Plumbing** branding and business name.

**Optional:** an Afrikaans-capable South African female voice where provider quality permits.
This is optional because it depends on available provider voice quality — it is not a
requirement to build a second voice stack, and it must not be claimed as supported unless a real
provider voice meets the standard.

## Voice profiles

Four selectable profiles are required. Each profile is a **configurable provider voice plus
speaking instructions** — **not** a separate architecture, service or code path.

| Profile | Intended use |
|---------|--------------|
| **Professional Receptionist** | Default business-hours answering. |
| **Warm and Friendly** | Customer-relationship and reassurance-led conversations. |
| **Premium Executive** | Premium and high-value customer handling. |
| **Calm After-Hours** | Emergency and after-hours calls where the caller may be stressed. |

## Conversation quality requirements

- **Acknowledge quickly** — the caller should not sit in silence waiting for a response.
- **Handle interruption naturally** — being interrupted is expected, not an error state.
- **Stop speaking when the caller talks** — never talk over the caller.
- **Resume naturally** after an interruption, without restarting from the beginning.
- **No long monologues** — keep turns short and let the caller speak.
- **Avoid repetitive filler phrases** — no recycled stock acknowledgements every turn.
- **Stay concise** — answer the question asked.
- **Transfer to a human** when confidence is low or when the caller asks for a person.
- **Never pretend to be human** where disclosure is required.

## Testing required before go-live

The chosen voice must be tested against real Young Guns Plumbing scenarios before it is used
with customers:

- Emergency booking call
- Blocked drain enquiry
- Burst pipe emergency
- Geyser installation enquiry
- Quote follow-up call
- Complaint call
- Address and suburb capture
- Appointment confirmation
- Owner call-in
- Noisy or poor-quality connection
- Caller interrupting mid-sentence
- English, and supported Afrikaans where a qualifying voice is available

## Voice approval

- The **Platform Owner must preview and approve the final voice** before it is activated in
  production.
- Until the Owner has tested and approved it, the voice **must not be described as sounding
  human** or as production-ready.
- No claim about voice quality may be made on the basis of provider marketing or an untested
  configuration.

## Security and records

This standard changes the voice only. All existing requirements are preserved unchanged:

- Transcript records
- Recording consent and visible recording status
- Immutable audit records
- Retention and deletion controls
- Privacy protections
- RBAC
- Tenant isolation and `companyId` scoping

Selecting or changing a voice is never a route around any of the above.

## Acceptance criteria

- Every customer-facing receptionist voice is a natural-sounding South African female voice.
- The voice meets the warmth, professionalism, clarity, confidence, pacing and intelligibility
  characteristics listed above, including over ordinary mobile and landline audio.
- South African English, Cape Town suburbs, SA personal names, street names and addresses, Rand
  amounts, SA date / time / phone formats, plumbing terminology and Young Guns Plumbing branding
  are pronounced correctly.
- An Afrikaans-capable SA female voice is offered only where a real provider voice meets the
  standard.
- The four profiles exist as configurable provider voices plus speaking instructions, sharing
  one implementation rather than separate architectures.
- Conversation behaviour meets the interruption, pacing, brevity, filler, human-transfer and
  disclosure rules.
- All listed Young Guns scenarios are tested before go-live.
- The Platform Owner has previewed and approved the final voice before production activation,
  and no human-sounding claim is made before that approval.
- Transcript, consent, audit, retention, privacy, RBAC and tenant-isolation requirements are
  unchanged.
