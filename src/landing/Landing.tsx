// Landing page at "/": what the game is, how scoring and hints work, the two modes, where the
// matches come from, sharing, FAQ. The game itself lives at /play and /play/draft.
// Every call to action is tracked as `landing_cta_clicked` (Umami); pageviews come from Umami.
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { track } from '../analytics';
import { BrandMark } from '../components/BrandMark';
import { useCountdown } from '../components/EndScreen';
import { DRAFT_PATH, PLAY_PATH, SITE_URL } from '../config';
import { puzzleDateAt, puzzleNumber, formatCountdown } from '../game/date';
import { draftPuzzleNumber } from '../game/draft/date';
import { loadDraftGame } from '../game/draft/storage';
import { displayStreak, loadGame, loadStats } from '../game/storage';
import { useSettings } from '../useSettings';
import './landing.css';

const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/';
const itemImg = (k: string) => `${CDN}items/${k}.png`;
const heroImg = (k: string) => `${CDN}heroes/${k}.png`;

type S = 'g' | 'y' | 'o' | 'x';
const SYM: Record<S, string> = { g: '✓', y: '↔', o: '◐', x: '✕' };
const STATE_WORD: Record<S, string> = { g: 'right slot', y: 'in the build, wrong slot', o: 'shares a component', x: 'not in the build' };

const NAMES: Record<string, string> = {
  power_treads: 'Power Treads', bfury: 'Battle Fury', manta: 'Manta Style', black_king_bar: 'Black King Bar',
  butterfly: 'Butterfly', abyssal_blade: 'Abyssal Blade', phase_boots: 'Phase Boots', desolator: 'Desolator',
  sange_and_yasha: 'Sange and Yasha', blink: 'Blink Dagger', assault: 'Assault Cuirass',
};

type Cell = [key: string, state: S, note: string];
const RIGHT = 'right item, right slot.';
// Example puzzle from the PRD scoring appendix (Appendix A). Not a real puzzle, so nothing is spoiled.
// Answer: Power Treads, Battle Fury, Manta Style, Black King Bar, Butterfly, Abyssal Blade.
const ROWS: Cell[][] = [
  [
    ['phase_boots', 'x', 'not in the build. It only shares Boots of Speed, which is too cheap to count.'],
    ['sange_and_yasha', 'o', 'not in the build, but it shares Yasha with an item you haven’t found yet.'],
    ['blink', 'x', 'not in the build.'],
    ['desolator', 'o', 'not in the build, but it shares Mithril Hammer with an item you haven’t found yet.'],
    ['bfury', 'y', 'in the build, wrong slot.'],
    ['assault', 'x', 'not in the build.'],
  ],
  [
    ['power_treads', 'g', RIGHT],
    ['bfury', 'g', RIGHT],
    ['sange_and_yasha', 'o', 'still shares Yasha with an item you haven’t found yet. Try Manta Style.'],
    ['black_king_bar', 'g', RIGHT],
    ['abyssal_blade', 'y', 'in the build, wrong slot.'],
    ['butterfly', 'y', 'in the build, wrong slot.'],
  ],
  [
    ['power_treads', 'g', RIGHT],
    ['bfury', 'g', RIGHT],
    ['manta', 'g', RIGHT],
    ['black_king_bar', 'g', RIGHT],
    ['butterfly', 'g', RIGHT],
    ['abyssal_blade', 'g', 'right item, right slot. Solved in 3 rows.'],
  ],
];
const SHARE_ROWS = ROWS.map((r) => r.map(([, s]) => ({ g: '🟩', y: '🟨', o: '🟧', x: '⬛' })[s]).join(''));

const EVENTS: [string, string][] = [
  ['The International', 'Valve'],
  ['Esports World Cup', 'Riyadh'],
  ['DreamLeague', 'ESL Pro Tour'],
  ['ESL One', 'ESL Pro Tour'],
  ['PGL Wallachia', 'PGL'],
  ['BLAST Slam', 'BLAST'],
];

const HINTS: [string, string, React.ReactNode][] = [
  ['At the start', 'Hero & stage', 'Role, tournament, stage and patch.'],
  ['After row 1', 'The draft', 'All ten heroes: his four allies and the five enemies.'],
  ['After row 2', 'Result', <>Win or loss and the length, like <code>Won in 41:12</code>.</>],
  ['After row 3', 'Player & team', 'Who was actually on the hero.'],
  ['After row 4', 'Price bands', <>A gold range for every unsolved slot, like <code>3,500–4,500</code>.</>],
  ['After row 5', 'Lifeline', 'We hand you the earliest item you’re still missing.'],
];

