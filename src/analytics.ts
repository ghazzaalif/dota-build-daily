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

// Loads Umami Cloud when VITE_UMAMI_WEBSITE_ID is set at build time (Render env var).
export function initAnalytics() {
  const id = import.meta.env.VITE_UMAMI_WEBSITE_ID;
  if (!id || import.meta.env.DEV) return;
  const s = document.createElement('script');
  s.defer = true;
  s.src = import.meta.env.VITE_UMAMI_SRC || 'https://cloud.umami.is/script.js';
  s.dataset.websiteId = id;
  document.head.appendChild(s);
}

// Bucketed days-played, a cookie-free proxy for returning players (D7 metric).
export function playedBucket(played: number): string {
  if (played <= 0) return '0';
  if (played === 1) return '1';
  if (played < 7) return '2-6';
  return '7+';
}
