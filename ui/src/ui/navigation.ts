import { t } from "../i18n/index.ts";
import type { IconName } from "./icons.js";

export const TAB_GROUPS = [
  { label: "chat", tabs: ["chat"] },
  {
    label: "control",
    tabs: ["overview", "channels", "instances", "sessions", "usage", "cron"],
  },
  { label: "agent", tabs: ["agents", "teams", "skills", "nodes"] },
  {
    label: "settings",
    tabs: [
      "users",
      "config",
      "communications",
      "appearance",
      "automation",
      "infrastructure",
      "aiAgents",
      "debug",
      "logs",
    ],
  },
] as const;

export const DASHBOARD_PAGE_ORDER = [
  "today",
  "wallet",
  "mau-office",
  "tasks",
  "workshop",
  "calendar",
  "routines",
  "business",
  "projects",
  "profile",
  "teams",
  "user-channels",
  "agents",
  "memories",
] as const;

export type DashboardPage = (typeof DASHBOARD_PAGE_ORDER)[number];

export type Tab =
  | "agents"
  | "teams"
  | "overview"
  | "channels"
  | "instances"
  | "sessions"
  | "usage"
  | "cron"
  | "dashboardToday"
  | "dashboardWallet"
  | "dashboardMauOffice"
  | "dashboardTasks"
  | "dashboardWorkshop"
  | "dashboardCalendar"
  | "dashboardRoutines"
  | "dashboardBusiness"
  | "dashboardProjects"
  | "dashboardProfile"
  | "dashboardTeams"
  | "dashboardUserChannels"
  | "dashboardAgents"
  | "dashboardMemories"
  | "skills"
  | "nodes"
  | "chat"
  | "users"
  | "config"
  | "communications"
  | "appearance"
  | "automation"
  | "infrastructure"
  | "aiAgents"
  | "debug"
  | "logs";

const TAB_PATHS: Record<Tab, string> = {
  agents: "/agents",
  teams: "/teams",
  overview: "/overview",
  channels: "/channels",
  instances: "/instances",
  sessions: "/sessions",
  usage: "/usage",
  cron: "/cron",
  dashboardToday: "/dashboard/today",
  dashboardWallet: "/dashboard/wallet",
  dashboardMauOffice: "/dashboard/mau-office",
  dashboardTasks: "/dashboard/tasks",
  dashboardWorkshop: "/dashboard/workshop",
  dashboardCalendar: "/dashboard/calendar",
  dashboardRoutines: "/dashboard/routines",
  dashboardBusiness: "/dashboard/business",
  dashboardProjects: "/dashboard/projects",
  dashboardProfile: "/dashboard/profile",
  dashboardTeams: "/dashboard/teams",
  dashboardUserChannels: "/dashboard/user-channels",
  dashboardAgents: "/dashboard/agents",
  dashboardMemories: "/dashboard/memory-notes",
  skills: "/skills",
  nodes: "/nodes",
  chat: "/chat",
  users: "/users",
  config: "/config",
  communications: "/communications",
  appearance: "/appearance",
  automation: "/automation",
  infrastructure: "/infrastructure",
  aiAgents: "/ai-agents",
  debug: "/debug",
  logs: "/logs",
};

const DASHBOARD_PAGE_TO_TAB: Record<DashboardPage, Tab> = {
  today: "dashboardToday",
  wallet: "dashboardWallet",
  "mau-office": "dashboardMauOffice",
  tasks: "dashboardTasks",
  workshop: "dashboardWorkshop",
  calendar: "dashboardCalendar",
  routines: "dashboardRoutines",
  business: "dashboardBusiness",
  projects: "dashboardProjects",
  profile: "dashboardProfile",
  teams: "dashboardTeams",
  "user-channels": "dashboardUserChannels",
  agents: "dashboardAgents",
  memories: "dashboardMemories",
};

const LEGACY_TAB_ALIASES: Array<[string, Tab]> = [
  ["/mau-office", "dashboardMauOffice"],
  ["/dashboard/memories", "dashboardMemories"],
];

