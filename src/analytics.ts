// F11: privacy-friendly analytics (Plausible or Umami). No cookies, no PII.
// No-ops when neither script is loaded.
export type AnalyticsEvent =
  | 'puzzle_loaded'
  | 'guess_submitted'
  | 'hint_revealed'
  | 'puzzle_completed'
  | 'share_clicked'
  | 'puzzle_missing'
  | 'mode_switched';

export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>) {
  try {
    if (window.plausible) window.plausible(event, props ? { props } : undefined);
    else if (window.umami) window.umami.track(event, props);
  } catch {
    /* analytics must never break the game */
  }
  if (import.meta.env.DEV) console.debug('[analytics]', event, props ?? '');
}
