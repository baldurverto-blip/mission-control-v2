export type TelemetryScope = "production" | "test";

export interface FleetRegistryEntry {
  slug: string;
  posthogAppName: string;
  revenueCatProjectNames: string[];
  revenueCatBundleIds: string[];
  telemetryScope: TelemetryScope;
  telemetryNote?: string;
  coreEvents: string[];
}

const COMMON_CORE_EVENTS = [
  "food_scan_completed",
  "scan_completed",
  "highlight_captured",
  "book_added",
  "insight_viewed",
  "card_saved",
  "card_discussed",
  "partner_invite_shared",
  "injection_logged",
  "story_completed",
  "challenge_photo_taken",
  "wonder_collected",
  "vet_brief_pdf_shared",
  "paywall_converted",
  "purchase_completed",
];

const REGISTRY: Record<string, FleetRegistryEntry> = {
  safebite: {
    slug: "safebite",
    posthogAppName: "SafeBite",
    revenueCatProjectNames: ["SafeBite"],
    revenueCatBundleIds: ["com.vertostudios.safebite"],
    telemetryScope: "production",
    coreEvents: ["scan_completed", "scan_started", "allergen_flagged"],
  },
  "app-request-do-you-use-to-track-your-cro": {
    slug: "app-request-do-you-use-to-track-your-cro",
    posthogAppName: "HyTrack",
    revenueCatProjectNames: ["HyTrack"],
    revenueCatBundleIds: ["ai.vertostudios.hytrack"],
    telemetryScope: "production",
    coreEvents: ["workout_logged", "race_plan_created", "paywall_converted", "purchase_completed"],
  },
  "the-worst-part-about-a-gluten-allergy-is": {
    slug: "the-worst-part-about-a-gluten-allergy-is",
    posthogAppName: "GatherSafe",
    revenueCatProjectNames: ["GatherSafe"],
    revenueCatBundleIds: ["app.gathersafe"],
    telemetryScope: "production",
    coreEvents: ["prep_kit_created", "scan_completed", "paywall_converted", "purchase_completed"],
  },
  "pagemark-0316": {
    slug: "pagemark-0316",
    posthogAppName: "PageMark",
    revenueCatProjectNames: ["PageMark"],
    revenueCatBundleIds: ["com.vertostudios.pagemark"],
    telemetryScope: "production",
    coreEvents: ["highlight_captured", "book_added", "insight_viewed"],
  },
  "digital-wind-down-tracker-0420": {
    slug: "digital-wind-down-tracker-0420",
    posthogAppName: "Wind Down",
    revenueCatProjectNames: ["Wind Down", "Digital Wind Down"],
    revenueCatBundleIds: ["com.vertostudios.winddown"],
    telemetryScope: "production",
    coreEvents: ["wind_down_started", "wind_down_completed", "sleep_rating_saved"],
  },
  "tether-0317": {
    slug: "tether-0317",
    posthogAppName: "Tether",
    revenueCatProjectNames: ["Tether"],
    revenueCatBundleIds: ["ai.vertostudios.tether"],
    telemetryScope: "production",
    coreEvents: ["partner_invite_generated", "partner_invite_shared", "card_viewed", "card_saved", "card_discussed"],
  },
  sync: {
    slug: "sync",
    posthogAppName: "Sync",
    revenueCatProjectNames: ["Sync"],
    revenueCatBundleIds: ["com.vertostudios.sync"],
    telemetryScope: "production",
    coreEvents: ["checkin_completed", "radar_opened", "conversation_logged"],
  },
  "calibrate-0504": {
    slug: "calibrate-0504",
    posthogAppName: "Calibrate",
    revenueCatProjectNames: ["Calibrate"],
    revenueCatBundleIds: ["com.verto.calibrate"],
    telemetryScope: "production",
    coreEvents: ["paywall_converted", "purchase_completed", "calibration_completed"],
  },
  "petlog-0523": {
    slug: "petlog-0523",
    posthogAppName: "Petlog",
    revenueCatProjectNames: ["Petlog"],
    revenueCatBundleIds: ["com.vertostudios.petlog"],
    telemetryScope: "test",
    telemetryNote: "Petlog is not counted in production fleet analytics until its state is shipped.",
    coreEvents: ["vet_brief_configured", "vet_brief_pdf_shared", "paywall_converted", "purchase_completed"],
  },
  "wonderwalk-0523": {
    slug: "wonderwalk-0523",
    posthogAppName: "WonderWalk",
    revenueCatProjectNames: ["WonderWalk"],
    revenueCatBundleIds: ["com.vertostudios.wonderwalk"],
    telemetryScope: "test",
    telemetryNote: "WonderWalk telemetry is treated as pre-production until the app ships.",
    coreEvents: ["story_started", "story_completed", "challenge_photo_taken", "wonder_collected"],
  },
  "preserve-0523": {
    slug: "preserve-0523",
    posthogAppName: "Preserve",
    revenueCatProjectNames: ["Preserve"],
    revenueCatBundleIds: ["ai.vertostudios.preserve"],
    telemetryScope: "test",
    telemetryNote: "Preserve is not in production yet; PostHog activity is test/build telemetry and is excluded from fleet temperature.",
    coreEvents: ["food_scan_completed", "injection_logged", "paywall_converted", "purchase_completed"],
  },
};

function titleCaseFromSlug(slug: string): string {
  return slug
    .replace(/-\d{4}$/, "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getFleetRegistryEntry(slug: string, displayName?: string | null): FleetRegistryEntry {
  const known = REGISTRY[slug];
  if (known) return known;

  const name = displayName && displayName.trim() ? displayName.trim() : titleCaseFromSlug(slug);
  return {
    slug,
    posthogAppName: name,
    revenueCatProjectNames: [name],
    revenueCatBundleIds: [],
    telemetryScope: "production",
    coreEvents: COMMON_CORE_EVENTS,
  };
}

export function isProductionTelemetry(entry: FleetRegistryEntry, status?: string | null): boolean {
  return entry.telemetryScope === "production" && status === "shipped";
}

export function allCoreEvents(): string[] {
  return Array.from(new Set([...COMMON_CORE_EVENTS, ...Object.values(REGISTRY).flatMap((entry) => entry.coreEvents)]));
}
