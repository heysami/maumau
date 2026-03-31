import { html, nothing } from "lit";
import type { MaumauConfig } from "../../../../src/config/types.maumau.js";
import type {
  TeamConfig,
  TeamCrossTeamLinkConfig,
  TeamMemberConfig,
  TeamWorkflowConfig,
} from "../../../../src/config/types.teams.js";
import {
  DEFAULT_TEAM_WORKFLOW_ID,
  findTeamWorkflow,
  listTeamWorkflows,
  resolveDefaultTeamWorkflowId,
} from "../../../../src/teams/model.js";
import { generateTeamOpenProsePreview } from "../../../../src/teams/openprose.js";
import { createNextTeamWorkflowConfig, STARTER_TEAM_ID } from "../../../../src/teams/presets.js";
import type { AgentsListResult } from "../types.ts";

type AgentOption = {
  id: string;
  label: string;
};

export type TeamsProps = {
  configValue: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configApplying: boolean;
  configDirty: boolean;
  configPath: string | null;
  agentsList: AgentsListResult | null;
  selectedTeamId: string | null;
  selectedWorkflowId: string | null;
  onSelectTeam: (teamId: string) => void;
  onSelectWorkflow: (workflowId: string) => void;
  onCreateTeam: (preset: "custom" | "starter") => void;
  onReplaceTeam: (teamId: string, nextTeam: TeamConfig) => void;
  onDeleteTeam: (teamId: string) => void;
  onSave: () => void;
  onApply: () => void;
  onRefresh: () => void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveTeams(configValue: Record<string, unknown> | null): TeamConfig[] {
  const teamsRecord = asRecord(configValue?.teams);
  const list = Array.isArray(teamsRecord?.list) ? teamsRecord.list : [];
  return list.filter((entry): entry is TeamConfig => Boolean(entry && typeof entry === "object"));
}

function resolveAgentOptions(
  configValue: Record<string, unknown> | null,
  agentsList: AgentsListResult | null,
): AgentOption[] {
  const options = new Map<string, AgentOption>();
  const addOption = (id: string, label?: string) => {
    const normalizedId = id.trim();
    if (!normalizedId) {
      return;
    }
    if (options.has(normalizedId)) {
      return;
    }
    const normalizedLabel = label?.trim();
    options.set(normalizedId, {
      id: normalizedId,
      label:
        normalizedLabel && normalizedLabel !== normalizedId
          ? `${normalizedLabel} (${normalizedId})`
          : normalizedId,
    });
  };

  for (const agent of agentsList?.agents ?? []) {
    const label =
      asTrimmedString(agent.name) ||
      asTrimmedString(agent.identity?.name) ||
      asTrimmedString(agent.id);
    addOption(agent.id, label);
  }

  const agentsRecord = asRecord(configValue?.agents);
  const configuredAgents = Array.isArray(agentsRecord?.list) ? agentsRecord.list : [];
  for (const entry of configuredAgents) {
    const record = asRecord(entry);
    const id = asTrimmedString(record?.id);
    if (!id) {
      continue;
    }
    addOption(id, asTrimmedString(record?.name));
  }

  if (options.size === 0) {
    addOption("main", "Main");
  }

  return Array.from(options.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function resolveSelectedTeam(
  teams: TeamConfig[],
  selectedTeamId: string | null,
): TeamConfig | null {
  if (teams.length === 0) {
    return null;
  }
  if (selectedTeamId) {
    const match = teams.find((team) => team.id === selectedTeamId);
    if (match) {
      return match;
    }
  }
  return teams[0] ?? null;
}

function resolveTeamMembers(team: TeamConfig): TeamMemberConfig[] {
  return Array.isArray(team.members) ? team.members : [];
}

function resolveCrossTeamLinks(team: TeamConfig): TeamCrossTeamLinkConfig[] {
  return Array.isArray(team.crossTeamLinks) ? team.crossTeamLinks : [];
}

function normalizeTeamWorkflowDefaults(workflows: TeamWorkflowConfig[]): TeamWorkflowConfig[] {
  if (workflows.length === 0) {
    return [];
  }
  const hasExplicitDefault = workflows.some((workflow) => workflow.default === true);
  return workflows.map((workflow, index) => ({
    ...workflow,
    default: workflow.default === true || (!hasExplicitDefault && index === 0) || undefined,
  }));
}

function replaceTeamWorkflows(team: TeamConfig, workflows: TeamWorkflowConfig[]): TeamConfig {
  return {
    ...team,
    workflows: normalizeTeamWorkflowDefaults(workflows),
    workflow: undefined,
  };
}

function resolveSelectedWorkflow(team: TeamConfig, selectedWorkflowId: string | null) {
  return findTeamWorkflow(team, selectedWorkflowId ?? resolveDefaultTeamWorkflowId(team));
}

function replaceWorkflowAt(
  team: TeamConfig,
  workflows: TeamWorkflowConfig[],
  workflowIndex: number,
  nextWorkflow: TeamWorkflowConfig,
): TeamConfig {
  const nextWorkflows =
    workflowIndex >= 0
      ? replaceAt(workflows, workflowIndex, nextWorkflow)
      : [...workflows, nextWorkflow];
  return replaceTeamWorkflows(team, nextWorkflows);
}

function replaceAt<T>(list: T[], index: number, nextValue: T): T[] {
  return list.map((entry, currentIndex) => (currentIndex === index ? nextValue : entry));
}

function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, currentIndex) => currentIndex !== index);
}

