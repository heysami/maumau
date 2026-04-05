import { html, nothing } from "lit";

export type TeamPromptDialogProps = {
  open: boolean;
  teamLabel: string;
  workflowLabel: string;
  prompt: string;
  busy: boolean;
  error: string | null;
  summary: string | null;
  warnings: string[];
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function renderTeamPromptDialog(props: TeamPromptDialogProps) {
  if (!props.open) {
    return nothing;
  }
  return html`
    <section class="card team-prompt-editor">
      <div class="row" style="justify-content: space-between; align-items: flex-start; gap: 16px;">
        <div>
          <div class="card-title">Prompt Team Changes</div>
          <div class="card-sub">${props.teamLabel} · ${props.workflowLabel}</div>
        </div>
        <button class="btn btn--sm" type="button" ?disabled=${props.busy} @click=${props.onClose}>
          Close
        </button>
      </div>
      <div class="muted" style="margin-top: 14px; font-size: 13px; line-height: 1.5;">
        Describe how this team should change. The updater only edits structured team fields,
        workflow/OpenProse-driving inputs, and related agent metadata when your prompt actually
        touches those areas.
      </div>
      <label class="field" style="margin-top: 16px;">
        <span>Change request</span>
        <textarea
          rows="8"
          .value=${props.prompt}
          ?disabled=${props.busy}
          @input=${(event: Event) =>
            props.onPromptChange((event.target as HTMLTextAreaElement).value)}
        ></textarea>
      </label>
      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 16px;">${props.error}</div>`
          : nothing
      }
      ${
        props.summary
          ? html`
              <div class="callout success" style="margin-top: 16px;">
                <div style="font-weight: 600; margin-bottom: 6px;">Draft updated</div>
                <div>${props.summary}</div>
                <div class="muted" style="margin-top: 8px;">
                  Review the updated team config and Save or Save & Apply when ready.
                </div>
              </div>
            `
          : nothing
      }
      ${
        props.warnings.length > 0
          ? html`
              <div class="callout" style="margin-top: 16px;">
                <div style="font-weight: 600; margin-bottom: 6px;">Notes</div>
                <ul style="margin: 0; padding-left: 18px;">
                  ${props.warnings.map((warning) => html`<li>${warning}</li>`)}
                </ul>
              </div>
            `
          : nothing
      }
      <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 16px;">
        <button class="btn btn--sm" type="button" ?disabled=${props.busy} @click=${props.onClose}>
          Close
        </button>
        <button
          class="btn btn--sm primary"
          type="button"
          ?disabled=${props.busy || !props.prompt.trim()}
          @click=${props.onSubmit}
        >
          ${props.busy ? "Updating…" : "Update Draft"}
        </button>
      </div>
    </section>
  `;
}
