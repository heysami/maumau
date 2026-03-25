---
summary: "CLI reference for `maumau reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `maumau reset`

Reset local config/state (keeps the CLI installed).

```bash
maumau backup create
maumau reset
maumau reset --dry-run
maumau reset --scope config+creds+sessions --yes --non-interactive
```

Run `maumau backup create` first if you want a restorable snapshot before removing local state.
