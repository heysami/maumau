import { describe, expect, it } from "vitest";
import { formatCapabilityPromptSummaryLine, type CapabilityRow } from "./capabilities.js";

function createCapabilityRow(
  overrides: Partial<CapabilityRow> & Pick<CapabilityRow, "id" | "kind">,
): CapabilityRow {
  return {
    declared: true,
    exposedToSession: true,
    installed: true,
    ready: false,
    ...overrides,
  };
}

describe("formatCapabilityPromptSummaryLine", () => {
  it("tells the model to proactively publish private previews for previewable web artifacts", () => {
    expect(
      formatCapabilityPromptSummaryLine(
        createCapabilityRow({
          id: "preview-private",
          kind: "preview",
          ready: true,
          privateReady: true,
          publicShareReady: true,
        }),
      ),
    ).toContain("proactively publish a private preview link");
    expect(
      formatCapabilityPromptSummaryLine(
        createCapabilityRow({
          id: "preview-private",
          kind: "preview",
          ready: true,
          privateReady: true,
          publicShareReady: true,
        }),
      ),
    ).toContain("localhost and 127.0.0.1 still do not count");
  });

  it("tells the model not to auto-send private previews when the requester is not on Tailscale", () => {
    expect(
      formatCapabilityPromptSummaryLine(
        createCapabilityRow({
          id: "preview-private",
          kind: "preview",
          blockedReason: "user_not_on_tailscale",
          suggestedFix: "Ask the requester to connect to Tailscale.",
        }),
      ),
    ).toContain("Do not auto-send");
  });

  it("offers a truthful tailnet fallback when host Tailscale is available but requester verification is missing", () => {
    expect(
      formatCapabilityPromptSummaryLine(
        createCapabilityRow({
          id: "preview-private",
          kind: "preview",
          installed: true,
          blockedReason: "user_not_on_tailscale",
          suggestedFix: "Ask the requester to connect to Tailscale.",
        }),
      ),
    ).toContain("tailnet-only fallback");
    expect(
      formatCapabilityPromptSummaryLine(
        createCapabilityRow({
          id: "preview-private",
          kind: "preview",
          installed: true,
          blockedReason: "user_not_on_tailscale",
          suggestedFix: "Ask the requester to connect to Tailscale.",
        }),
      ),
    ).toContain("localhost and 127.0.0.1 do not satisfy");
  });

  it("tells the model to use a verified host-local fallback when preview publishing is route-blocked", () => {
    expect(
      formatCapabilityPromptSummaryLine(
        createCapabilityRow({
          id: "preview-private",
          kind: "preview",
          blockedReason: "route_blocked",
          suggestedFix: "Use preview publishing from an owner direct chat.",
        }),
      ),
    ).toContain("proactively arrange a simple host-local server");
    expect(
      formatCapabilityPromptSummaryLine(
        createCapabilityRow({
          id: "preview-private",
          kind: "preview",
          blockedReason: "route_blocked",
          suggestedFix: "Use preview publishing from an owner direct chat.",
        }),
      ),
    ).toContain("requester-openable non-loopback URL");
  });

  it("keeps public shares explicit even when the capability is ready", () => {
    expect(
      formatCapabilityPromptSummaryLine(
        createCapabilityRow({
          id: "preview-public-share",
          kind: "preview",
          ready: true,
          privateReady: false,
          publicShareReady: true,
        }),
      ),
    ).toContain("Public shares are never automatic");
  });

  it("tells the model how to use delegated generic tools", () => {
    expect(
      formatCapabilityPromptSummaryLine(
        createCapabilityRow({
          id: "image_generate",
          kind: "tool",
          ready: true,
          exposedToSession: false,
          delegatedAgentId: "design-studio-image-visual-designer",
        }),
      ),
    ).toContain('sessions_spawn with agentId="design-studio-image-visual-designer"');
  });
});