function moveItem<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= list.length) {
    return list;
  }
  const nextList = [...list];
  const [entry] = nextList.splice(index, 1);
  nextList.splice(nextIndex, 0, entry);
  return nextList;
}

function resolveMemberAgentOptions(
  agentOptions: AgentOption[],
  team: TeamConfig,
  memberIndex: number,
): AgentOption[] {
  const members = resolveTeamMembers(team);
  const currentAgentId = members[memberIndex]?.agentId ?? "";
  const blocked = new Set(
    members
      .map((member, index) => (index === memberIndex ? "" : member.agentId))
      .filter(Boolean)
      .concat(team.managerAgentId),
  );
  return agentOptions.filter((option) => option.id === currentAgentId || !blocked.has(option.id));
}

function resolveNewMemberCandidate(agentOptions: AgentOption[], team: TeamConfig): string | null {
  const blocked = new Set(resolveTeamMembers(team).map((member) => member.agentId));
  blocked.add(team.managerAgentId);
  const candidate = agentOptions.find((option) => !blocked.has(option.id));
  return candidate?.id ?? null;
}

function resolveLinkTargetOptions(
  teams: TeamConfig[],
  team: TeamConfig,
  agentOptions: AgentOption[],
  link: TeamCrossTeamLinkConfig,
): AgentOption[] {
  if (link.type === "team") {
    return teams
      .filter((candidate) => candidate.id !== team.id)
      .map((candidate) => ({
        id: candidate.id,
        label: candidate.name?.trim() ? `${candidate.name} (${candidate.id})` : candidate.id,
      }));
  }
  const teamAgentIds = new Set([
    team.managerAgentId,
    ...resolveTeamMembers(team).map((member) => member.agentId),
  ]);
  return agentOptions.filter(
    (option) => !teamAgentIds.has(option.id) || option.id === link.targetId,
  );
}

