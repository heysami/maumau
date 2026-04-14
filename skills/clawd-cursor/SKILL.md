---
name: clawd-cursor
description: Use Clawd Cursor for native desktop control across apps when browser-only automation or dedicated integrations are not enough.
homepage: https://clawdcursor.com
metadata: { "maumau": { "requires": { "anyBins": ["clawdcursor", "clawd-cursor"] } } }
---

# Clawd Cursor

Clawd Cursor gives Maumau a screen, keyboard, and mouse for cross-app desktop work.
Use it when a task depends on the visible UI of a desktop app or a logged-in web app
and there is no better native integration already available.

## Prefer it for

- Desktop-app tasks outside Maumau's built-in channels and plugins
- Cross-app workflows like "read here, copy there, paste somewhere else"
- UI-driven services that do not have a stable API path available

## Prefer built-in tools instead when

- Maumau already has a dedicated integration for the service or channel
- The task can be handled with normal browser control alone
- The user only needs a simple file, shell, or message action

## Install

```bash
curl -fsSL https://clawdcursor.com/install.sh | bash
clawdcursor consent --accept
```

## macOS note

On macOS, grant Accessibility access to your terminal before starting Clawd Cursor:

```text
System Settings -> Privacy & Security -> Accessibility
```

## Start

```bash
cd ~/.maumau/clawdcursor && clawdcursor start
```

## Typical flow

1. Prefer Maumau's managed bootstrap path first. Fresh local onboarding should pre-consent Clawd Cursor and stage a managed config under `~/.maumau/clawdcursor`.
2. Start the local service from that managed config directory: `cd ~/.maumau/clawdcursor && clawdcursor start`.
3. Verify the service is up with `curl -H "Authorization: Bearer $(cat ~/.clawdcursor/token)" http://127.0.0.1:3847/status`.
4. Use Clawd Cursor for UI-heavy tasks that need native desktop control.
5. Treat `clawdcursor doctor` as an optional interactive deep-dive, not the default automation path.

## Notes

- `clawdcursor doctor` is interactive-only upstream; do not depend on it for unattended setup.
- Maumau's managed bootstrap currently prefers a working local Ollama text model for no-intervention setup when available.
- If the managed config is missing, onboarding was incomplete and should be fixed before assuming desktop control is ready.
- Linux support is more limited upstream and focuses on browser/CDP-style control.
