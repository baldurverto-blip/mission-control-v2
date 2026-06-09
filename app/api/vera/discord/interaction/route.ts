/**
 * POST /api/vera/discord/interaction
 *
 * RETIRED 2026-06-08 (OpenClaw migration): Discord was decommissioned entirely.
 * The Vera Discord bot + this interaction webhook are disabled. Any inbound
 * Discord interaction now receives 410 Gone. The original Ed25519-verified
 * handler (button approve/edit/escalate) was removed with the integration.
 *
 * Env keys VERA_DISCORD_TOKEN + DISCORD_PUBLIC_KEY have been stripped from the
 * Mission Control launchd plist; nothing here reads them anymore.
 */

export async function POST() {
  return new Response("Discord integration retired", { status: 410 });
}
