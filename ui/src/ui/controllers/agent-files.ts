import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  AgentFileEntry,
  AgentsFilesGetResult,
  AgentsFilesListResult,
  AgentsFilesSetResult,
} from "../types.ts";

export type AgentFilesState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesTargetId?: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileActive: string | null;
  agentFileSaving: boolean;
};

function mergeFileEntry(
  list: AgentsFilesListResult | null,
  entry: AgentFileEntry,
): AgentsFilesListResult | null {
  if (!list) {
    return list;
  }
  const hasEntry = list.files.some((file) => file.name === entry.name);
  const nextFiles = hasEntry
    ? list.files.map((file) => (file.name === entry.name ? entry : file))
    : [...list.files, entry];
  return { ...list, files: nextFiles };
}

export async function loadAgentFiles(state: AgentFilesState, agentId: string) {
  const resolvedAgentId = agentId.trim();
  if (!state.client || !state.connected || !resolvedAgentId) {
    return;
  }
  if (state.agentFilesLoading && state.agentFilesTargetId === resolvedAgentId) {
    return;
  }
  state.agentFilesTargetId = resolvedAgentId;
  state.agentFilesLoading = true;
  state.agentFilesError = null;
  try {
    const res = await state.client.request<AgentsFilesListResult | null>("agents.files.list", {
      agentId: resolvedAgentId,
    });
    if (state.agentFilesTargetId !== resolvedAgentId) {
      return;
    }
    if (res) {
      state.agentFilesList = res;
      if (state.agentFileActive && !res.files.some((file) => file.name === state.agentFileActive)) {
        state.agentFileActive = null;
      }
    }
  } catch (err) {
    if (state.agentFilesTargetId !== resolvedAgentId) {
      return;
    }
    state.agentFilesError = String(err);
  } finally {
    if (state.agentFilesTargetId === resolvedAgentId) {
      state.agentFilesLoading = false;
    }
  }
}

export async function loadAgentFileContent(
  state: AgentFilesState,
  agentId: string,
  name: string,
  opts?: { force?: boolean; preserveDraft?: boolean },
) {
  const resolvedAgentId = agentId.trim();
  if (!state.client || !state.connected || !resolvedAgentId) {
    return;
  }
  if (state.agentFilesTargetId && state.agentFilesTargetId !== resolvedAgentId) {
    return;
  }
  if (state.agentFilesLoading) {
    return;
  }
  if (!opts?.force && Object.hasOwn(state.agentFileContents, name)) {
    return;
  }
  state.agentFilesTargetId = resolvedAgentId;
  state.agentFilesLoading = true;
  state.agentFilesError = null;
  try {
    const res = await state.client.request<AgentsFilesGetResult | null>("agents.files.get", {
      agentId: resolvedAgentId,
      name,
    });
    if (state.agentFilesTargetId !== resolvedAgentId) {
      return;
    }
    if (res?.file) {
      const content = res.file.content ?? "";
      const previousBase = state.agentFileContents[name] ?? "";
      const currentDraft = state.agentFileDrafts[name];
      const preserveDraft = opts?.preserveDraft ?? true;
      state.agentFilesList = mergeFileEntry(state.agentFilesList, res.file);
      state.agentFileContents = { ...state.agentFileContents, [name]: content };
      if (
        !preserveDraft ||
        !Object.hasOwn(state.agentFileDrafts, name) ||
        currentDraft === previousBase
      ) {
        state.agentFileDrafts = { ...state.agentFileDrafts, [name]: content };
      }
    }
  } catch (err) {
    if (state.agentFilesTargetId !== resolvedAgentId) {
      return;
    }
    state.agentFilesError = String(err);
  } finally {
    if (state.agentFilesTargetId === resolvedAgentId) {
      state.agentFilesLoading = false;
    }
  }
}

export async function saveAgentFile(
  state: AgentFilesState,
  agentId: string,
  name: string,
  content: string,
) {
  const resolvedAgentId = agentId.trim();
  if (!state.client || !state.connected || state.agentFileSaving || !resolvedAgentId) {
    return;
  }
  state.agentFileSaving = true;
  state.agentFilesError = null;
  try {
    const res = await state.client.request<AgentsFilesSetResult | null>("agents.files.set", {
      agentId: resolvedAgentId,
      name,
      content,
    });
    if (state.agentFilesTargetId && state.agentFilesTargetId !== resolvedAgentId) {
      return;
    }
    if (res?.file) {
      state.agentFilesList = mergeFileEntry(state.agentFilesList, res.file);
      state.agentFileContents = { ...state.agentFileContents, [name]: content };
      state.agentFileDrafts = { ...state.agentFileDrafts, [name]: content };
    }
  } catch (err) {
    state.agentFilesError = String(err);
  } finally {
    state.agentFileSaving = false;
  }
}

export async function loadPinnedAgentFiles(
  state: AgentFilesState,
  agentId: string,
  names: string[],
  opts?: { preserveDraft?: boolean },
) {
  const resolvedAgentId = agentId.trim();
  if (!resolvedAgentId) {
    return;
  }
  await loadAgentFiles(state, resolvedAgentId);
  if (state.agentFilesTargetId !== resolvedAgentId) {
    return;
  }
  for (const name of names) {
    await loadAgentFileContent(state, resolvedAgentId, name, {
      preserveDraft: opts?.preserveDraft,
    });
    if (state.agentFilesTargetId !== resolvedAgentId) {
      return;
    }
  }
}
