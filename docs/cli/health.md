---
summary: "CLI reference for `maumau health` (gateway health endpoint via RPC)"
read_when:
  - You want to quickly check the running Gateway’s health
title: "health"
---

# `maumau health`

Fetch health from the running Gateway.

```bash
maumau health
maumau health --json
maumau health --verbose
```

Notes:

- `--verbose` runs live probes and prints per-account timings when multiple accounts are configured.
- Output includes per-agent session stores when multiple agents are configured.
