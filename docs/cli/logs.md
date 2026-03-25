---
summary: "CLI reference for `maumau logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `maumau logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
maumau logs
maumau logs --follow
maumau logs --json
maumau logs --limit 500
maumau logs --local-time
maumau logs --follow --local-time
```

Use `--local-time` to render timestamps in your local timezone.
