---
summary: "CLI reference for `maumau uninstall` (remove gateway service + local data)"
read_when:
  - You want to remove the gateway service and/or local state
  - You want a dry-run first
title: "uninstall"
---

# `maumau uninstall`

Uninstall the gateway service + local data (CLI remains).

```bash
maumau backup create
maumau uninstall
maumau uninstall --all --yes
maumau uninstall --dry-run
```

Run `maumau backup create` first if you want a restorable snapshot before removing state or workspaces.
