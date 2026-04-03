import type {
  BrowserActResponse,
  BrowserActRequest,
  browserAct,
  browserNavigate,
} from "../../browser/client-actions.js";
import type {
  browserOpenTab,
  browserStart,
  browserStatus,
  browserTabs,
} from "../../browser/client.js";
import { resolveBrowserConfig } from "../../browser/config.js";
import type { MaumauConfig } from "../../config/config.js";
import {
  listSessionCapabilities,
  type CapabilityRow,
  type SessionCapabilityOptions,
} from "../capabilities.js";

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_RESULT_LIMIT = 10;
const MAX_RESULT_LIMIT = 25;

type BrowserDeps = {
  browserAct: typeof browserAct;
  browserNavigate: typeof browserNavigate;
  browserOpenTab: typeof browserOpenTab;
  browserStart: typeof browserStart;
  browserStatus: typeof browserStatus;
  browserTabs: typeof browserTabs;
};

type GmailDigestLane = {
  capabilityId: "browser-existing-session" | "clawd-cursor";
  pathLabel: "Browser existing-session" | "Clawd Cursor desktop control";
  profile: string;
  blockedRow?: CapabilityRow;
};

type GmailDigestExtractedPage = {
  state: "ready" | "sign_in_required" | "not_gmail";
  title?: string;
  href?: string;
  visibleText?: string;
  items?: GmailReceiptDigestItem[];
};

export type GmailReceiptDigestItem = {
  merchant: string;
  amount?: string;
  currency?: string;
  amountValue?: number;
  dateText?: string;
  category: string;
  subject?: string;
  snippet?: string;
};

export type GmailReceiptDigestResult = {
  workflow: "gmail_receipt_digest";
  capabilityPathUsed: GmailDigestLane["pathLabel"];
  capabilityId: GmailDigestLane["capabilityId"];
  profile: string;
  searchQuery: string;
  searchUrl: string;
  items: GmailReceiptDigestItem[];
  totalsByCurrency: Record<string, number>;
  count: number;
  usedFallback: boolean;
  fallbackReason?: string;
};

function normalizePositiveInteger(raw: unknown, fallback: number, max: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, Math.floor(raw)));
}

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function findCapabilityRow(
  rows: CapabilityRow[],
  id: "browser-existing-session" | "clawd-cursor",
): CapabilityRow | undefined {
  return rows.find((row) => row.id === id);
}

function describeCapabilityBlock(row: CapabilityRow | undefined, label: string): string {
  if (!row) {
    return `${label} is unavailable.`;
  }
  if (row.ready) {
    return `${label} is ready.`;
  }
  const reason = row.blockedReason ? ` (${row.blockedReason})` : "";
  const fix = row.suggestedFix ? ` ${row.suggestedFix}` : "";
  return `${label} is not ready${reason}.${fix}`;
}

function findClawdProfileName(cfg: MaumauConfig): string | undefined {
  const resolved = resolveBrowserConfig(cfg.browser, cfg);
  return Object.entries(resolved.profiles).find(([, profile]) => profile?.driver === "clawd")?.[0];
}

function buildSearchQuery(query: string | undefined, lookbackDays: number): string {
  const trimmed = query?.trim();
  if (trimmed) {
    return trimmed;
  }
  return `newer_than:${String(lookbackDays)}d (receipt OR order OR billing OR invoice OR charged)`;
}

