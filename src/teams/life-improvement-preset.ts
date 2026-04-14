import type { AgentConfig } from "../config/types.agents.js";
import type { TeamConfig } from "../config/types.teams.js";
import { DEFAULT_TEAM_WORKFLOW_ID } from "./model.js";

export const LIFE_IMPROVEMENT_TEAM_ID = "life-improvement";
export const LIFE_IMPROVEMENT_TEAM_MANAGER_AGENT_ID = "life-improvement-manager";
export const LIFE_IMPROVEMENT_TEAM_PRESET_VERSION = 1;

type LifeImprovementRoleDefinition = {
  name: string;
  domainId: string;
  covers: string;
  relatesTo: string;
};

export type LifeImprovementRoleSpec = LifeImprovementRoleDefinition & {
  agentId: string;
  role: string;
};

export type LifeImprovementDomainGroup = {
  id: string;
  label: string;
  roles: string[];
};

const LIFE_IMPROVEMENT_MANAGER_TOOL_ALLOW = [
  "apply_patch",
  "capabilities_list",
  "edit",
  "memory_get",
  "memory_search",
  "read",
  "sessions_spawn",
  "sessions_yield",
  "web_fetch",
  "web_search",
  "write",
] as const;

const LIFE_IMPROVEMENT_SPECIALIST_TOOL_ALLOW = [
  "apply_patch",
  "edit",
  "memory_get",
  "memory_search",
  "read",
  "web_fetch",
  "web_search",
  "write",
] as const;

function toRoleName(name: string): string {
  return name.trim().toLowerCase();
}

