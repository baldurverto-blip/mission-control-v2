export interface NavItem {
  label: string;
  href: string;
  icon: string; // SVG path data
}

export interface NavGroup {
  label: string;
  href?: string; // if set, group header becomes a clickable link
  icon?: string; // SVG path for group-as-link mode (when items is empty)
  items: NavItem[];
  healthEndpoint?: string; // if set, shows StatusDot in group header
}

// Simple inline SVG path data — no icon library needed
const ICONS: Record<string, string> = {
  dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1",
  board: "M9 12h6m-7 8h8a2 2 0 002-2V8l-6-4-6 4v10a2 2 0 002 2zm2-12h2m-7 4h14",
  proposals: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  org: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  growth: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  factory: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
  saasFactory: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9",
  fleet: "M4 6h16M4 12h16M4 18h7m2-6a2 2 0 100-4 2 2 0 000 4zm6 6a2 2 0 100-4 2 2 0 000 4z",
  memory: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18",
};

// Growth sub-page tabs are defined separately for the growth layout tab bar
// Growth tabs organized by pipeline stage:
// Overview → Discovery (signals+keywords) → Ideation → Content (queue) → Distribution → Engagement → History → Settings
export const GROWTH_TABS = [
  { label: "Overview", href: "/growth" },
  { label: "Discovery", href: "/growth/signals" },
  { label: "Keywords", href: "/growth/keywords" },
  { label: "Ideas", href: "/growth/ideas" },
  { label: "Content", href: "/growth/queue" },
  { label: "Calendar", href: "/growth/calendar" },
  { label: "Distribution", href: "/growth/distribution" },
  { label: "Engagement", href: "/growth/engagement" },
  { label: "History", href: "/growth/history" },
  { label: "Settings", href: "/growth/settings" },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "System",
    items: [
      { label: "Dashboard", href: "/", icon: ICONS.dashboard },
      { label: "Board", href: "/board", icon: ICONS.board },
      { label: "Calendar", href: "/calendar", icon: ICONS.calendar },
      { label: "Organisation", href: "/org", icon: ICONS.org },
      { label: "Proposals", href: "/proposals", icon: ICONS.proposals },
      { label: "Memory", href: "/memory", icon: ICONS.memory },
    ],
  },
  {
    label: "Growth Ops",
    href: "/growth",
    icon: ICONS.growth,
    healthEndpoint: "/api/growthops",
    items: [], // sub-pages are tabs inside the growth layout
  },
  {
    label: "App Factory",
    href: "/factory",
    icon: ICONS.factory,
    items: [], // single page with inline tabs
  },
  {
    label: "SaaS Factory",
    href: "/saas-factory",
    icon: ICONS.saasFactory,
    items: [], // single page with inline tabs
  },
  {
    label: "Fleet",
    href: "/fleet",
    icon: ICONS.fleet,
    items: [], // grid page with per-product detail views
  },
];
