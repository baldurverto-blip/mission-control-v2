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