function toAgentId(name: string): string {
  return `${LIFE_IMPROVEMENT_TEAM_ID}-${name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

export const LIFE_IMPROVEMENT_FINANCIAL_COACH_AGENT_ID = toAgentId("Financial Coach & Assistant");

const LIFE_IMPROVEMENT_ROLE_DEFINITIONS = [
  {
    name: "Life & Mindset Coach",
    domainId: "self_identity",
    covers:
      "Purpose, vision, values, direction, goal-setting, limiting beliefs, self-esteem, and identity.",
    relatesTo: "Every other domain as the foundation.",
  },
  {
    name: "Physical Activity Coach",
    domainId: "physical_health",
    covers: "Exercise, movement, gym, yoga, sports, and posture.",
    relatesTo: "Nutrition, sleep, mental health, and energy.",
  },
  {
    name: "Nutrition Coach",
    domainId: "physical_health",
    covers: "Meal planning, diet, eating habits, grocery planning, and supplements.",
    relatesTo: "Physical activity, sleep, mental health, and finance.",
  },
  {
    name: "Sleep Coach",
    domainId: "physical_health",
    covers: "Sleep hygiene, rest optimization, circadian rhythm, and energy.",
    relatesTo: "Mental health, physical activity, and productivity.",
  },
  {
    name: "Integrative Health Consultant",
    domainId: "physical_health",
    covers: "Root-cause health, preventive care, and holistic approaches.",
    relatesTo: "All physical and mental health roles.",
  },
  {
    name: "Health Assistant",
    domainId: "physical_health",
    covers: "Symptom tracking, appointments, medication logging, and health research.",
    relatesTo: "All health roles and the calendar.",
  },
  {
    name: "Mental Health Professional",
    domainId: "mental_emotional_health",
    covers:
      "Stress, anxiety, depression, trauma, emotional regulation, and the full clinical spectrum.",
    relatesTo: "Relationships, self and identity, and physical health.",
  },
  {
    name: "Mindfulness & Meditation Coach",
    domainId: "mental_emotional_health",
    covers: "Breathwork, nervous system regulation, and present-moment awareness.",
    relatesTo: "Mental health, sleep, physical activity, and spiritual life.",
  },
  {
    name: "Journaling & Reflection Assistant",
    domainId: "mental_emotional_health",
    covers: "Guided prompts, mood logging, emotional tracking, and pattern recognition.",
    relatesTo: "Mental health, spiritual life, and self and identity.",
  },
  {
    name: "Personal Stylist & Image Consultant",
    domainId: "image_appearance",
    covers:
      "Wardrobe, outfits, shopping, body language, grooming, etiquette, color analysis, and personal presence.",
    relatesTo: "Personal branding, communication, social standing, and confidence.",
  },
  {
    name: "Grooming & Beauty Coach",
    domainId: "image_appearance",
    covers: "Skincare, haircare, makeup, fragrance, and aesthetic maintenance.",
    relatesTo: "Image, personal branding, and self-esteem.",
  },
  {
    name: "Shopping Assistant",
    domainId: "image_appearance",
    covers: "Finding items, comparing options, curating choices, and price tracking.",
    relatesTo: "Image, finance, and lifestyle.",
  },
  {
    name: "Personal Brand & Reputation Coach",
    domainId: "personal_branding",
    covers:
      "Identity narrative, public perception, thought leadership, crisis management, and positioning.",
    relatesTo: "Image, communication, social standing, and social media.",
  },
  {
    name: "Social Media & Content Coach",
    domainId: "personal_branding",
    covers: "Platform strategy, content creation, audience growth, and online presence.",
    relatesTo: "Personal branding, communication, and creative life.",
  },
  {
    name: "Content & Writing Assistant",
    domainId: "personal_branding",
    covers: "Drafting posts, bios, captions, messages, scripts, and proofreading.",
    relatesTo: "Personal branding, communication, and creative life.",
  },
  {
    name: "Communication Coach",
    domainId: "communication_presence",
    covers:
      "Public speaking, storytelling, presentations, stage presence, persuasion, and narrative.",
    relatesTo: "Personal branding, relationships, social standing, and confidence.",
  },
  {
    name: "Body Language & Voice Coach",
    domainId: "communication_presence",
    covers: "Non-verbal cues, tone, pitch, posture, eye contact, and vocal authority.",
    relatesTo: "Image, communication, relationships, and social standing.",
  },
  {
    name: "Etiquette & Protocol Consultant",
    domainId: "communication_presence",
    covers: "Social norms, dining, cultural conduct, and professional and diplomatic etiquette.",
    relatesTo: "Image, relationships, social standing, and networking.",
  },
  {
    name: "Communication Assistant",
    domainId: "communication_presence",
    covers: "Drafting emails, messages, difficult conversations, follow-ups, and scripts.",
    relatesTo: "Relationships, personal branding, and social life.",
  },
  {
    name: "Relationship & Dating Coach",
    domainId: "relationships_social_life",
    covers:
      "Communication, intimacy, conflict resolution, partnership, attraction, and romantic confidence.",
    relatesTo: "Mental health, social skills, self and identity, and communication.",
  },
  {
    name: "Family & Parenting Coach",
    domainId: "relationships_social_life",
    covers: "Parenting strategies, child development, family communication, and boundaries.",
    relatesTo: "Relationships, mental health, and home and lifestyle.",
  },
  {
    name: "Social Skills Coach",
    domainId: "relationships_social_life",
    covers: "Friendships, adult social confidence, conversation, and belonging.",
    relatesTo: "Relationships, communication, social standing, and mental health.",
  },
  {
    name: "Social Assistant",
    domainId: "relationships_social_life",
    covers: "Gift ideas, important dates, planning gestures, and the social calendar.",
    relatesTo: "Relationships, home and lifestyle, and finance.",
  },
  {
    name: "Networking & Influence Coach",
    domainId: "social_standing_influence",
    covers:
      "Social capital, community building, strategic relationships, and authority in social circles.",
    relatesTo: "Communication, personal branding, relationships, and etiquette.",
  },
  {
    name: "Research Assistant",
    domainId: "social_standing_influence",
    covers: "Background on people, events, topics, and cultural context before interactions.",
    relatesTo: "Networking, relationships, communication, and travel.",
  },
  {
    name: "Financial Coach & Assistant",
    domainId: "personal_finance",
    covers:
      "Budgeting, saving, debt, spending habits, expense tracking, bill reminders, and financial goals.",
    relatesTo: "Home and lifestyle, travel, shopping, mental health, and all domains.",
  },
  {
    name: "Spiritual & Purpose Coach",
    domainId: "spiritual_meaning",
    covers: "Meaning-making, belief systems, values alignment, faith, and existential questions.",
    relatesTo: "Self and identity, mental health, relationships, and creative life.",
  },
  {
    name: "Reflection & Gratitude Assistant",
    domainId: "spiritual_meaning",
    covers: "Daily practices, gratitude prompts, ritual support, and journaling.",
    relatesTo: "Spiritual life, mental health, and self and identity.",
  },
  {
    name: "Home & Organization Consultant",
    domainId: "home_lifestyle",
    covers: "Decluttering, space design, household systems, and environment.",
    relatesTo: "Mental health, productivity, and family.",
  },
  {
    name: "Household Assistant",
    domainId: "home_lifestyle",
    covers: "Grocery lists, vendor research, maintenance tracking, and errands.",
    relatesTo: "Nutrition, finance, home, and family.",
  },
  {
    name: "Travel & Experience Assistant",
    domainId: "home_lifestyle",
    covers: "Trip research, bookings, itineraries, packing, and experience curation.",
    relatesTo: "Lifestyle, finance, relationships, and creative life.",
  },
  {
    name: "Event & Celebration Planner",
    domainId: "home_lifestyle",
    covers: "Parties, milestones, gatherings, gifting, and guest coordination.",
    relatesTo: "Relationships, finance, and social life.",
  },
  {
    name: "Creativity & Expression Coach",
    domainId: "creative_life",
    covers: "Writing, art, music, hobbies, creative blocks, and building a creative practice.",
    relatesTo: "Mental health, spiritual life, self and identity, and personal branding.",
  },
  {
    name: "Creative Assistant",
    domainId: "creative_life",
    covers: "Research, brainstorming, drafting, editing, and feedback on creative work.",
    relatesTo: "Creative life, personal branding, and communication.",
  },
  {
    name: "Accountability Partner",
    domainId: "cross_domain_support",
    covers: "Holding commitments, tracking progress, challenging avoidance, and celebrating wins.",
    relatesTo: "Every domain with active goals.",
  },
  {
    name: "Insight & Pattern Analyst",
    domainId: "cross_domain_support",
    covers: "Connecting dots across domains, such as poor sleep affecting mood and relationships.",
    relatesTo: "All domains, especially health and mental health.",
  },
  {
    name: "Personal Knowledge Manager",
    domainId: "cross_domain_support",
    covers: "Capturing preferences, history, context, and memory so nothing is lost.",
    relatesTo: "All domains so every other role gets smarter.",
  },
] satisfies LifeImprovementRoleDefinition[];

export const LIFE_IMPROVEMENT_ROLE_SPECS: LifeImprovementRoleSpec[] =
  LIFE_IMPROVEMENT_ROLE_DEFINITIONS.map((definition) => ({
    ...definition,
    agentId: toAgentId(definition.name),
    role: toRoleName(definition.name),
  }));

function roleName(name: string): string {
  return toRoleName(name);
}

export const LIFE_IMPROVEMENT_DOMAIN_GROUPS: LifeImprovementDomainGroup[] = [
  {
    id: "physical_health",
    label: "Physical Health",
    roles: [
      roleName("Physical Activity Coach"),
      roleName("Nutrition Coach"),
      roleName("Sleep Coach"),
      roleName("Integrative Health Consultant"),
      roleName("Health Assistant"),
    ],
  },
  {
    id: "mental_emotional_health",
    label: "Mental & Emotional Health",
    roles: [
      roleName("Mental Health Professional"),
      roleName("Mindfulness & Meditation Coach"),
      roleName("Journaling & Reflection Assistant"),
    ],
  },
  {
    id: "image_appearance",
    label: "Image & Appearance",
    roles: [
      roleName("Personal Stylist & Image Consultant"),
      roleName("Grooming & Beauty Coach"),
      roleName("Shopping Assistant"),
    ],
  },
  {
    id: "personal_branding",
    label: "Personal Branding & Reputation",
    roles: [
      roleName("Personal Brand & Reputation Coach"),
      roleName("Social Media & Content Coach"),
      roleName("Content & Writing Assistant"),
    ],
  },
  {
    id: "communication_presence",
    label: "Communication & Presence",
    roles: [
      roleName("Communication Coach"),
      roleName("Body Language & Voice Coach"),
      roleName("Etiquette & Protocol Consultant"),
      roleName("Communication Assistant"),
    ],
  },
  {
    id: "relationships_social_life",
    label: "Relationships & Social Life",
    roles: [
      roleName("Relationship & Dating Coach"),
      roleName("Family & Parenting Coach"),
      roleName("Social Skills Coach"),
      roleName("Social Assistant"),
    ],
  },
  {
    id: "social_standing_influence",
    label: "Social Standing & Influence",
    roles: [roleName("Networking & Influence Coach"), roleName("Research Assistant")],
  },
  {
    id: "personal_finance",
    label: "Personal Finance",
    roles: [roleName("Financial Coach & Assistant")],
  },
  {
    id: "spiritual_meaning",
    label: "Spiritual & Meaning",
    roles: [roleName("Spiritual & Purpose Coach"), roleName("Reflection & Gratitude Assistant")],
  },
  {
    id: "home_lifestyle",
    label: "Home & Lifestyle",
    roles: [
      roleName("Home & Organization Consultant"),
      roleName("Household Assistant"),
      roleName("Travel & Experience Assistant"),
      roleName("Event & Celebration Planner"),
    ],
  },
  {
    id: "creative_life",
    label: "Creative Life",
    roles: [roleName("Creativity & Expression Coach"), roleName("Creative Assistant")],
  },
];

function buildRoleDescription(spec: LifeImprovementRoleSpec): string {
  return `Covers ${spec.covers} Relates to ${spec.relatesTo}`;
}

function createSpecialistAgent(spec: LifeImprovementRoleSpec): AgentConfig {
  const allow: string[] = [...LIFE_IMPROVEMENT_SPECIALIST_TOOL_ALLOW];
  if (spec.agentId === LIFE_IMPROVEMENT_FINANCIAL_COACH_AGENT_ID) {
    allow.push("browser");
  }
  return {
    id: spec.agentId,
    name: spec.name,
    tools: {
      allow,
    },
  };
}

export function createLifeImprovementTeamAgents(): AgentConfig[] {
  return [
    {
      id: LIFE_IMPROVEMENT_TEAM_MANAGER_AGENT_ID,
      name: "Life Improvement Manager",
      tools: {
        allow: [...LIFE_IMPROVEMENT_MANAGER_TOOL_ALLOW],
      },
    },
    ...LIFE_IMPROVEMENT_ROLE_SPECS.map(createSpecialistAgent),
  ];
}

export function createLifeImprovementTeamConfig(): TeamConfig {
  return {
    id: LIFE_IMPROVEMENT_TEAM_ID,
    name: "Life Improvement Team",
    description:
      "A bundled document-first coaching and support team that maintains an incremental life-improvement profile for one primary user, uses related-people context carefully, and coordinates specialists across identity, health, relationships, finance, lifestyle, and meaning.",
    managerAgentId: LIFE_IMPROVEMENT_TEAM_MANAGER_AGENT_ID,
    members: LIFE_IMPROVEMENT_ROLE_SPECS.map((spec) => ({
      agentId: spec.agentId,
      role: spec.role,
      description: buildRoleDescription(spec),
    })),
    crossTeamLinks: [],
    workflows: [
      {
        id: DEFAULT_TEAM_WORKFLOW_ID,
        name: "Default Workflow",
        description:
          "Manager-led life-improvement planning around a rolling primary-user profile, active domain notes, and cross-role dependency files.",
        default: true,
        lifecycle: {
          stages: [
            {
              id: "intake",
              name: "Intake",
              status: "in_progress",
              roles: [],
            },
            {
              id: "context_map",
              name: "Context Map",
              status: "in_progress",
              roles: [
                roleName("Personal Knowledge Manager"),
                roleName("Research Assistant"),
                roleName("Insight & Pattern Analyst"),
                roleName("Life & Mindset Coach"),
              ],
            },
            {
              id: "domain_work",
              name: "Domain Work",
              status: "in_progress",
              roles: [],
            },
            {
              id: "dependency_notes",
              name: "Dependency Notes",
              status: "review",
              roles: [
                roleName("Personal Knowledge Manager"),
                roleName("Insight & Pattern Analyst"),
              ],
            },
            {
              id: "action_plan",
              name: "Action Plan",
              status: "review",
              roles: [roleName("Accountability Partner"), roleName("Life & Mindset Coach")],
            },
            {
              id: "manager_confirmation",
              name: "Manager Confirmation",
              status: "review",
              roles: [],
            },
          ],
        },
        managerPrompt:
          "Treat this team as a document-first life improvement system for one primary user. Start by identifying the subject user, the relevant user or group structure, the related people who matter, the current goals, and the missing context. Use other people only as supporting context for the primary user's improvement plan. Build the subject profile incrementally instead of demanding a full all-domains intake at once. When live follow-up is needed, guide the user through a slow getting-to-know-you flow instead of a questionnaire or a tiny note at the end of another reply. Start with what day-to-day life looks like, then later move into hobbies, exercise, and the shape of work or study life, and only later into family context such as siblings or parents if it feels natural and welcome. Ask one thing at a time, reflect back what you learned, and make each step easy to skip. Do not wake the whole roster by default. The personal knowledge manager owns the canonical dossier and file map. Keep one primary subject dossier, one domain note file for each active domain, and one dependency note file whenever one role's recommendation materially affects another role. When the team considers building a user-facing app or helper, first inspect existing app ideas, saved workshop artifacts, and current workspace apps to see whether the need should be handled by improving something that already exists. Only create a net-new app proposal when the gap is materially different. Update the existing app record instead of duplicating it when an existing app is the right base. The insight & pattern analyst owns cross-domain cause-and-effect synthesis. The accountability partner turns approved recommendations into follow-through. Make related-role handoffs explicit by naming the source role, the target role, why the dependency matters, and what should be captured in the dependency note. When health, mental health, finance, or other higher-stakes questions appear, keep guidance conservative, name uncertainty, and recommend qualified human support instead of pretending to diagnose or prescribe.",
        synthesisPrompt:
          "Synthesize the subject dossier, active domain findings, dependency notes, and next-step commitments into one practical life improvement brief. Call out the highest-leverage actions, the main risks, and the missing context still needed.",
        contract: {
          requiredRoles: [
            roleName("Life & Mindset Coach"),
            roleName("Research Assistant"),
            roleName("Accountability Partner"),
            roleName("Insight & Pattern Analyst"),
            roleName("Personal Knowledge Manager"),
          ],
          requiredQaRoles: [],
          requireDelegation: true,
        },
      },
    ],
    preset: {
      id: LIFE_IMPROVEMENT_TEAM_ID,
      source: "bundled",
      version: LIFE_IMPROVEMENT_TEAM_PRESET_VERSION,
    },
  };
}
