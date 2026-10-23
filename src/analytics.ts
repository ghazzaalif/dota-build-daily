import { isDiscordActivity } from './discord/client';

// F11: privacy-friendly analytics (Plausible or Umami). No cookies, no PII.
// No-ops when neither script is loaded.
export type AnalyticsEvent =
  | 'puzzle_loaded'
  | 'guess_submitted'
  | 'hint_revealed'
  | 'puzzle_completed'
  | 'share_clicked'
  | 'puzzle_missing'
  | 'mode_switched'
  // Landing page ("/"): which call to action was used. Pageviews come from Umami itself.
  | 'landing_cta_clicked';

export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>) {
  try {
    if (window.plausible) window.plausible(event, props ? { props } : undefined);
    else if (window.umami) window.umami.track(event, props);
  } catch {
    /* analytics must never break the game */
  }
  if (import.meta.env.DEV) console.debug('[analytics]', event, props ?? '');
}

/**
 * Inside a Discord Activity the page may only reach hosts listed in the app's URL mappings
 * (Developer Portal → Activities → URL Mappings), each behind a path on the Activity's own
 * origin. Umami needs two: its script and its event gateway.
 */
export const UMAMI_DISCORD_MAPPINGS = [
  { prefix: '/umami-js', target: 'cloud.umami.is' },
  { prefix: '/umami-api', target: 'gateway.umami.is' },
];

// Loads Umami Cloud when VITE_UMAMI_WEBSITE_ID is set at build time (Render env var).
export function initAnalytics() {
  const id = import.meta.env.VITE_UMAMI_WEBSITE_ID;
  if (!id || import.meta.env.DEV) return;
  const discord = isDiscordActivity();
  const s = document.createElement('script');
  s.defer = true;
  s.dataset.websiteId = id;
  if (discord) {
    // Same-origin paths that Discord's proxy forwards to Umami. The launch URL carries
    // server and channel IDs, so query strings are dropped; the tag splits Discord traffic out.
    s.src = '/umami-js/script.js';
    s.dataset.hostUrl = `${location.origin}/umami-api`;
    s.dataset.excludeSearch = 'true';
    s.dataset.tag = 'discord';
  } else {
    s.src = import.meta.env.VITE_UMAMI_SRC || 'https://cloud.umami.is/script.js';
  }
  document.head.appendChild(s);
}


// Bucketed days-played, a cookie-free proxy for returning players (D7 metric).
export function playedBucket(played: number): string {
  if (played <= 0) return '0';
  if (played === 1) return '1';
  if (played < 7) return '2-6';
  return '7+';
}
