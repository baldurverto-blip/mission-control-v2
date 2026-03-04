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
const ICONS = {
  dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1",
  proposals: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  growth: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
};

// Growth sub-page tabs are defined separately for the growth layout tab bar
export const GROWTH_TABS = [
  { label: "Overview", href: "/growth" },
  { label: "Queue", href: "/growth/queue" },
  { label: "Discovery", href: "/growth/discovery" },
  { label: "Radar", href: "/growth/radar" },
  { label: "Engagement", href: "/growth/engagement" },
  { label: "Campaigns", href: "/growth/campaigns" },
  { label: "Templates", href: "/growth/templates" },
  { label: "History", href: "/growth/history" },
  { label: "Projects", href: "/growth/projects" },
  { label: "TikTok", href: "/growth/tiktok" },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "System",
    items: [
      { label: "Dashboard", href: "/", icon: ICONS.dashboard },
      { label: "Proposals", href: "/proposals", icon: ICONS.proposals },
      { label: "Calendar", href: "/calendar", icon: ICONS.calendar },
    ],
  },
  {
    label: "Growth Ops",
    href: "/growth",
    icon: ICONS.growth,
    healthEndpoint: "/api/growthops",
    items: [], // sub-pages are tabs inside the growth layout
  },
];
