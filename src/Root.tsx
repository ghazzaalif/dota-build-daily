// Picks the mode from the URL: "/" is Build Daily, "/draft" is Draft Daily (Draft PRD D5,
// §10). Draft is a separate lazy chunk, so Build's bundle budget isn't affected. Inside
// Discord only Build runs (the Activity and its server board are Build-only).
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { track } from './analytics';
import App from './App';
import { DRAFT_PATH } from './config';
import { isDiscordActivity } from './discord/client';

const DraftApp = lazy(() => import('./draft/DraftApp'));
const IN_DISCORD = typeof window !== 'undefined' && isDiscordActivity();

export const isDraftPath = (path: string) => path === DRAFT_PATH || path.startsWith(`${DRAFT_PATH}/`);

export default function Root() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  const navigate = useCallback((to: string) => {
    const from = window.location.pathname;
    if (to === from) return;
    window.history.pushState(null, '', to);
    setPath(to);
    window.scrollTo(0, 0);
    track('mode_switched', { from: isDraftPath(from) ? 'draft' : 'build', to: isDraftPath(to) ? 'draft' : 'build' });
  }, []);

  if (IN_DISCORD || !isDraftPath(path)) return <App navigate={IN_DISCORD ? undefined : navigate} />;
  return (
    <Suspense fallback={<p className="py-24 text-center text-muted">Loading today's draft…</p>}>
      <DraftApp navigate={navigate} />
    </Suspense>
  );
}