function buildSearchUrl(query: string): string {
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`;
}

function normalizeCurrencySymbol(amount: string | undefined): string | undefined {
  if (!amount) {
    return undefined;
  }
  if (amount.startsWith("US$")) {
    return "USD";
  }
  if (amount.startsWith("CA$")) {
    return "CAD";
  }
  if (amount.startsWith("S$")) {
    return "SGD";
  }
  if (amount.startsWith("€")) {
    return "EUR";
  }
  if (amount.startsWith("£")) {
    return "GBP";
  }
  if (amount.startsWith("¥")) {
    return "JPY";
  }
  if (amount.startsWith("₹")) {
    return "INR";
  }
  if (amount.startsWith("$")) {
    return "USD";
  }
  return undefined;
}

function parseAmountValue(amount: string | undefined): number | undefined {
  if (!amount) {
    return undefined;
  }
  const numeric = amount.replace(/[^0-9.]+/g, "");
  if (!numeric) {
    return undefined;
  }
  const parsed = Number.parseFloat(numeric);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function categorizeReceipt(item: Pick<GmailReceiptDigestItem, "merchant" | "subject" | "snippet">): string {
  const haystack = [item.merchant, item.subject, item.snippet]
    .map((entry) => entry?.toLowerCase() ?? "")
    .join(" ");
  if (/(uber|grab|lyft|delta|united|airbnb|booking|hotel)/.test(haystack)) {
    return "travel";
  }
  if (/(netflix|spotify|apple|google one|dropbox|notion|slack|figma|openai|anthropic)/.test(haystack)) {
    return "software";
  }
  if (/(electric|water|internet|phone|utility|bill pay)/.test(haystack)) {
    return "bills";
  }
  if (/(doordash|deliveroo|grubhub|ubereats|restaurant|cafe|coffee|food)/.test(haystack)) {
    return "food";
  }
  if (/(market|grocery|whole foods|trader joe|aldi|fairprice|tesco)/.test(haystack)) {
    return "groceries";
  }
  if (/(amazon|shopify|order|receipt|invoice|store|target|walmart|ikea|purchase)/.test(haystack)) {
    return "shopping";
  }
  return "other";
}

function normalizeDigestItems(rawItems: unknown, limit: number): GmailReceiptDigestItem[] {
  if (!Array.isArray(rawItems)) {
    return [];
  }
  const items: GmailReceiptDigestItem[] = [];
  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const merchant = trimToUndefined((entry as { merchant?: unknown }).merchant) ?? "Unknown";
    const amount = trimToUndefined((entry as { amount?: unknown }).amount);
    const subject = trimToUndefined((entry as { subject?: unknown }).subject);
    const snippet = trimToUndefined((entry as { snippet?: unknown }).snippet);
    const dateText = trimToUndefined((entry as { dateText?: unknown }).dateText);
    const currency = trimToUndefined((entry as { currency?: unknown }).currency) ?? normalizeCurrencySymbol(amount);
    const amountValue =
      typeof (entry as { amountValue?: unknown }).amountValue === "number"
        ? ((entry as { amountValue?: number }).amountValue ?? undefined)
        : parseAmountValue(amount);
    items.push({
      merchant,
      amount,
      currency,
      amountValue,
      dateText,
      subject,
      snippet,
      category: categorizeReceipt({ merchant, subject, snippet }),
    });
    if (items.length >= limit) {
      break;
    }
  }
  return items;
}

function sumTotalsByCurrency(items: GmailReceiptDigestItem[]): Record<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!item.currency || typeof item.amountValue !== "number") {
      continue;
    }
    const current = totals.get(item.currency) ?? 0;
    totals.set(item.currency, Math.round((current + item.amountValue) * 100) / 100);
  }
  return Object.fromEntries(totals);
}

function buildReceiptExtractionScript(limit: number): string {
  return `() => {
    const maxItems = ${String(limit)};
    const amountRe = /(US\\$|CA\\$|S\\$|€|£|¥|₹|\\$)\\s?\\d[\\d,]*(?:\\.\\d{2})?/g;
    const clean = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
    const bodyText = clean(document.body?.innerText ?? "");
    const title = clean(document.title ?? "");
    const href = String(location.href ?? "");
    if (/accounts\\.google\\.com/.test(href) || /\\b(sign in|choose an account)\\b/i.test(title + " " + bodyText)) {
      return { state: "sign_in_required", title, href, visibleText: bodyText.slice(0, 12000), items: [] };
    }
    const candidates = [];
    const selectors = ["tr.zA", "div[role=\\"main\\"] tr", "div[role=\\"main\\"] [data-legacy-thread-id]"];
    for (const selector of selectors) {
      for (const node of Array.from(document.querySelectorAll(selector))) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        candidates.push(node);
      }
      if (candidates.length > 0) {
        break;
      }
    }
    const unique = new Set();
    const items = [];
    for (const node of candidates) {
      const rowText = clean(node.innerText || node.textContent || "");
      if (!rowText || unique.has(rowText)) {
        continue;
      }
      unique.add(rowText);
      const amountMatch = Array.from(rowText.matchAll(amountRe))[0];
      if (!amountMatch) {
        continue;
      }
      const merchant =
        clean(
          node.querySelector(".yP, .zF, .yW span[email], span[email], .go span, .y6 span")?.textContent,
        ) ||
        clean(rowText.split(/\\n+/)[0]) ||
        "Unknown";
      const subject =
        clean(node.querySelector(".bog, .bqe")?.textContent) ||
        clean(rowText.split(/\\n+/)[1]) ||
        merchant;
      const snippet =
        clean(node.querySelector(".y2, .y6")?.textContent) ||
        rowText;
      const dateText = clean(
        node.querySelector(".xW span, time, [data-time]")?.getAttribute("title") ||
          node.querySelector(".xW span, time, [data-time]")?.textContent,
      );
      items.push({
        merchant,
        amount: amountMatch[0],
        currency: undefined,
        amountValue: undefined,
        dateText,
        subject,
        snippet,
      });
      if (items.length >= maxItems) {
        break;
      }
    }
    return {
      state: /mail\\.google\\.com/.test(href) ? "ready" : "not_gmail",
      title,
      href,
      visibleText: bodyText.slice(0, 12000),
      items,
    };
  }`;
}

async function ensureProfileRunning(
  deps: BrowserDeps,
  baseUrl: string | undefined,
  profile: string,
): Promise<void> {
  const status = await deps.browserStatus(baseUrl, { profile });
  if (!status.running) {
    await deps.browserStart(baseUrl, { profile });
  }
}

async function openSearchTarget(params: {
  deps: BrowserDeps;
  baseUrl: string | undefined;
  profile: string;
  searchUrl: string;
}): Promise<string> {
  const tabs = await params.deps.browserTabs(params.baseUrl, { profile: params.profile }).catch(
    () => [],
  );
  const gmailTab = tabs.find((tab) => tab.url.includes("mail.google.com"));
  if (gmailTab?.targetId) {
    await params.deps.browserNavigate(params.baseUrl, {
      url: params.searchUrl,
      targetId: gmailTab.targetId,
      profile: params.profile,
    });
    return gmailTab.targetId;
  }
  const opened = await params.deps.browserOpenTab(params.baseUrl, params.searchUrl, {
    profile: params.profile,
  });
  return opened.targetId;
}

async function extractGmailReceiptPage(params: {
  deps: BrowserDeps;
  baseUrl: string | undefined;
  profile: string;
  targetId: string;
  limit: number;
}): Promise<GmailDigestExtractedPage> {
  await params.deps.browserAct(
    params.baseUrl,
    {
      kind: "wait",
      targetId: params.targetId,
      timeMs: 1500,
    },
    { profile: params.profile },
  );
  const result = await params.deps.browserAct(
    params.baseUrl,
    {
      kind: "evaluate",
      targetId: params.targetId,
      fn: buildReceiptExtractionScript(params.limit),
    } satisfies BrowserActRequest,
    { profile: params.profile },
  );
  return parseExtractedPage(result);
}

function parseExtractedPage(response: BrowserActResponse): GmailDigestExtractedPage {
  const raw = response.result;
  if (!raw || typeof raw !== "object") {
    return { state: "not_gmail", items: [] };
  }
  const record = raw as {
    state?: unknown;
    title?: unknown;
    href?: unknown;
    visibleText?: unknown;
    items?: unknown;
  };
  const state =
    record.state === "ready" || record.state === "sign_in_required" || record.state === "not_gmail"
      ? record.state
      : "not_gmail";
  const items = normalizeDigestItems(record.items, MAX_RESULT_LIMIT);
  return {
    state,
    title: trimToUndefined(record.title),
    href: trimToUndefined(record.href),
    visibleText: trimToUndefined(record.visibleText),
    items,
  };
}

async function runLaneDigest(params: {
  lane: GmailDigestLane;
  deps: BrowserDeps;
  baseUrl: string | undefined;
  searchQuery: string;
  searchUrl: string;
  limit: number;
}): Promise<GmailDigestExtractedPage> {
  await ensureProfileRunning(params.deps, params.baseUrl, params.lane.profile);
  const targetId = await openSearchTarget({
    deps: params.deps,
    baseUrl: params.baseUrl,
    profile: params.lane.profile,
    searchUrl: params.searchUrl,
  });
  return await extractGmailReceiptPage({
    deps: params.deps,
    baseUrl: params.baseUrl,
    profile: params.lane.profile,
    targetId,
    limit: params.limit,
  });
}

function resolvePrimaryLane(params: {
  capabilities: CapabilityRow[];
  cfg: MaumauConfig;
}): GmailDigestLane {
  const existingRow = findCapabilityRow(params.capabilities, "browser-existing-session");
  if (existingRow?.ready) {
    return {
      capabilityId: "browser-existing-session",
      pathLabel: "Browser existing-session",
      profile: "user",
    };
  }

  const clawdRow = findCapabilityRow(params.capabilities, "clawd-cursor");
  const clawdProfile = findClawdProfileName(params.cfg);
  if (clawdRow?.ready && clawdProfile) {
    return {
      capabilityId: "clawd-cursor",
      pathLabel: "Clawd Cursor desktop control",
      profile: clawdProfile,
    };
  }

  throw new Error(
    existingRow && !existingRow.ready
      ? describeCapabilityBlock(existingRow, "Browser existing-session")
      : describeCapabilityBlock(clawdRow, "Clawd Cursor desktop control"),
  );
}

function resolveClawdFallbackLane(params: {
  capabilities: CapabilityRow[];
  cfg: MaumauConfig;
}): GmailDigestLane | null {
  const clawdRow = findCapabilityRow(params.capabilities, "clawd-cursor");
  const clawdProfile = findClawdProfileName(params.cfg);
  if (!clawdRow?.ready || !clawdProfile) {
    return null;
  }
  return {
    capabilityId: "clawd-cursor",
    pathLabel: "Clawd Cursor desktop control",
    profile: clawdProfile,
  };
}

function shouldAttemptClawdFallback(page: GmailDigestExtractedPage): boolean {
  return page.state === "sign_in_required" || page.state === "not_gmail";
}

export async function runGmailReceiptDigest(params: {
  cfg: MaumauConfig;
  baseUrl: string | undefined;
  deps: BrowserDeps;
  capabilityOpts: SessionCapabilityOptions;
  listSessionCapabilities?: typeof listSessionCapabilities;
  query?: string;
  lookbackDays?: number;
  limit?: number;
}): Promise<GmailReceiptDigestResult> {
  const lookbackDays = normalizePositiveInteger(
    params.lookbackDays,
    DEFAULT_LOOKBACK_DAYS,
    365,
  );
  const limit = normalizePositiveInteger(params.limit, DEFAULT_RESULT_LIMIT, MAX_RESULT_LIMIT);
  const searchQuery = buildSearchQuery(params.query, lookbackDays);
  const searchUrl = buildSearchUrl(searchQuery);
  const capabilityLister = params.listSessionCapabilities ?? listSessionCapabilities;
  const capabilities = await capabilityLister(params.capabilityOpts);
  const primaryLane = resolvePrimaryLane({
    capabilities,
    cfg: params.cfg,
  });

  let page = await runLaneDigest({
    lane: primaryLane,
    deps: params.deps,
    baseUrl: params.baseUrl,
    searchQuery,
    searchUrl,
    limit,
  });
  let selectedLane = primaryLane;
  let usedFallback = false;
  let fallbackReason: string | undefined;

  if (
    primaryLane.capabilityId === "browser-existing-session" &&
    shouldAttemptClawdFallback(page)
  ) {
    const clawdLane = resolveClawdFallbackLane({
      capabilities,
      cfg: params.cfg,
    });
    if (clawdLane) {
      usedFallback = true;
      fallbackReason =
        page.state === "sign_in_required"
          ? "Browser existing-session did not expose a signed-in Gmail view."
          : "Browser existing-session did not land on a usable Gmail page.";
      page = await runLaneDigest({
        lane: clawdLane,
        deps: params.deps,
        baseUrl: params.baseUrl,
        searchQuery,
        searchUrl,
        limit,
      });
      selectedLane = clawdLane;
    }
  }

  if (page.state === "sign_in_required") {
    throw new Error(
      `${selectedLane.pathLabel} reached Gmail, but the account was not signed in. Open Gmail in the signed-in browser session and retry.`,
    );
  }
  if (page.state !== "ready") {
    throw new Error(
      `${selectedLane.pathLabel} did not reach a usable Gmail page. Open Gmail in that browser lane and retry.`,
    );
  }

  const items = normalizeDigestItems(page.items, limit);
  return {
    workflow: "gmail_receipt_digest",
    capabilityPathUsed: selectedLane.pathLabel,
    capabilityId: selectedLane.capabilityId,
    profile: selectedLane.profile,
    searchQuery,
    searchUrl,
    items,
    totalsByCurrency: sumTotalsByCurrency(items),
    count: items.length,
    usedFallback,
    fallbackReason,
  };
}
