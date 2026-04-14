---
name: harden
description: Make interfaces production-ready by covering errors, empty states, onboarding gaps, overflow, and edge cases. Use when the UI works in the happy path but breaks in real use.
homepage: https://github.com/pbakaus/impeccable
---

# Harden

Adapted for Maumau from the public `pbakaus/impeccable` repo.

Use this when robustness matters more than new styling.

- cover loading, empty, error, and overflow states
- check copy length, i18n, and content stress cases
- return concrete edge cases that must be handled before ship