const FAQ: [string, string][] = [
  ['Is it free?', 'Yes. No ads, no paywall, no account. It’s a fan project.'],
  ['When does a new puzzle drop?', 'Every day at 00:00 UTC, which is 07:00 in Jakarta. Everyone in the world gets the same puzzle number on the same day.'],
  ['Where are my stats saved?', 'In your browser. Played, win %, streaks and your guess spread stay on this device. Clearing site data resets them.'],
  ['Why does the order matter?', 'Order is how pros adapt. A BKB at minute 18 tells a different story than one at minute 35. Green means right item and right slot.'],
  ['He ended with a Magic Wand. Is that in the answer?', 'No. We skip any player who finished with a cheap item, a consumable or an empty slot, so every answer is six real items.'],
  ['Can I check the answer myself?', 'Yes. The end screen links the match on OpenDota and Dotabuff, with the minute each item was bought.'],
];

function Tile({ k, s, onClick, selected, label, style }: { k: string; s: S; onClick?: () => void; selected?: boolean; label?: string; style?: React.CSSProperties }) {
  const inner = (
    <>
      <img src={itemImg(k)} alt={onClick ? '' : NAMES[k]} loading="lazy" />
      <span className="lp-sym" aria-hidden="true">{SYM[s]}</span>
    </>
  );
  if (!onClick) return <span className={`lp-tile ${s}`}>{inner}</span>;
  return (
    <button type="button" className={`lp-tile rev ${s}${selected ? ' sel' : ''}`} style={style} onClick={onClick} aria-label={label}>
      {inner}
    </button>
  );
}

const now = () => new Date();

