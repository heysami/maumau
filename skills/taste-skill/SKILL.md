---
name: taste-skill
description: High-agency frontend taste and bias correction for UI/UX work. Use when pushing layouts past generic AI defaults, choosing stronger hierarchy, setting motion and density, or hardening premium frontend execution details.
homepage: https://github.com/leonxlnx/taste-skill
---

# Taste Skill

Adapted for Maumau from the public `leonxlnx/taste-skill` repo. Use it as a bias-correction layer when a design risks becoming symmetrical, generic, or undercooked.

## Three working dials

Set these from the brief before designing:

- `DESIGN_VARIANCE`: how asymmetric, editorial, or unexpected the layout should feel
- `MOTION_INTENSITY`: how animated or physically expressive the interface should feel
- `VISUAL_DENSITY`: how much information should fit on screen

If the brief does not specify them, start around `7 / 5 / 4` and adjust deliberately.

## Non-negotiable checks

- Verify dependencies in `package.json` before introducing libraries.
- Check the Tailwind version before using version-specific syntax.
- Isolate client-only motion and stateful animation in leaf components.
- Use real icons, not emoji.
- Prefer grid over brittle flexbox math for repeated layouts.
- Use `min-h-[100dvh]` instead of `h-screen` for full-height mobile sections.

## Bias-correction rules

- Typography: build stronger hierarchy and avoid default-safe type pairings.
- Color: keep one disciplined accent and avoid purple-blue AI glow palettes.
- Layout: do not default to centered hero blocks or identical three-card rows.
- Surfaces: use cards only when elevation or grouping earns them.
- States: always account for loading, empty, error, and pressed states.
- Motion: animate with `transform` and `opacity`; keep CPU-heavy effects isolated.

## Forbidden shortcuts

- emoji as icons or decorative graphics
- generic three-column feature-card sections
- card-inside-card layouts
- default unmodified component-library styling
- oversized glow shadows as a stand-in for taste
- animating `top`, `left`, `width`, or `height` when `transform` will do

## Companion skills

Use the narrower companion skills when the direction is clear:

- `minimalist-skill` for restrained editorial clarity
- `brutalist-skill` for hard mechanical contrast
- `soft-skill` for premium agency-style softness
- `redesign-skill` for upgrading an existing UI
- `stitch-skill` for a reusable design-system brief
- `output-skill` when the implementation must be exhaustive and placeholder-free

## What good output looks like

Return a sharper layout concept, stronger hierarchy, cleaner state design, and a more memorable visual system than the default LLM answer would have produced.
