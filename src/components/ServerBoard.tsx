// "Played in this server today": Discord avatars with spoiler-free colour grids.
// Only shown inside Discord, in a server (not DMs).
import { useEffect, useState } from 'react';
import { SCOREBOARD_POLL_MS } from '../config';
import { avatarUrl, displayName, type BoardEntry, type DiscordUserLite } from '../discord/api';
import type { DiscordSession } from '../discord/session';
import type { TileState } from '../game/types';

const SQUARE: Record<TileState, string> = {
  green: 'bg-s-green',
  yellow: 'bg-s-yellow',
  orange: 'bg-s-orange',
  grey: 'bg-s-grey',
};

export function useScoreboard(session: DiscordSession | null, date: string, refreshKey: unknown) {
  const [entries, setEntries] = useState<BoardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guildId = session?.guildId ?? null;

  useEffect(() => {
    if (!session || !guildId) return;
    let alive = true;
    const load = () =>
      session.api
        .scoreboard(guildId, date)
        .then((e) => alive && (setEntries(e), setError(null)))
        .catch(() => alive && setError("Couldn't load this server's results. Retrying…"));
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), SCOREBOARD_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [session, guildId, date, refreshKey]);

  return { entries, error, enabled: !!session && !!guildId };
}

/** Discord avatar; falls back to the name's first letter if the image can't load. */
function Avatar({ user }: { user: DiscordUserLite }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-raised font-display text-body font-bold uppercase">
        {displayName(user).slice(0, 1)}
      </span>
    );
  }
  return <img src={avatarUrl(user)} alt="" width={32} height={32} onError={() => setFailed(true)} className="h-8 w-8 shrink-0 rounded-full bg-raised" />;
}

function MiniGrid({ states }: { states: TileState[][] }) {
  return (
    <span aria-hidden="true" className="grid gap-[2px]">
      {states.map((row, r) => (
        <span key={r} className="flex gap-[2px]">
          {row.map((s, i) => (
            <span key={i} className={`h-[7px] w-[7px] rounded-[1px] ${SQUARE[s]}`} />
          ))}
        </span>
      ))}
    </span>
  );
}

const statusText = (e: BoardEntry) =>
  e.status === 'won' ? `${e.rows}/6` : e.status === 'lost' ? 'X/6' : e.rows ? `Playing, ${e.rows} ${e.rows === 1 ? 'row' : 'rows'}` : 'Playing';

export function ServerBoard({ entries, error, meId, compact }: { entries: BoardEntry[] | null; error: string | null; meId: string; compact?: boolean }) {
  return (
    <section aria-labelledby="board-heading" className={compact ? '' : 'mt-8'}>
      <div className="flex min-h-[44px] items-center justify-between gap-3 border-b border-line pb-2">
        <h2 id="board-heading" className={compact ? 'text-label font-semibold text-muted' : 'text-lead font-semibold'}>
          Played in this server today
        </h2>
        {entries && entries.length > 0 && <span className="text-label tabular-nums text-muted">{entries.length}</span>}
      </div>
      {error && !entries && <p className="py-3 text-small text-muted">{error}</p>}
      {!entries && !error && <p className="py-3 text-small text-muted">Loading…</p>}
      {entries && entries.length === 0 && <p className="py-3 text-small text-muted">Nobody here has played today. Your result will show up first.</p>}
      {entries && entries.length > 0 && (
        <ul>
          {entries.map((e) => (
            <li key={e.user.id} className="flex items-center gap-3 border-b border-line py-2.5">
              <Avatar user={e.user} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-semibold">
                  {displayName(e.user)}
                  {e.user.id === meId && <span className="font-normal text-muted"> (you)</span>}
                </span>
                <span className="block text-label text-muted">
                  {statusText(e)}
                  {e.hints > 0 && `, 💡${e.hints}`}
                </span>
              </span>
              <MiniGrid states={e.states} />
              <span className="sr-only">
                {e.states.map((r, i) => `Row ${i + 1}: ${r.filter((s) => s === 'green').length} right`).join('. ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
