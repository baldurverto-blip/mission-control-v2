import { join } from "path";

export const WORKSPACE = join(process.env.HOME ?? "/Users/baldurclaw", "verto-workspace");
export const BRAIN = join(WORKSPACE, "brain");
export const OPS = join(WORKSPACE, "ops");
export const RESEARCH = join(WORKSPACE, "research", "ideas");
export const NOW_MD = join(BRAIN, "NOW.md");
export const INBOX_MD = join(BRAIN, "INBOX.md");
export const ROADMAP_MD = join(OPS, "ROADMAP.md");
export const FAILURES_DIR = join(OPS, "failures");
export const SKILLS_DIR = join(BRAIN, "skills");
export const AGENTS_DIR = join(BRAIN, "agents");
export const PROPOSALS_DIR = join(BRAIN, "proposals");
export const CONTENT_DIR = join(WORKSPACE, "company", "content");
export const SCHEDULE_JSON = join(CONTENT_DIR, "schedule.json");
export const PULSES_DIR = join(OPS, "pulses");
export const BRIEFS_DIR = join(OPS, "briefs");
export const PRODUCTS_DIR = join(WORKSPACE, "company", "products");
export const EXPEDITIONS_DIR = join(OPS, "expeditions");
export const KEYWORD_SIGNALS_DIR = join(WORKSPACE, "research", "keyword-signals");
export const ORG_JSON = join(BRAIN, "ORG.json");
export const MISSION_MD = join(WORKSPACE, "company", "mission.md");
export const CALENDAR_EVENTS_JSON = join(OPS, "calendar-events.json");
export const FACTORY_DIR = join(OPS, "factory");
export const SAAS_FACTORY_DIR = join(OPS, "saas-factory");
export const CONTENT_CALENDAR_JSON = join(OPS, "factory", "content-calendar.json");
export const LOGS_DIR = join(OPS, "logs");
export const LEARNING_DIR = join(BRAIN, "learning");
export const TASKS_JSON = join(OPS, "tasks.json");
export const BOARD_GOALS_MD = join(WORKSPACE, "company", "board-goals.md");
export const BOARD_MEETINGS_DIR = join(OPS, "board-meetings");
export const BOARD_MEETING_TRANSCRIPTS_DIR = join(BOARD_MEETINGS_DIR, "transcripts");
export const BOARD_MEETING_SUMMARIES_DIR = join(BOARD_MEETINGS_DIR, "summaries");
export const BOARD_MEETING_ACTIONS_DIR = join(BOARD_MEETINGS_DIR, "actions");
export const BRAIN_MEMORY_MD = join(BRAIN, "MEMORY.md");
export const BRAIN_CONTEXT_MD = join(BRAIN, "CONTEXT.md");
export const BRAIN_PRINCIPLES_MD = join(BRAIN, "PRINCIPLES.md");
export const BRAIN_NOW_MD = join(BRAIN, "NOW.md");
export const CLAUDE_MEMORY_DIR = join(
  process.env.HOME ?? "/Users/baldurclaw",
  ".claude", "projects", "-Users-baldurclaw", "memory"
);