function renderOrgChart(team: TeamConfig, teams: TeamConfig[], agentOptions: AgentOption[]) {
  const members = resolveTeamMembers(team);
  const links = resolveCrossTeamLinks(team);
  const lookup = new Map(agentOptions.map((option) => [option.id, option.label]));
  const managerLabel = lookup.get(team.managerAgentId) ?? team.managerAgentId;

  return html`
    <div class="stack" style="gap: 14px;">
      <div class="card" style="padding: 14px; background: var(--surface-2, rgba(255,255,255,0.03));">
        <div class="muted">Manager</div>
        <div style="font-weight: 700; margin-top: 4px;">${managerLabel}</div>
        <div class="mono muted" style="margin-top: 4px;">${team.managerAgentId}</div>
      </div>
      <div class="muted">Specialist roster and default ownership:</div>
      <div class="muted" style="margin-top: -6px;">
        The selected workflow decides who runs sequentially, who runs in parallel, and who reviews whom.
      </div>
      ${
        members.length === 0
          ? html`
              <div class="callout">No specialists configured yet.</div>
            `
          : html`
              <div class="grid grid-cols-2" style="gap: 12px;">
                ${members.map((member) => {
                  const memberLabel = lookup.get(member.agentId) ?? member.agentId;
                  return html`
                    <div class="card" style="padding: 14px;">
                      <div class="muted">${member.role}</div>
                      <div style="font-weight: 700; margin-top: 4px;">${memberLabel}</div>
                      <div class="mono muted" style="margin-top: 4px;">${member.agentId}</div>
                      ${
                        member.description?.trim()
                          ? html`<div style="margin-top: 8px;">${member.description}</div>`
                          : nothing
                      }
                    </div>
                  `;
                })}
              </div>
            `
      }
      <div class="muted">Cross-team links:</div>
      ${
        links.length === 0
          ? html`
              <div class="callout">None. This team can only use its own manager and specialists.</div>
            `
          : html`
              <div class="stack" style="gap: 8px;">
                ${links.map((link) => {
                  const targetLabel =
                    link.type === "team"
                      ? (teams.find((candidate) => candidate.id === link.targetId)?.name?.trim() ??
                        link.targetId)
                      : (lookup.get(link.targetId) ?? link.targetId);
                  return html`
                    <div class="card" style="padding: 12px;">
                      <div style="font-weight: 600;">
                        ${link.type === "team" ? "Linked team" : "Linked agent"}: ${targetLabel}
                      </div>
                      <div class="mono muted" style="margin-top: 4px;">${link.targetId}</div>
                      ${
                        link.description?.trim()
                          ? html`<div style="margin-top: 8px;">${link.description}</div>`
                          : nothing
                      }
                    </div>
                  `;
                })}
              </div>
            `
      }
    </div>
  `;
}

