---
summary: "Daily curation plus weekly synthesis recipe for reviewing user-facing sessions and proposing improvements"
read_when:
  - You want a daily reflection curation pass plus a weekly synthesis report
  - You need a cron recipe that inspects sessions across agents and workspaces
  - You want a plan-only reviewer that curates notes daily and writes a weekly report
title: "Weekly Reflection Reviewer"
---

# Weekly Reflection Reviewer

This is a **supported cron recipe**, not a new scheduler subsystem.

Use it when you want Maumau to review real user-facing conversations every day, curate signals into daily notes, and then synthesize those notes into a weekly reflection without auto-editing code or personality files.

## What this recipe does

- Runs as **two cron jobs**
- A **daily curation** pass runs every day at **17:00**
- A **weekly synthesis** pass runs on **Sunday at 18:00**
- Reviews **user-facing sessions only** across all agents and workspaces on one gateway
- Writes `reviews/daily/YYYY-MM-DD.md` every day so the weekly synthesis has curated inputs
- Writes `reviews/weekly/YYYY-WW.md` every week with solutions, recommendations, and follow-up tasks
- Sends a concise main-chat summary only for the **weekly** pass, and only when there is something worth surfacing **and** the default agent main session has a usable delivery target
- Stays **plan-only** in v1: it can inspect, research, and propose, but it must not auto-edit code, config, `AGENTS.md`, `SOUL.md`, tools, or plugins

## Why this uses cron

This workflow should run on exact daily and weekly schedules, in its own persistent sessions, with self-contained prompts. That makes [cron jobs](/automation/cron-jobs) the right fit, not [heartbeat](/gateway/heartbeat).

## Requirements

The reviewer needs these capabilities:

- `sessions_list`
- `sessions_history`
- `agents_list`
- `write`
- optional: `memory_search`, `memory_get`, `web_search`, `web_fetch`
- `message` for the optional main-chat notice

Cross-agent review also needs global session-tool visibility:

```json5
{
  tools: {
    sessions: { visibility: "all" },
    agentToAgent: {
      enabled: true,
      allow: ["*"],
    },
  },
}
```

With the default visibility, the reviewer can only see its own session tree.

## Choose the Reviewer Agent

Use the **default agent** when it is not sandbox-clamped for session tools.

If your default agent runs sandboxed and `agents.defaults.sandbox.sessionToolsVisibility` is still the default `"spawned"`, keep that clamp in place and move this job to a dedicated unsandboxed reviewer agent instead:

```bash
maumau agents add reviewer --workspace ~/.maumau/workspace-reviewer
```

Recommended sandbox-aware config:

```json5
{
  tools: {
    sessions: { visibility: "all" },
    agentToAgent: {
      enabled: true,
      allow: ["*"],
    },
  },
  agents: {
    defaults: {
      sandbox: {
        sessionToolsVisibility: "spawned",
      },
      userTimezone: "America/Chicago",
    },
  },
}
```

That combination lets an **unsandboxed** reviewer inspect all sessions while still clamping sandboxed sessions back to their own tree.

## Install the Daily and Weekly Jobs

First resolve the timezone you want the reflection runs to use. This recipe prefers `agents.defaults.userTimezone` when set, otherwise it falls back to the gateway host timezone.

```bash
REVIEW_TZ="$(maumau config get agents.defaults.userTimezone 2>/dev/null || true)"
if [ -z "$REVIEW_TZ" ] || [ "$REVIEW_TZ" = "null" ]; then
  REVIEW_TZ="$(node -e 'console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)')"
fi
```

Then create the daily curation job:

```bash
DAILY_PROMPT="$(cat <<'PROMPT'
You are the daily reflection curator for this Maumau gateway.

Stay plan-only. You may inspect sessions, memory, and current public information when needed, and you may write today's daily note. Do not edit code, config, bootstrap/personality files, cron, plugins, or any workspace files except `reviews/daily/YYYY-MM-DD.md`.

Process:
1. Use agents_list to find the default agent id.
2. Use sessions_list with activeMinutes=1440, kinds=["main","group","other"], limit=200, messageLimit=0.
3. Treat kind "other" rows as possible direct user sessions. Skip operational/internal chatter such as cron, hook, node, subagent, ACP, heartbeat, rows whose channel is "internal", and rows whose key, label, or display name are clearly operational.
4. Inspect up to the latest 200 non-tool messages per remaining candidate with sessions_history(includeTools=false).
5. Extract struggles, delights, durable preferences, and candidate fixes. Paraphrase safely; do not quote sensitive text unless clearly safe.
6. Use memory_search or memory_get only when helpful.
7. Write or update reviews/daily/YYYY-MM-DD.md in this workspace with these sections exactly: Day summary, Top struggles, Top delights, Durable preferences, Candidate fixes, Research follow-ups, Weekly carry-forward.
8. Always write the daily file, even on calm days. Keep calm days brief and explicitly say the day was calm.
9. Do not send chat. Reply only NO_REPLY.
PROMPT
)"

maumau cron add \
  --name "Daily reflection curation" \
  --cron "0 17 * * *" \
  --tz "$REVIEW_TZ" \
  --session "session:daily-reflection-curation" \
  --message "$DAILY_PROMPT" \
  --no-deliver
```

