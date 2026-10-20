// Picks the page from the URL: "/" is the landing page, "/play" is Build Daily and
// "/play/draft" is Draft Daily (Draft PRD D5, §10). The old "/draft" address still opens
// Draft and is rewritten to "/play/draft". Draft is a separate lazy chunk, so Build's bundle
// budget isn't affected. Inside Discord only Build runs, whatever the path (the Activity and
// its server board are Build-only, and Discord maps the Activity to the site root).
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { track } from './analytics';
import App from './App';
import { DRAFT_PATH, LEGACY_DRAFT_PATH } from './config';
import { isDiscordActivity } from './discord/client';
import Landing from './landing/Landing';

const DraftApp = lazy(() => import('./draft/DraftApp'));
const IN_DISCORD = typeof window !== 'undefined' && isDiscordActivity();

const under = (path: string, base: string) => path === base || path === `${base}.html` || path.startsWith(`${base}/`);
export const isDraftPath = (path: string) => under(path, DRAFT_PATH);
export const isLegacyDraftPath = (path: string) => under(path, LEGACY_DRAFT_PATH);
export const isLandingPath = (path: string) => path === '/' || path === '/index.html';

export type Page = 'landing' | 'build' | 'draft';
export function pageOf(path: string): Page {
  if (isLandingPath(path)) return 'landing';
  if (isDraftPath(path) || isLegacyDraftPath(path)) return 'draft';
  return 'build';
}

/** Old /draft links: show Draft at its new address without adding a history entry. */
function currentPath() {
  const p = window.location.pathname;
  if (!IN_DISCORD && isLegacyDraftPath(p)) {
    window.history.replaceState(null, '', DRAFT_PATH + window.location.search + window.location.hash);
    return DRAFT_PATH;
  }
  return p;
}

export default function Root() {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const on = () => setPath(currentPath());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  const navigate = useCallback((to: string) => {
    const from = window.location.pathname;
    if (to === from) return;
    window.history.pushState(null, '', to);
    setPath(to);
    window.scrollTo(0, 0);
    const a = pageOf(from);
    const b = pageOf(to);
    if (a !== 'landing' && b !== 'landing') track('mode_switched', { from: a, to: b });
  }, []);

  if (IN_DISCORD) return <App />;
  const page = pageOf(path);
  if (page === 'landing') return <Landing navigate={navigate} />;
  if (page === 'build') return <App navigate={navigate} />;
  return (
    <Suspense fallback={<p className="py-24 text-center text-muted">Loading today's draft…</p>}>
      <DraftApp navigate={navigate} />
    </Suspense>
  );
}
