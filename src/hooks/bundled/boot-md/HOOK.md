---
name: boot-md
description: "Run BOOT.md on gateway startup"
homepage: https://docs.maumau.ai/automation/hooks#boot-md
metadata:
  {
    "maumau":
      {
        "emoji": "🚀",
        "events": ["gateway:startup"],
        "requires": { "config": ["workspace.dir"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with Maumau" }],
      },
  }
---

# Boot Checklist Hook

Runs `BOOT.md` at gateway startup for each configured agent scope, if the file exists in that
agent's resolved workspace.