Then create the weekly synthesis job:

```bash
WEEKLY_PROMPT="$(cat <<'PROMPT'
You are the weekly reflection reviewer for this Maumau gateway.

Stay plan-only. You may inspect daily notes, sessions, memory, and current public information when needed, and you may write the weekly report. Do not edit code, config, bootstrap/personality files, cron, plugins, or any workspace files except reviews/weekly/YYYY-WW.md.

Process:
1. Use agents_list to find the default agent id.
2. Read the latest 7 daily notes under reviews/daily/.
3. If coverage is missing or incomplete, use sessions_list with activeMinutes=10080, kinds=["main","group","other"], limit=200, messageLimit=0, then inspect up to the latest 200 non-tool messages with sessions_history(includeTools=false).
4. Treat kind "other" rows as possible direct user sessions. Skip operational/internal chatter such as cron, hook, node, subagent, ACP, heartbeat, rows whose channel is "internal", and rows whose key, label, or display name are clearly operational.
5. Synthesize the week from daily notes first, then use raw sessions only to fill gaps or validate high-impact claims.
6. Extract the top struggles, delights, recurring do's and don'ts, personality edits, tooling opportunities, recommended solutions or experiments, research-backed recommendations, and next-week tasks. Paraphrase safely; do not quote sensitive text unless clearly safe.
7. Use memory_search or memory_get only when helpful. Use web_search or web_fetch only for up to 3 high-leverage items that need current verification, and include links in the report.
8. Write reviews/weekly/YYYY-WW.md in this workspace with these exact sections: Week overview, Top struggles, Top delights, Recurring do's, Recurring don'ts, Suggested personality edits, Suggested tooling/plugin opportunities, Recommended solutions / experiments, Research-backed recommendations, Next-week task plan.
9. Always write the weekly report, even on calm weeks. Keep calm weeks brief and explicitly say the week was calm.
10. If the report is worth surfacing and the default main session has usable deliveryContext with explicit target info, send one concise main-chat summary naming the report path and 2 to 4 highest-leverage findings. Otherwise skip chat.
11. Reply only NO_REPLY.
PROMPT
)"

maumau cron add \
  --name "Weekly reflection reviewer" \
  --cron "0 18 * * 0" \
  --tz "$REVIEW_TZ" \
  --session "session:weekly-reflection" \
  --message "$WEEKLY_PROMPT" \
  --no-deliver
```

If you are using a dedicated reviewer agent, add `--agent reviewer` to **both** commands.

## Behavior Notes

- `--session "session:daily-reflection-curation"` keeps a stable daily curator session without touching your main chat history.
- `--session "session:weekly-reflection"` keeps a stable weekly synthesis session without touching your main chat history.
- The daily pass runs at **17:00** so Sunday's curation lands before the **18:00** weekly synthesis.
- `--no-deliver` means cron itself will not auto-announce a summary. The **weekly** prompt decides whether to send a targeted `message`.
- The daily pass should never send chat.
- Both jobs should return `NO_REPLY` so the runs do not emit duplicate cron replies.
- The weekly report is still written when there is no usable delivery target for the main chat.

## Validation Checklist

After creating the jobs, verify:

- `maumau cron list` shows one enabled job named `Daily reflection curation`
- `maumau cron list` shows one enabled job named `Weekly reflection reviewer`
- the daily schedule is `0 17 * * *` with the expected timezone
- the weekly schedule is `0 18 * * 0` with the expected timezone
- the daily `sessionTarget` is `session:daily-reflection-curation`
- the weekly `sessionTarget` is `session:weekly-reflection`
- both jobs use delivery mode `none`
- the jobs are pinned to `reviewer` only if you intentionally moved them off the default agent

For config behavior, confirm:

- with default session-tool visibility, cross-agent review is blocked
- with `tools.sessions.visibility = "all"` plus `tools.agentToAgent.enabled = true`, the reviewer can enumerate sessions across agents
- sandboxed sessions still clamp to their own tree when `agents.defaults.sandbox.sessionToolsVisibility = "spawned"`
- the daily pass writes one `reviews/daily/YYYY-MM-DD.md` file per day
- the weekly pass writes one `reviews/weekly/YYYY-WW.md` file per week and uses daily notes as its primary input

See also:

- [Cron jobs](/automation/cron-jobs)
- [Cron vs Heartbeat](/automation/cron-vs-heartbeat)
- [Session tools](/concepts/session-tool)
- [Timezones](/concepts/timezone)
