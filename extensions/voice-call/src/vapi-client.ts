type Logger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  debug?: (message: string) => void;
};

export type VapiAssistant = {
  id: string;
  name?: string;
  model?: Record<string, unknown>;
  voice?: Record<string, unknown>;
  transcriber?: Record<string, unknown>;
  firstMessage?: string;
  [key: string]: unknown;
};

export type VapiPhoneNumber = {
  id: string;
  number?: string;
  name?: string;
  provider?: string;
  phoneCallProvider?: string;
  [key: string]: unknown;
};

export type VapiCall = {
  id: string;
  status?: string;
  endedReason?: string;
  assistantId?: string;
  phoneNumberId?: string;
  customer?: {
    number?: string;
    [key: string]: unknown;
  };
  phoneCallProvider?: string;
  phoneCallProviderId?: string;
  monitor?: {
    controlUrl?: string;
    listenUrl?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function coerceArrayResult<T extends { id: string }>(
  raw: unknown,
  candidateKeys: readonly string[],
  mapItem: (value: unknown) => T | null,
): T[] {
  const directItems = Array.isArray(raw) ? raw : null;
  const object = asObject(raw);
  const keyedItems =
    object &&
    candidateKeys
      .map((key) => object[key])
      .find((value) => Array.isArray(value) && value.length >= 0);
  const source = directItems ?? (Array.isArray(keyedItems) ? keyedItems : []);
  return source.map(mapItem).filter((value): value is T => Boolean(value));
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(
      `Vapi API returned non-JSON ${response.status} response: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export class VapiClient {
  private apiKey: string;
  private baseUrl: string;
  private logger?: Logger;

  constructor(params: { apiKey: string; baseUrl?: string; logger?: Logger }) {
    this.apiKey = params.apiKey;
    this.baseUrl = (params.baseUrl ?? "https://api.vapi.ai").replace(/\/+$/, "");
    this.logger = params.logger;
  }

  private async requestJson<T>(params: {
    path: string;
    method?: "GET" | "POST";
    body?: unknown;
  }): Promise<T> {
    const response = await fetch(`${this.baseUrl}${params.path}`, {
      method: params.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: params.body == null ? undefined : JSON.stringify(params.body),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      const object = asObject(payload);
      const errorText =
        asString(object?.message) ??
        asString(object?.error) ??
        asString(object?.status) ??
        response.statusText;
      throw new Error(`Vapi API error: ${response.status} ${errorText}`);
    }
    return payload as T;
  }

  async listAssistants(): Promise<VapiAssistant[]> {
    const payload = await this.requestJson<unknown>({ path: "/assistant" });
    return coerceArrayResult(payload, ["assistants", "data", "items"], (value) => {
      const object = asObject(value);
      const id = asString(object?.id);
      return id ? ({ ...object, id } as VapiAssistant) : null;
    });
  }

  async getAssistant(id: string): Promise<VapiAssistant> {
    try {
      const payload = await this.requestJson<unknown>({
        path: `/assistant/${encodeURIComponent(id)}`,
      });
      const object = asObject(payload);
      const resolvedId = asString(object?.id);
      if (resolvedId) {
        return { ...object, id: resolvedId } as VapiAssistant;
      }
    } catch (err) {
      this.logger?.debug?.(`[voice-call] Falling back to assistant list lookup: ${String(err)}`);
    }
    const assistant = (await this.listAssistants()).find((entry) => entry.id === id);
    if (!assistant) {
      throw new Error(`Vapi assistant not found: ${id}`);
    }
    return assistant;
  }

  async listPhoneNumbers(): Promise<VapiPhoneNumber[]> {
    const payload = await this.requestJson<unknown>({ path: "/phone-number" });
    return coerceArrayResult(payload, ["phoneNumbers", "data", "items"], (value) => {
      const object = asObject(value);
      const id = asString(object?.id);
      return id ? ({ ...object, id } as VapiPhoneNumber) : null;
    });
  }

  async createCall(body: Record<string, unknown>): Promise<VapiCall> {
    const payload = await this.requestJson<unknown>({
      path: "/call",
      method: "POST",
      body,
    });
    const object = asObject(payload);
    const id = asString(object?.id);
    if (!id) {
      throw new Error("Vapi create call response missing call id");
    }
    return { ...object, id } as VapiCall;
  }

  async getCall(id: string): Promise<VapiCall> {
    const payload = await this.requestJson<unknown>({ path: `/call/${encodeURIComponent(id)}` });
    const object = asObject(payload);
    const resolvedId = asString(object?.id);
    if (!resolvedId) {
      throw new Error(`Vapi call lookup returned no id for ${id}`);
    }
    return { ...object, id: resolvedId } as VapiCall;
  }

  async controlCall(controlUrl: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(controlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Vapi call control error: ${response.status} ${errorText.trim() || response.statusText}`,
      );
    }
  }
}
