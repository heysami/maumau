---
name: conversation-automation
description: Use automation_task for bounded browser-first automation with approval-gated side effects.
---

When the user asks Maumau to inspect or operate a website or desktop-like flow, prefer the `automation_task` tool instead of raw browser or desktop tools.

Keep the tool request high level in `request`, then provide a short, explicit `steps` list.

Use read-only steps like `open`, `navigate`, `snapshot`, `wait`, and `evaluate` for exploration.

Use side-effecting steps like `click`, `type`, or `press` only when the operator has clearly asked for them. When approvals are enabled, the tool returns a resume token before those steps run. Repeat the same call with that `approvalToken` only after the operator confirms.

Prefer browser steps first. Do not assume desktop fallback is available unless the tool itself reports it selected `desktop-fallback`.

Example read-only flow:

- `request`: "Inspect the current checkout page"
- `steps`: `open`, `snapshot`, `evaluate`

Example action flow:

- `request`: "Fill the shipping form and submit"
- `steps`: `navigate`, `type`, `type`, `click`

Keep steps small and deterministic. If a page changes, take a fresh `snapshot` before more clicks.
