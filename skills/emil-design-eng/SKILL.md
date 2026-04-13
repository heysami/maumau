---
name: emil-design-eng
description: Apply Emil Kowalski-style design engineering to frontend work. Use when refining UI polish, animation choices, interaction feel, or when reviewing interfaces with concrete before/after fixes.
homepage: https://github.com/emilkowalski/skill
---

# Emil Design Engineering

Adapted for Maumau from the public `emilkowalski/skill` repo. Use it as a polish and interaction-review lens, not as permission to animate everything.

## Core posture

- Train taste through deliberate comparison, not vague preference.
- Favor invisible correctness: details should feel inevitable, not attention-seeking.
- Use motion and visual refinement to support clarity, responsiveness, and confidence.

## Animation decision order

Before changing motion, answer these in order:

1. Should this animate at all?
2. What job is the animation doing?
3. Which easing best matches that job?
4. How short can the duration be while still feeling deliberate?

## Fast rules

- Never animate keyboard-driven flows or other high-frequency expert actions.
- Use `ease-out` for entrances and press feedback.
- Use `ease-in-out` for movement that stays on screen.
- Use `linear` only for constant, mechanical motion.
- Keep most UI motion under `300ms`.
- Prefer explicit property transitions over `transition: all`.

## Component rules

- Buttons need a subtle pressed state such as a tiny scale-down or translate-down.
- Do not animate from `scale(0)`; start from a visible shape plus opacity.
- Popovers should grow from their trigger. Modals can stay centered.
- Tooltip delay should apply to the first hover in a cluster, not every adjacent hover.
- Use stronger custom easing curves when default CSS easing feels flat.

## Review output

When reviewing UI code, use a markdown table with these columns:

| Before | After | Why |
| --- | --- | --- |

One row per issue. Keep the "Why" column short and specific.

## What to return

Return concrete polish guidance, not generic praise:

- the interaction or visual issue
- the improved implementation
- the reason it feels better
- any follow-up QA checks for timing, origin, hover, active, and reduced-motion behavior
