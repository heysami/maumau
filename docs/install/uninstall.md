---
summary: "Uninstall Maumau completely (CLI, service, state, workspace)"
read_when:
  - You want to remove Maumau from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

# Uninstall

Two paths:

- **Easy path** if `maumau` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
maumau uninstall
```

Non-interactive (automation / npx):

```bash
maumau uninstall --all --yes --non-interactive
npx -y maumau uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
maumau gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
maumau gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${MAUMAU_STATE_DIR:-$HOME/.maumau}"
```

If you set `MAUMAU_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.maumau/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g maumau
pnpm remove -g maumau
bun remove -g maumau
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/Maumau.app
```

Notes:

- If you used profiles (`--profile` / `MAUMAU_PROFILE`), repeat step 3 for each state dir (defaults are `~/.maumau-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `maumau` is missing.

### macOS (launchd)

Default label is `ai.maumau.gateway` (or `ai.maumau.<profile>`; legacy `com.maumau.*` may still exist):

```bash
launchctl bootout gui/$UID/ai.maumau.gateway
rm -f ~/Library/LaunchAgents/ai.maumau.gateway.plist
```

If you used a profile, replace the label and plist name with `ai.maumau.<profile>`. Remove any legacy `com.maumau.*` plists if present.

### Linux (systemd user unit)

Default unit name is `maumau-gateway.service` (or `maumau-gateway-<profile>.service`):

```bash
systemctl --user disable --now maumau-gateway.service
rm -f ~/.config/systemd/user/maumau-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `Maumau Gateway` (or `Maumau Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "Maumau Gateway"
Remove-Item -Force "$env:USERPROFILE\.maumau\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.maumau-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://maumau.ai/install.sh` or `install.ps1`, the CLI was installed with `npm install -g maumau@latest`.
Remove it with `npm rm -g maumau` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `maumau ...` / `bun run maumau ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.