export function renderTeams(props: TeamsProps) {
  const teams = resolveTeams(props.configValue);
  const agentOptions = resolveAgentOptions(props.configValue, props.agentsList);
  const selectedTeam = resolveSelectedTeam(teams, props.selectedTeamId);
  const selectedWorkflow = selectedTeam
    ? resolveSelectedWorkflow(selectedTeam, props.selectedWorkflowId)
    : null;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: flex-start; gap: 16px;">
        <div>
          <div class="card-title">Teams</div>
          <div class="card-sub">
            Manager-led agent teams that compile into generated OpenProse workflows.
          </div>
          ${
            props.configPath
              ? html`<div class="muted" style="margin-top: 8px;">Config: ${props.configPath}</div>`
              : nothing
          }
        </div>
        <div class="row" style="gap: 8px; flex-wrap: wrap;">
          <button class="btn btn--sm" ?disabled=${props.configLoading} @click=${props.onRefresh}>
            ${props.configLoading ? "Refreshing…" : "Refresh"}
          </button>
          <button class="btn btn--sm" @click=${() => props.onCreateTeam("custom")}>
            Create Team
          </button>
          <button class="btn btn--sm" @click=${() => props.onCreateTeam("starter")}>
            Create Starter Team
          </button>
          <button
            class="btn btn--sm"
            ?disabled=${props.configSaving || !props.configDirty}
            @click=${props.onSave}
          >
            ${props.configSaving ? "Saving…" : "Save"}
          </button>
          <button
            class="btn btn--sm primary"
            ?disabled=${props.configApplying || !props.configDirty}
            @click=${props.onApply}
          >
            ${props.configApplying ? "Applying…" : "Save & Apply"}
          </button>
        </div>
      </div>
      <div class="row" style="margin-top: 12px; gap: 8px; flex-wrap: wrap;">
        <div class="callout ${props.configDirty ? "warn" : "success"}" style="margin: 0;">
          ${props.configDirty ? "You have unsaved Teams changes." : "Teams config is in sync."}
        </div>
        <div class="callout" style="margin: 0;">
          <span class="mono">teams_run</span> uses the selected team definition as the canonical
          source of generated OpenProse.
        </div>
      </div>
    </section>

    ${
      teams.length === 0
        ? html`
            <section class="card" style="margin-top: 18px;">
              <div class="card-title">No Teams Yet</div>
              <div class="card-sub">
                Existing installs keep working without Teams. Create a custom team or add the bundled
                vibe-coder starter when you are ready.
              </div>
              <div class="row" style="margin-top: 16px; gap: 8px; flex-wrap: wrap;">
                <button class="btn" @click=${() => props.onCreateTeam("custom")}>Create Team</button>
                <button class="btn primary" @click=${() => props.onCreateTeam("starter")}>
                  Create Starter Team
                </button>
              </div>
            </section>
          `
        : html`
            <section class="grid" style="margin-top: 18px; grid-template-columns: minmax(260px, 320px) 1fr; gap: 18px;">
              <section class="card">
                <div class="row" style="justify-content: space-between;">
                  <div>
                    <div class="card-title">Team List</div>
                    <div class="card-sub">Choose a team to edit its members, workflows, and links.</div>
                  </div>
                </div>
                <div class="stack" style="margin-top: 16px; gap: 10px;">
                  ${teams.map((team) => {
                    const active = selectedTeam?.id === team.id;
                    const memberCount = resolveTeamMembers(team).length;
                    const workflowCount = listTeamWorkflows(team).length;
                    const isStarter = team.preset?.id === STARTER_TEAM_ID;
                    return html`
                      <button
                        type="button"
                        class="btn ${active ? "primary" : "btn--ghost"}"
                        style="justify-content: flex-start; text-align: left; width: 100%;"
                        @click=${() => props.onSelectTeam(team.id)}
                      >
                        <span>
                          ${team.name?.trim() || team.id}
                          <span class="muted">
                            · ${memberCount} specialist${memberCount === 1 ? "" : "s"}
                            · ${workflowCount} workflow${workflowCount === 1 ? "" : "s"}${
                              isStarter ? " · starter" : ""
                            }
                          </span>
                        </span>
                      </button>
                    `;
                  })}
                </div>
              </section>

              ${
                !selectedTeam
                  ? nothing
                  : (() => {
                      const members = resolveTeamMembers(selectedTeam);
                      const workflows = listTeamWorkflows(selectedTeam);
                      const activeWorkflow =
                        selectedWorkflow ??
                        resolveSelectedWorkflow(selectedTeam, props.selectedWorkflowId);
                      const activeWorkflowIndex = workflows.findIndex(
                        (workflow) => workflow.id === activeWorkflow.id,
                      );
                      const defaultWorkflowId = resolveDefaultTeamWorkflowId(selectedTeam);
                      const links = resolveCrossTeamLinks(selectedTeam);
                      const openProsePreview = generateTeamOpenProsePreview({
                        config: (props.configValue ?? {}) as MaumauConfig,
                        team: selectedTeam,
                        workflowId: activeWorkflow.id,
                      });
                      const newMemberAgentId = resolveNewMemberCandidate(
                        agentOptions,
                        selectedTeam,
                      );
                      const newLinkedAgentId =
                        resolveLinkTargetOptions(teams, selectedTeam, agentOptions, {
                          type: "agent",
                          targetId: "",
                        })[0]?.id ?? "";
                      const nextTeamLinkTarget =
                        teams.find((team) => team.id !== selectedTeam.id)?.id ?? "";
                      const updateTeam = (patch: Partial<TeamConfig>) =>
                        props.onReplaceTeam(selectedTeam.id, { ...selectedTeam, ...patch });
                      const replaceSelectedWorkflow = (nextWorkflow: TeamWorkflowConfig) => {
                        props.onReplaceTeam(
                          selectedTeam.id,
                          replaceWorkflowAt(
                            selectedTeam,
                            workflows,
                            activeWorkflowIndex,
                            nextWorkflow,
                          ),
                        );
                      };
                      const updateSelectedWorkflow = (patch: Partial<TeamWorkflowConfig>) => {
                        replaceSelectedWorkflow({
                          ...activeWorkflow,
                          ...patch,
                        });
                      };
                      const updateWorkflowDefault = (workflowId: string) => {
                        props.onReplaceTeam(
                          selectedTeam.id,
                          replaceTeamWorkflows(
                            selectedTeam,
                            workflows.map((workflow) => ({
                              ...workflow,
                              default: workflow.id === workflowId || undefined,
                            })),
                          ),
                        );
                      };

                      return html`
                        <section class="stack" style="gap: 18px;">
                          <section class="card">
                            <div class="row" style="justify-content: space-between; align-items: flex-start;">
                              <div>
                                <div class="card-title">Team Identity</div>
                                <div class="card-sub">
                                  Team ids stay stable so links and generated OpenProse paths stay deterministic.
                                </div>
                              </div>
                              <button
                                class="btn btn--sm danger"
                                @click=${() => props.onDeleteTeam(selectedTeam.id)}
                              >
                                Delete Team
                              </button>
                            </div>
                            <div class="grid grid-cols-2" style="margin-top: 16px; gap: 12px;">
                              <label class="field">
                                <span>Team Id</span>
                                <input .value=${selectedTeam.id} disabled />
                              </label>
                              <label class="field">
                                <span>Manager Agent</span>
                                <select
                                  .value=${selectedTeam.managerAgentId}
                                  @change=${(event: Event) =>
                                    updateTeam({
                                      managerAgentId: (event.target as HTMLSelectElement).value,
                                    })}
                                >
                                  ${agentOptions.map(
                                    (option) =>
                                      html`<option value=${option.id}>${option.label}</option>`,
                                  )}
                                </select>
                              </label>
                              <label class="field">
                                <span>Name</span>
                                <input
                                  .value=${selectedTeam.name ?? ""}
                                  @input=${(event: Event) =>
                                    updateTeam({
                                      name: (event.target as HTMLInputElement).value,
                                    })}
                                />
                              </label>
                              <label class="field">
                                <span>Preset</span>
                                <input
                                  .value=${
                                    selectedTeam.preset?.id
                                      ? `${selectedTeam.preset.id}${selectedTeam.preset.source ? ` · ${selectedTeam.preset.source}` : ""}`
                                      : "custom"
                                  }
                                  disabled
                                />
                              </label>
                            </div>
                            <label class="field" style="margin-top: 12px;">
                              <span>Description</span>
                              <textarea
                                rows="3"
                                .value=${selectedTeam.description ?? ""}
                                @input=${(event: Event) =>
                                  updateTeam({
                                    description: (event.target as HTMLTextAreaElement).value,
                                  })}
                              ></textarea>
                            </label>
                          </section>

                          <section class="card">
                            <div class="row" style="justify-content: space-between; align-items: flex-start; gap: 12px;">
                              <div>
                                <div class="card-title">Workflows</div>
                                <div class="card-sub">
                                  Reuse the same team for different objectives by defining multiple workflows.
                                </div>
                              </div>
                              <button
                                class="btn btn--sm"
                                @click=${() => {
                                  const nextWorkflow = createNextTeamWorkflowConfig(selectedTeam);
                                  props.onReplaceTeam(
                                    selectedTeam.id,
                                    replaceTeamWorkflows(selectedTeam, [
                                      ...workflows,
                                      nextWorkflow,
                                    ]),
                                  );
                                  props.onSelectWorkflow(nextWorkflow.id);
                                }}
                              >
                                Add Workflow
                              </button>
                            </div>
                            <div class="stack" style="margin-top: 16px; gap: 12px;">
                              ${workflows.map((workflow) => {
                                const isActive = workflow.id === activeWorkflow.id;
                                const isDefault = workflow.id === defaultWorkflowId;
                                return html`
                                  <div class="card" style="padding: 14px;">
                                    <div class="row" style="justify-content: space-between; align-items: center; gap: 12px;">
                                      <div>
                                        <div style="font-weight: 700;">
                                          ${workflow.name?.trim() || workflow.id}
                                          ${
                                            isDefault
                                              ? html`
                                                  <span class="muted"> · default</span>
                                                `
                                              : nothing
                                          }
                                        </div>
                                        <div class="mono muted" style="margin-top: 4px;">
                                          ${workflow.id}
                                        </div>
                                        ${
                                          workflow.description?.trim()
                                            ? html`
                                                <div style="margin-top: 8px;">
                                                  ${workflow.description}
                                                </div>
                                              `
                                            : nothing
                                        }
                                      </div>
                                      <button
                                        class="btn btn--sm ${isActive ? "primary" : "btn--ghost"}"
                                        @click=${() => props.onSelectWorkflow(workflow.id)}
                                      >
                                        ${isActive ? "Selected" : "Select"}
                                      </button>
                                    </div>
                                  </div>
                                `;
                              })}
                            </div>
                          </section>

                          <section class="card">
                            <div class="row" style="justify-content: space-between;">
                              <div>
                                <div class="card-title">Specialists</div>
                                <div class="card-sub">
                                  Specialists are ordinary agents reused inside this team with per-team role metadata.
                                </div>
                              </div>
                              <button
                                class="btn btn--sm"
                                ?disabled=${!newMemberAgentId}
                                @click=${() =>
                                  updateTeam({
                                    members: [
                                      ...members,
                                      {
                                        agentId: newMemberAgentId ?? selectedTeam.managerAgentId,
                                        role: `specialist-${members.length + 1}`,
                                      },
                                    ],
                                  })}
                              >
                                Add Specialist
                              </button>
                            </div>
                            ${
                              members.length === 0
                                ? html`
                                    <div class="callout" style="margin-top: 16px">
                                      No specialists yet. Add at least one to model a manager-plus-specialists workflow.
                                    </div>
                                  `
                                : html`
                                    <div class="stack" style="margin-top: 16px; gap: 12px;">
                                      ${members.map((member, index) => {
                                        const memberOptions = resolveMemberAgentOptions(
                                          agentOptions,
                                          selectedTeam,
                                          index,
                                        );
                                        return html`
                                          <div class="card" style="padding: 14px;">
                                            <div class="grid grid-cols-2" style="gap: 12px;">
                                              <label class="field">
                                                <span>Agent</span>
                                                <select
                                                  .value=${member.agentId}
                                                  @change=${(event: Event) =>
                                                    updateTeam({
                                                      members: replaceAt(members, index, {
                                                        ...member,
                                                        agentId: (event.target as HTMLSelectElement)
                                                          .value,
                                                      }),
                                                    })}
                                                >
                                                  ${memberOptions.map(
                                                    (option) =>
                                                      html`<option value=${option.id}>
                                                        ${option.label}
                                                      </option>`,
                                                  )}
                                                </select>
                                              </label>
                                              <label class="field">
                                                <span>Role</span>
                                                <input
                                                  .value=${member.role}
                                                  @input=${(event: Event) =>
                                                    updateTeam({
                                                      members: replaceAt(members, index, {
                                                        ...member,
                                                        role: (event.target as HTMLInputElement)
                                                          .value,
                                                      }),
                                                    })}
                                                />
                                              </label>
                                            </div>
                                            <label class="field" style="margin-top: 12px;">
                                              <span>Role Guidance</span>
                                              <textarea
                                                rows="2"
                                                .value=${member.description ?? ""}
                                                @input=${(event: Event) =>
                                                  updateTeam({
                                                    members: replaceAt(members, index, {
                                                      ...member,
                                                      description: (
                                                        event.target as HTMLTextAreaElement
                                                      ).value,
                                                    }),
                                                  })}
                                              ></textarea>
                                            </label>
                                            <div class="row" style="margin-top: 12px; gap: 8px; flex-wrap: wrap;">
                                              <button
                                                class="btn btn--sm"
                                                ?disabled=${index === 0}
                                                @click=${() =>
                                                  updateTeam({
                                                    members: moveItem(members, index, -1),
                                                  })}
                                              >
                                                Move Up
                                              </button>
                                              <button
                                                class="btn btn--sm"
                                                ?disabled=${index === members.length - 1}
                                                @click=${() =>
                                                  updateTeam({
                                                    members: moveItem(members, index, 1),
                                                  })}
                                              >
                                                Move Down
                                              </button>
                                              <button
                                                class="btn btn--sm danger"
                                                @click=${() =>
                                                  updateTeam({
                                                    members: removeAt(members, index),
                                                  })}
                                              >
                                                Remove
                                              </button>
                                            </div>
                                          </div>
                                        `;
                                      })}
                                    </div>
                                  `
                            }
                          </section>

                          <section class="card">
                            <div class="row" style="justify-content: space-between;">
                              <div>
                                <div class="card-title">Cross-Team Links</div>
                                <div class="card-sub">
                                  Team-internal delegation is open by default. Cross-team access stays explicit.
                                </div>
                              </div>
                              <div class="row" style="gap: 8px; flex-wrap: wrap;">
                                <button
                                  class="btn btn--sm"
                                  ?disabled=${!nextTeamLinkTarget}
                                  @click=${() =>
                                    updateTeam({
                                      crossTeamLinks: [
                                        ...links,
                                        { type: "team", targetId: nextTeamLinkTarget },
                                      ],
                                    })}
                                >
                                  Link Team
                                </button>
                                <button
                                  class="btn btn--sm"
                                  ?disabled=${!newLinkedAgentId}
                                  @click=${() =>
                                    updateTeam({
                                      crossTeamLinks: [
                                        ...links,
                                        {
                                          type: "agent",
                                          targetId: newLinkedAgentId,
                                        },
                                      ],
                                    })}
                                >
                                  Link Agent
                                </button>
                              </div>
                            </div>
                            ${
                              links.length === 0
                                ? html`
                                    <div class="callout" style="margin-top: 16px">No cross-team links configured.</div>
                                  `
                                : html`
                                    <div class="stack" style="margin-top: 16px; gap: 12px;">
                                      ${links.map((link, index) => {
                                        const targetOptions = resolveLinkTargetOptions(
                                          teams,
                                          selectedTeam,
                                          agentOptions,
                                          link,
                                        );
                                        const fallbackTargetId =
                                          targetOptions[0]?.id ??
                                          (link.type === "team" ? "" : selectedTeam.managerAgentId);
                                        return html`
                                          <div class="card" style="padding: 14px;">
                                            <div class="grid grid-cols-2" style="gap: 12px;">
                                              <label class="field">
                                                <span>Link Type</span>
                                                <select
                                                  .value=${link.type}
                                                  @change=${(event: Event) => {
                                                    const nextType = (
                                                      event.target as HTMLSelectElement
                                                    ).value as TeamCrossTeamLinkConfig["type"];
                                                    const nextOptions = resolveLinkTargetOptions(
                                                      teams,
                                                      selectedTeam,
                                                      agentOptions,
                                                      {
                                                        ...link,
                                                        type: nextType,
                                                      },
                                                    );
                                                    updateTeam({
                                                      crossTeamLinks: replaceAt(links, index, {
                                                        ...link,
                                                        type: nextType,
                                                        targetId: nextOptions[0]?.id ?? "",
                                                      }),
                                                    });
                                                  }}
                                                >
                                                  <option value="team">Team</option>
                                                  <option value="agent">Agent</option>
                                                </select>
                                              </label>
                                              <label class="field">
                                                <span>Target</span>
                                                <select
                                                  .value=${link.targetId || fallbackTargetId}
                                                  @change=${(event: Event) =>
                                                    updateTeam({
                                                      crossTeamLinks: replaceAt(links, index, {
                                                        ...link,
                                                        targetId: (
                                                          event.target as HTMLSelectElement
                                                        ).value,
                                                      }),
                                                    })}
                                                >
                                                  ${targetOptions.map(
                                                    (option) =>
                                                      html`<option value=${option.id}>
                                                        ${option.label}
                                                      </option>`,
                                                  )}
                                                </select>
                                              </label>
                                            </div>
                                            <label class="field" style="margin-top: 12px;">
                                              <span>Description</span>
                                              <input
                                                .value=${link.description ?? ""}
                                                @input=${(event: Event) =>
                                                  updateTeam({
                                                    crossTeamLinks: replaceAt(links, index, {
                                                      ...link,
                                                      description: (
                                                        event.target as HTMLInputElement
                                                      ).value,
                                                    }),
                                                  })}
                                              />
                                            </label>
                                            <div class="row" style="margin-top: 12px;">
                                              <button
                                                class="btn btn--sm danger"
                                                @click=${() =>
                                                  updateTeam({
                                                    crossTeamLinks: removeAt(links, index),
                                                  })}
                                              >
                                                Remove Link
                                              </button>
                                            </div>
                                          </div>
                                        `;
                                      })}
                                    </div>
                                  `
                            }
                          </section>

                          <section class="card">
                            <div class="row" style="justify-content: space-between; align-items: flex-start; gap: 12px;">
                              <div>
                                <div class="card-title">Workflow Settings</div>
                                <div class="card-sub">
                                  OpenProse is generated from the selected workflow. Raw
                                  <span class="mono">.prose</span> stays read-only in v1.
                                </div>
                              </div>
                              <div class="row" style="gap: 8px; flex-wrap: wrap;">
                                ${
                                  activeWorkflow.id === defaultWorkflowId
                                    ? html`
                                        <div class="callout success" style="margin: 0">Default workflow</div>
                                      `
                                    : html`
                                        <button
                                          class="btn btn--sm"
                                          @click=${() => updateWorkflowDefault(activeWorkflow.id)}
                                        >
                                          Make Default
                                        </button>
                                      `
                                }
                                <button
                                  class="btn btn--sm danger"
                                  ?disabled=${workflows.length <= 1}
                                  @click=${() => {
                                    if (workflows.length <= 1 || activeWorkflowIndex < 0) {
                                      return;
                                    }
                                    const nextWorkflows = removeAt(workflows, activeWorkflowIndex);
                                    const nextSelectedWorkflow =
                                      nextWorkflows[Math.max(0, activeWorkflowIndex - 1)] ??
                                      nextWorkflows[0];
                                    props.onReplaceTeam(
                                      selectedTeam.id,
                                      replaceTeamWorkflows(selectedTeam, nextWorkflows),
                                    );
                                    if (nextSelectedWorkflow) {
                                      props.onSelectWorkflow(nextSelectedWorkflow.id);
                                    }
                                  }}
                                >
                                  Remove Workflow
                                </button>
                              </div>
                            </div>
                            <div class="card-sub">
                              <span class="mono">teams_run</span> can target this workflow by id,
                              and <span class="mono">main</span> still remains the front door.
                            </div>
                            <div class="grid grid-cols-2" style="margin-top: 16px; gap: 12px;">
                              <label class="field">
                                <span>Workflow Id</span>
                                <input
                                  .value=${activeWorkflow.id}
                                  @change=${(event: Event) => {
                                    const nextWorkflowId =
                                      (event.target as HTMLInputElement).value.trim() ||
                                      DEFAULT_TEAM_WORKFLOW_ID;
                                    replaceSelectedWorkflow({
                                      ...activeWorkflow,
                                      id: nextWorkflowId,
                                    });
                                    props.onSelectWorkflow(nextWorkflowId);
                                  }}
                                />
                              </label>
                              <label class="field">
                                <span>Name</span>
                                <input
                                  .value=${activeWorkflow.name ?? ""}
                                  @input=${(event: Event) =>
                                    updateSelectedWorkflow({
                                      name: (event.target as HTMLInputElement).value,
                                    })}
                                />
                              </label>
                              <label class="field" style="grid-column: 1 / -1;">
                                <span>Description</span>
                                <textarea
                                  rows="3"
                                  .value=${activeWorkflow.description ?? ""}
                                  @input=${(event: Event) =>
                                    updateSelectedWorkflow({
                                      description: (event.target as HTMLTextAreaElement).value,
                                    })}
                                ></textarea>
                              </label>
                              <div class="callout" style="margin: 0;">
                                Use separate workflows when the same manager and specialists need
                                different objectives, prompts, or default entrypoints.
                              </div>
                            </div>
                            <label class="field" style="margin-top: 12px;">
                              <span>Manager Prompt</span>
                              <textarea
                                rows="4"
                                .value=${activeWorkflow.managerPrompt ?? ""}
                                @input=${(event: Event) =>
                                  updateSelectedWorkflow({
                                    managerPrompt: (event.target as HTMLTextAreaElement).value,
                                  })}
                              ></textarea>
                            </label>
                            <label class="field" style="margin-top: 12px;">
                              <span>Synthesis Prompt</span>
                              <textarea
                                rows="4"
                                .value=${activeWorkflow.synthesisPrompt ?? ""}
                                @input=${(event: Event) =>
                                  updateSelectedWorkflow({
                                    synthesisPrompt: (event.target as HTMLTextAreaElement).value,
                                  })}
                              ></textarea>
                            </label>
                          </section>

                          <section class="grid grid-cols-2" style="gap: 18px;">
                            <section class="card">
                              <div class="card-title">Org Chart / Workflow Preview</div>
                              <div class="card-sub">
                                Read-only visualization of manager, specialists, and explicit links.
                              </div>
                              <div style="margin-top: 16px;">
                                ${renderOrgChart(selectedTeam, teams, agentOptions)}
                              </div>
                            </section>
                            <section class="card">
                              <div class="card-title">Generated OpenProse</div>
                              <div class="card-sub">
                                Deterministic preview compiled from the selected workflow.
                              </div>
                              <pre class="code-block" style="margin-top: 16px; max-height: 720px; overflow: auto;">${openProsePreview}</pre>
                            </section>
                          </section>
                        </section>
                      `;
                    })()
              }
            </section>
          `
    }
  `;
}
