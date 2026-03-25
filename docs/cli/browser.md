---
summary: "CLI reference for `maumau browser` (profiles, tabs, actions, Chrome MCP, and CDP)"
read_when:
  - You use `maumau browser` and want examples for common tasks
  - You want to control a browser running on another machine via a node host
  - You want to attach to your local signed-in Chrome via Chrome MCP
title: "browser"
---

# `maumau browser`

Manage Maumau’s browser control server and run browser actions (tabs, snapshots, screenshots, navigation, clicks, typing).

Related:

- Browser tool + API: [Browser tool](/tools/browser)

## Common flags

- `--url <gatewayWsUrl>`: Gateway WebSocket URL (defaults to config).
- `--token <token>`: Gateway token (if required).
- `--timeout <ms>`: request timeout (ms).
- `--browser-profile <name>`: choose a browser profile (default from config).
- `--json`: machine-readable output (where supported).

## Quick start (local)

```bash
maumau browser profiles
maumau browser --browser-profile maumau start
maumau browser --browser-profile maumau open https://example.com
maumau browser --browser-profile maumau snapshot
```

## Profiles

Profiles are named browser routing configs. In practice:

- `maumau`: launches or attaches to a dedicated Maumau-managed Chrome instance (isolated user data dir).
- `user`: controls your existing signed-in Chrome session via Chrome DevTools MCP.
- custom CDP profiles: point at a local or remote CDP endpoint.

```bash
maumau browser profiles
maumau browser create-profile --name work --color "#FF5A36"
maumau browser create-profile --name chrome-live --driver existing-session
maumau browser delete-profile --name work
```

Use a specific profile:

```bash
maumau browser --browser-profile work tabs
```

## Tabs

```bash
maumau browser tabs
maumau browser open https://docs.maumau.ai
maumau browser focus <targetId>
maumau browser close <targetId>
```

## Snapshot / screenshot / actions

Snapshot:

```bash
maumau browser snapshot
```

Screenshot:

```bash
maumau browser screenshot
```

Navigate/click/type (ref-based UI automation):

```bash
maumau browser navigate https://example.com
maumau browser click <ref>
maumau browser type <ref> "hello"
```

## Existing Chrome via MCP

Use the built-in `user` profile, or create your own `existing-session` profile:

```bash
maumau browser --browser-profile user tabs
maumau browser create-profile --name chrome-live --driver existing-session
maumau browser create-profile --name brave-live --driver existing-session --user-data-dir "~/Library/Application Support/BraveSoftware/Brave-Browser"
maumau browser --browser-profile chrome-live tabs
```

This path is host-only. For Docker, headless servers, Browserless, or other remote setups, use a CDP profile instead.

## Remote browser control (node host proxy)

If the Gateway runs on a different machine than the browser, run a **node host** on the machine that has Chrome/Brave/Edge/Chromium. The Gateway will proxy browser actions to that node (no separate browser control server required).

Use `gateway.nodes.browser.mode` to control auto-routing and `gateway.nodes.browser.node` to pin a specific node if multiple are connected.

Security + remote setup: [Browser tool](/tools/browser), [Remote access](/gateway/remote), [Tailscale](/gateway/tailscale), [Security](/gateway/security)