const PATH_TO_TAB = new Map<string, Tab>([
  ...Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as Tab] as const),
  ...LEGACY_TAB_ALIASES,
]);

export function tabForDashboardPage(page: DashboardPage): Tab {
  return DASHBOARD_PAGE_TO_TAB[page];
}

export function dashboardPageForTab(tab: Tab): DashboardPage | null {
  const entry = Object.entries(DASHBOARD_PAGE_TO_TAB).find(([, value]) => value === tab);
  return (entry?.[0] as DashboardPage | undefined) ?? null;
}

export function isDashboardTab(tab: Tab): boolean {
  return dashboardPageForTab(tab) !== null;
}

export function normalizeBasePath(basePath: string): string {
  if (!basePath) {
    return "";
  }
  let base = basePath.trim();
  if (!base.startsWith("/")) {
    base = `/${base}`;
  }
  if (base === "/") {
    return "";
  }
  if (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  return base;
}

export function normalizePath(path: string): string {
  if (!path) {
    return "/";
  }
  let normalized = path.trim();
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const path = TAB_PATHS[tab];
  return base ? `${base}${path}` : path;
}

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const base = normalizeBasePath(basePath);
  let path = pathname || "/";
  if (base) {
    if (path === base) {
      path = "/";
    } else if (path.startsWith(`${base}/`)) {
      path = path.slice(base.length);
    }
  }
  let normalized = normalizePath(path).toLowerCase();
  if (normalized.endsWith("/index.html")) {
    normalized = "/";
  }
  if (normalized === "/") {
    return "chat";
  }
  return PATH_TO_TAB.get(normalized) ?? null;
}

export function inferBasePathFromPathname(pathname: string): string {
  let normalized = normalizePath(pathname);
  if (normalized.endsWith("/index.html")) {
    normalized = normalizePath(normalized.slice(0, -"/index.html".length));
  }
  if (normalized === "/") {
    return "";
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "";
  }
  for (let i = 0; i < segments.length; i++) {
    const candidate = `/${segments.slice(i).join("/")}`.toLowerCase();
    if (PATH_TO_TAB.has(candidate)) {
      const prefix = segments.slice(0, i);
      return prefix.length ? `/${prefix.join("/")}` : "";
    }
  }
  return `/${segments.join("/")}`;
}

export function iconForTab(tab: Tab): IconName {
  switch (tab) {
    case "agents":
      return "folder";
    case "teams":
      return "folder";
    case "chat":
      return "messageSquare";
    case "overview":
      return "barChart";
    case "channels":
      return "link";
    case "instances":
      return "radio";
    case "sessions":
      return "fileText";
    case "usage":
      return "barChart";
    case "cron":
      return "loader";
    case "dashboardToday":
      return "sun";
    case "dashboardWallet":
      return "creditCard";
    case "dashboardMauOffice":
      return "briefcase";
    case "dashboardTasks":
      return "checkSquare";
    case "dashboardWorkshop":
      return "monitor";
    case "dashboardCalendar":
      return "calendarDays";
    case "dashboardRoutines":
      return "repeat2";
    case "dashboardBusiness":
      return "briefcase";
    case "dashboardProjects":
      return "monitor";
    case "dashboardProfile":
      return "book";
    case "dashboardTeams":
      return "users";
    case "dashboardUserChannels":
      return "link";
    case "dashboardAgents":
      return "folder";
    case "dashboardMemories":
      return "brain";
    case "skills":
      return "zap";
    case "nodes":
      return "monitor";
    case "config":
      return "settings";
    case "users":
      return "folder";
    case "communications":
      return "send";
    case "appearance":
      return "spark";
    case "automation":
      return "terminal";
    case "infrastructure":
      return "globe";
    case "aiAgents":
      return "brain";
    case "debug":
      return "bug";
    case "logs":
      return "scrollText";
    default:
      return "folder";
  }
}

export function titleForTab(tab: Tab) {
  return t(`tabs.${tab}`);
}

export function subtitleForTab(tab: Tab) {
  return t(`subtitles.${tab}`);
}
