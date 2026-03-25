# Maumau

Personal AI assistant you run on your own devices.

## Quick start

Runtime: **Node 24 (recommended) or Node 22.16+**.

Full setup guide: [Getting started](https://docs.maumau.ai/start/getting-started)

```bash
npm install -g maumau@latest

maumau onboard --install-daemon

maumau gateway --port 18789 --verbose

maumau message send --to +1234567890 --message "Hello from Maumau"

maumau agent --message "Ship checklist" --thinking high
```

Upgrading? [Updating guide](https://docs.maumau.ai/install/updating)
