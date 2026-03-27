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
git clone https://github.com/AmrDab/clawdcursor.git
cd clawdcursor
npm install
npm run setup
clawdcursor doctor
```

## macOS note

On macOS, grant Accessibility access to your terminal before starting Clawd Cursor:

```text
System Settings -> Privacy & Security -> Accessibility
```

## Start

```bash
clawdcursor start
```

## Typical flow

1. Run `clawdcursor doctor` once to validate screen access and provider setup.
2. Start the local service with `clawdcursor start`.
3. Use Clawd Cursor for UI-heavy tasks that need native desktop control.

## Notes

- Clawd Cursor works with the AI provider the user already configured.
- Local models via Ollama are supported upstream if the user wants a local-first setup.
- Linux support is more limited upstream and focuses on browser/CDP-style control.