export default function Landing({ navigate }: { navigate: (path: string) => void }) {
  useSettings(); // apply the player's saved theme, colorblind and motion settings
  const today = useMemo(() => puzzleDateAt(new Date()), []);
  const buildNo = puzzleNumber(today);
  const draftNo = draftPuzzleNumber(today);
  const ms = useCountdown(now);

  const [sel, setSel] = useState<[number, number] | null>(null);
  const [replay, setReplay] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  const me = useMemo(() => {
    const done = (s: string | undefined) => s === 'won' || s === 'lost';
    const stats = loadStats();
    return {
      buildDone: done(loadGame(today)?.status),
      draftDone: done(loadDraftGame(today)?.status),
      played: stats.played,
      streak: displayStreak(stats, today),
    };
  }, [today]);

  const localReset = useMemo(() => {
    if (new Date().getTimezoneOffset() === 0) return '';
    try {
      const t = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `(${t} your time)`;
    } catch {
      return '';
    }
  }, [today]);

  useEffect(() => {
    document.title = 'Dota Build Daily';
  }, []);

  const cta = useCallback(
    (target: 'build' | 'draft', placement: string) => (e: MouseEvent<HTMLAnchorElement>) => {
      track('landing_cta_clicked', { target, placement });
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(target === 'build' ? PLAY_PATH : DRAFT_PATH);
    },
    [navigate],
  );

  const shareText = [`Dota Build Daily #${buildNo} — Anti-Mage (Carry)`, '3/6', ...SHARE_ROWS, SITE_URL.replace(/^https:\/\//, '')].join('\n');
  const copy = () => {
    const ok = () => setCopied('Copied!');
    const fallback = () => {
      const el = document.getElementById('lp-share-text');
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      }
      setCopied('Selected');
    };
    try {
      navigator.clipboard.writeText(shareText).then(ok, fallback);
    } catch {
      fallback();
    }
    window.setTimeout(() => setCopied(null), 1600);
  };

  const picked = sel ? ROWS[sel[0]][sel[1]] : null;
  const done = (on: boolean) =>
    on ? (
      <span className="lp-done" title="Done today">
        ✓<span className="sr-only"> done today</span>
      </span>
    ) : null;

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap">
          <a className="lp-brand" href="#top" aria-label="Dota Build Daily home">
            <BrandMark size={26} />
            Dota Build Daily
          </a>
          <nav className="lp-links" aria-label="Page">
            <a className="txt" href="#how">How it works</a>
            <a className="txt" href="#modes">Modes</a>
            <a className="txt" href="#faq">FAQ</a>
            <a className="lp-btn gold sm" href={PLAY_PATH} onClick={cta('build', 'nav')}>
              Play <span className="ar" aria-hidden="true">→</span>
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="lp-hero">
          <div className="lp-wrap">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow">Daily Dota 2 puzzle</p>
              <h1 className="lp-display">
                Read the draft.
                <br />
                <em>Name the build.</em>
              </h1>
              <p className="lp-lede">
                Every day, one pro, one hero, one big tournament match. You get six rows to guess the six items he finished with, in the order he bought them.
              </p>
              <div className="lp-cta-row">
                <a className="lp-btn gold" href={PLAY_PATH} onClick={cta('build', 'hero')}>
                  Play Build <span className="num">#{buildNo}</span> {done(me.buildDone)}
                  <span className="ar" aria-hidden="true">→</span>
                </a>
                <a className="lp-btn ghost" href={DRAFT_PATH} onClick={cta('draft', 'hero')}>
                  Try Draft <span className="num">#{draftNo}</span> {done(me.draftDone)}
                </a>
              </div>
              <div className="lp-today">
                <span>
                  Next puzzle in <span className="cd num">{formatCountdown(ms)}</span>
                </span>
                <span>Resets 00:00 UTC {localReset}</span>
              </div>
              {me.played > 0 && (
                <p className="lp-streak">
                  {me.streak > 0 ? (
                    <>
                      <span className="lp-chip g" aria-hidden="true">✓</span>
                      <span>
                        You’re on a <b>{me.streak}-day streak</b>. {me.buildDone ? 'See you tomorrow.' : 'Keep it alive.'}
                      </span>
                    </>
                  ) : (
                    <span>Welcome back. {me.played} puzzles played so far.</span>
                  )}
                </p>
              )}
            </div>

            <figure className="lp-card" aria-label="Example puzzle: Anti-Mage carry build, solved in 3 rows">
              <div className="lp-pz-head">
                <img src={heroImg('antimage')} alt="Anti-Mage portrait" width={128} height={72} />
                <div className="lp-pz-title">
                  <span className="lp-display">Anti-Mage</span>
                  <small>Carry</small>
                </div>
              </div>
              <div className="lp-pz-meta">
                <span>The International</span>
                <span>Grand Final</span>
                <span>Patch 7.41</span>
                <span className="tag">Example</span>
              </div>
              <div className="lp-pz-body">
                <div className="lp-grid-label">
                  <strong>Final items</strong>
                  <span>Slot 1 was bought first</span>
                </div>
                <div className="lp-board play" key={replay} aria-label="Guess grid">
                  <span />
                  {[1, 2, 3, 4, 5, 6].map((c) => (
                    <span key={c} className="ch">{c}</span>
                  ))}
                  {[0, 1, 2, 3, 4, 5].map((r) => (
                    <Row key={r} r={r} sel={sel} onPick={(c) => setSel([r, c])} />
                  ))}
                </div>
                <div className="lp-caption" aria-live="polite">
                  {picked ? (
                    <span className="lp-cap-text">
                      <span className={`lp-chip ${picked[1]}`} aria-hidden="true">{SYM[picked[1]]}</span>
                      <span>
                        <b>{NAMES[picked[0]]}</b>: {picked[2]}
                      </span>
                    </span>
                  ) : (
                    <span>Tap a tile to see what it means.</span>
                  )}
                  <button className="lp-replay" type="button" onClick={() => setReplay((n) => n + 1)}>
                    Replay
                  </button>
                </div>
              </div>
            </figure>
          </div>
        </section>

        <section className="lp-band" id="how">
          <div className="lp-wrap">
            <div className="lp-sec-head">
              <p className="lp-eyebrow">Scoring</p>
              <h2 className="lp-display">Four colors tell you how close you are</h2>
              <p className="lp-lede">Each row is six different items. After you submit, every tile flips. Each one carries a symbol too, so you never have to rely on color alone.</p>
            </div>
            <div className="lp-legend">
              <Legend k="power_treads" s="g" title="Right slot">
                <em>Power Treads</em> is in the build and was his first finished item. Keep it there.
              </Legend>
              <Legend k="bfury" s="y" title="Wrong slot">
                <em>Battle Fury</em> is in the build, but he bought it earlier or later than you placed it.
              </Legend>
              <Legend k="desolator" s="o" title="Shares a part">
                <em>Desolator</em> isn’t in it, but its Mithril Hammer is inside an item you haven’t found yet.
              </Legend>
              <Legend k="blink" s="x" title="Not in it">
                <em>Blink Dagger</em> isn’t in the build and shares nothing useful with it. Cross it off.
              </Legend>
            </div>
          </div>
        </section>

        <section className="lp-band" id="hints">
          <div className="lp-wrap">
            <div className="lp-sec-head">
              <p className="lp-eyebrow">Hints</p>
              <h2 className="lp-display">Stuck? The match starts talking</h2>
              <p className="lp-lede">Every wrong row unlocks a little more of the game it came from. You can also reveal the next hint early. It just shows up as 💡 in your share.</p>
            </div>
            <ol className="lp-ladder">
              {HINTS.map(([when, what, eg], i) => (
                <li key={when}>
                  <span className="pips" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((p) => (
                      <i key={p} className={p < i ? 'on' : ''} />
                    ))}
                  </span>
                  <span className="when">{when}</span>
                  <span className="what">{what}</span>
                  <span className="eg">{eg}</span>
                </li>
              ))}
            </ol>
            <p className="lp-ladder-note">
              Built for casual players. The item picker only lists items that can be in an answer, and it understands <code>bkb</code>, <code>aghs</code>,{' '}
              <code>bf</code> and <code>deso</code>.
            </p>
          </div>
        </section>

        <section className="lp-band" id="modes">
          <div className="lp-wrap">
            <div className="lp-sec-head">
              <p className="lp-eyebrow">Two puzzles a day</p>
              <h2 className="lp-display">One for the items, one for the draft</h2>
            </div>
            <div className="lp-modes">
              <article className="lp-mode">
                <div className="lp-mode-top">
                  <h3 className="lp-display">Build</h3>
                  <span className="route">{PLAY_PATH}</span>
                  {done(me.buildDone)}
                </div>
                <p>Guess the pro’s final six items, in purchase order. Answers match the scoreboard on OpenDota and Dotabuff.</p>
                <div className="lp-mini" aria-hidden="true">
                  <Tile k="power_treads" s="g" />
                  <Tile k="bfury" s="g" />
                  <Tile k="black_king_bar" s="y" />
                  <Tile k="sange_and_yasha" s="o" />
                  <Tile k="butterfly" s="y" />
                  <Tile k="assault" s="x" />
                </div>
                <Facts a={['6', 'items']} b={['6', 'rows']} c={['4', 'tile colors']} />
                <a className="lp-btn gold" href={PLAY_PATH} onClick={cta('build', 'modes')}>
                  Play today’s Build <span className="ar" aria-hidden="true">→</span>
                </a>
              </article>
              <article className="lp-mode">
                <div className="lp-mode-top">
                  <h3 className="lp-display">Draft</h3>
                  <span className="route">{DRAFT_PATH}</span>
                  {done(me.draftDone)}
                </div>
                <p>See every ban and the enemy’s five picks in Captain’s Mode order. Guess the other team’s five heroes, in the order they picked them.</p>
                <div className="lp-dboard" aria-hidden="true">
                  <div className="lp-dlbl">
                    <span>Bans</span>
                    <span>Example board</span>
                  </div>
                  <div className="lp-dbans">
                    <Hero k="antimage" cls="ban" />
                    <Hero k="faceless_void" cls="ban" />
                  </div>
                  <div className="lp-dlbl">
                    <span>Picks, in order</span>
                  </div>
                  <div className="lp-dpicks">
                    <span className="lp-hp hid">?1</span>
                    <Hero k="slardar" cls="enemy" />
                    <Hero k="juggernaut" cls="enemy" />
                    <Hero k="puck" cls="solved" />
                    <span className="lp-hp hid">?3</span>
                    <Hero k="tiny" cls="enemy" />
                    <Hero k="mars" cls="enemy" />
                    <span className="lp-hp hid">?4</span>
                    <Hero k="crystal_maiden" cls="enemy" />
                    <span className="lp-hp hid">?5</span>
                  </div>
                </div>
                <Facts a={['5', 'heroes']} b={['6', 'rows']} c={['3', 'tile colors']} />
                <a className="lp-btn ghost" href={DRAFT_PATH} onClick={cta('draft', 'modes')}>
                  Play today’s Draft <span className="ar" aria-hidden="true">→</span>
                </a>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-band" id="source">
          <div className="lp-wrap lp-src">
            <div>
              <div className="lp-sec-head tight">
                <p className="lp-eyebrow">Where puzzles come from</p>
                <h2 className="lp-display">Only the big stages</h2>
                <p className="lp-lede">Every puzzle is a real pro game from a Tier-1 main event, picked by hand from a short list. No qualifiers, no pubs.</p>
              </div>
              <ul className="lp-events">
                {EVENTS.map(([name, org]) => (
                  <li key={name}>
                    <b>{name}</b>
                    <span>{org}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="lp-display lp-h3">What counts as an item</h3>
              <ul className="lp-rules">
                <Rule n={1} b="Final inventory only.">The six main slots when the game ended. Backpack and neutral item don’t count.</Rule>
                <Rule n={2} b="Ordered by purchase time.">Slot 1 is the item he bought earliest. A sold and rebought item counts from the rebuy.</Rule>
                <Rule n={3} b="Real items, 1,000 gold and up.">No consumables, wards, Gem or Bottle. Blink Dagger is the one cheap exception.</Rule>
                <Rule n={4} b="Upgraded boots only.">Treads, Phase, Arcane and friends count. Plain Boots of Speed don’t.</Rule>
              </ul>
            </div>
          </div>
        </section>

        <section className="lp-band" id="share">
          <div className="lp-wrap lp-share">
            <div className="lp-sec-head tight">
              <p className="lp-eyebrow">Share</p>
              <h2 className="lp-display">Brag without spoiling</h2>
              <p className="lp-lede">Your result copies as an emoji grid. It never names an item, so your friends can still play today’s puzzle cold.</p>
              <div className="lp-stats" aria-label="Example stats">
                <div><b className="num">12</b><span>Played</span></div>
                <div><b className="num">75</b><span>Win %</span></div>
                <div><b className="num">3</b><span>Streak</span></div>
                <div><b className="num">5</b><span>Best</span></div>
              </div>
            </div>
            <div className="lp-sharebox">
              <pre id="lp-share-text">{shareText}</pre>
              <div className="lp-sharebar">
                <span>Example result</span>
                <button className="lp-btn ghost sm" type="button" onClick={copy}>
                  {copied ?? 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-band" id="faq">
          <div className="lp-wrap">
            <div className="lp-sec-head">
              <p className="lp-eyebrow">FAQ</p>
              <h2 className="lp-display">Before you queue up</h2>
            </div>
            <div className="lp-faq">
              {[FAQ.slice(0, 3), FAQ.slice(3)].map((col, i) => (
                <div key={i}>
                  {col.map(([q, a]) => (
                    <details key={q}>
                      <summary>{q}</summary>
                      <p>{a}</p>
                    </details>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-closing">
          <div className="lp-wrap">
            <h2 className="lp-display">
              Today’s pro
              <br />
              is <em>waiting.</em>
            </h2>
            <div className="lp-cta-row">
              <a className="lp-btn gold" href={PLAY_PATH} onClick={cta('build', 'closing')}>
                Play Build <span className="num">#{buildNo}</span> <span className="ar" aria-hidden="true">→</span>
              </a>
              <a className="lp-btn ghost" href={DRAFT_PATH} onClick={cta('draft', 'closing')}>
                Play Draft <span className="num">#{draftNo}</span>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <p>
            Dota 2 is a registered trademark of Valve Corporation. This project is not affiliated with or endorsed by Valve. Match data from{' '}
            <a href="https://www.opendota.com" target="_blank" rel="noopener noreferrer">
              OpenDota
            </a>
            .
          </p>
          <p>Non-commercial fan project.</p>
        </div>
      </footer>
    </div>
  );
}

function Row({ r, sel, onPick }: { r: number; sel: [number, number] | null; onPick: (c: number) => void }) {
  const row = ROWS[r];
  return (
    <>
      <span className="rh">{r + 1}</span>
      {[0, 1, 2, 3, 4, 5].map((c) => {
        const cell = row?.[c];
        if (!cell) return <span key={c} className="lp-tile empty" aria-hidden="true" />;
        const [k, s] = cell;
        return (
          <Tile
            key={c}
            k={k}
            s={s}
            selected={sel?.[0] === r && sel?.[1] === c}
            onClick={() => onPick(c)}
            label={`Row ${r + 1}, slot ${c + 1}: ${NAMES[k]}, ${STATE_WORD[s]}`}
            style={{ ['--d' as string]: `${r * 520 + c * 85}ms` }}
          />
        );
      })}
    </>
  );
}

function Legend({ k, s, title, children }: { k: string; s: S; title: string; children: React.ReactNode }) {
  return (
    <div className="lp-lg">
      <Tile k={k} s={s} />
      <h3>
        <span className={`sw ${s}`} />
        {title}
      </h3>
      <p>{children}</p>
    </div>
  );
}

function Facts({ a, b, c }: { a: [string, string]; b: [string, string]; c: [string, string] }) {
  return (
    <div className="lp-facts">
      {[a, b, c].map(([n, l]) => (
        <div key={l}>
          <b>{n}</b>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

function Hero({ k, cls }: { k: string; cls: 'ban' | 'enemy' | 'solved' }) {
  return (
    <span className={`lp-hp ${cls}`}>
      <img src={heroImg(k)} alt="" loading="lazy" />
    </span>
  );
}

function Rule({ n, b, children }: { n: number; b: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="k">{n}</span>
      <p>
        <b>{b}</b> {children}
      </p>
    </li>
  );
}
