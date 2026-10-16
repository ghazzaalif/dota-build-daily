// F9 how-to-play, F8 stats, F10 settings.
import type { Settings, Stats } from '../game/storage';
import type { TileState } from '../game/types';
import { STATE_TEXT, SYMBOL } from './Grid';
import { Modal } from './Modal';

const EXAMPLE: { name: string; state: TileState; note: string }[] = [
  { name: 'Power Treads', state: 'green', note: 'right item, right slot' },
  { name: 'Battle Fury', state: 'yellow', note: 'in the build, wrong slot' },
  { name: 'Desolator', state: 'orange', note: "shares Mithril Hammer with an item you haven't found" },
  { name: "Eul's Scepter", state: 'grey', note: 'not in the build' },
];

const CHIP: Record<TileState, string> = {
  green: 'bg-s-green',
  yellow: 'bg-s-yellow',
  orange: 'bg-s-orange',
  grey: 'bg-s-grey',
};

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play" onClose={onClose}>
      <div className="space-y-4 text-small">
        <p>Guess the 6 items a pro was holding when a big tournament match ended, ordered by when he bought each one. You get 6 rows.</p>
        <ul className="space-y-2" aria-label="Tile colors">
          {EXAMPLE.map((e) => (
            <li key={e.state} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-[3px] text-label font-bold text-[var(--s-ink)] ${CHIP[e.state]}`}
                aria-label={STATE_TEXT[e.state]}
              >
                {SYMBOL[e.state]}
              </span>
              <span>
                <b className="font-semibold">{e.name}</b> <span className="text-muted">{e.note}</span>
              </span>
            </li>
          ))}
        </ul>
        <p>Each wrong row unlocks a hint: the draft, the result, the player, price ranges, then one free item.</p>
        <p className="text-muted">
          Items are finished items costing 1,000 gold or more, plus upgraded boots and Blink Dagger. Backpack, neutral items and consumables don't count.
        </p>
      </div>
      <button type="button" onClick={onClose} className="mt-6 h-12 w-full rounded-[3px] bg-ink font-bold text-bg">
        Start guessing
      </button>
    </Modal>
  );
}

export function StatsBlock({ stats, streak }: { stats: Stats; streak: number }) {
  const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const keys = ['1', '2', '3', '4', '5', '6', 'X'] as const;
  const max = Math.max(1, ...keys.map((k) => stats.dist[k]));
  const figures = [
    { v: stats.played, l: 'Played' },
    { v: winPct, l: 'Win %' },
    { v: streak, l: 'Streak' },
    { v: stats.maxStreak, l: 'Best streak' },
  ];
  return (
    <div>
      <dl className="grid grid-cols-4 divide-x divide-line">
        {figures.map((f) => (
          <div key={f.l} className="flex flex-col-reverse px-2 first:pl-0">
            <dt className="text-meta text-muted">{f.l}</dt>
            <dd className="font-display text-h2 font-extrabold tabular-nums">{f.v}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mb-2 mt-5 text-label font-semibold text-muted">Rows to solve</h3>
      <ul className="space-y-1">
        {keys.map((k) => (
          <li key={k} className="flex items-center gap-2 text-label tabular-nums">
            <span className="w-3 font-display font-bold text-muted">{k}</span>
            <span
              className={`flex h-5 min-w-[1.5rem] items-center justify-end rounded-[2px] px-1.5 font-semibold ${
                stats.dist[k] ? (k === 'X' ? 'bg-s-grey text-ink' : 'bg-s-green text-[var(--s-ink)]') : 'bg-raised text-muted'
              }`}
              style={{ width: `${(stats.dist[k] / max) * 100}%` }}
            >
              {stats.dist[k]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatsDialog({ stats, streak, onClose, saved }: { stats: Stats; streak: number; onClose: () => void; saved: boolean }) {
  return (
    <Modal title="Your stats" onClose={onClose}>
      <StatsBlock stats={stats} streak={streak} />
      {!saved && <p className="mt-4 text-small text-muted">Stats won't be saved in this browser (storage is blocked).</p>}
    </Modal>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block font-semibold">{label}</span>
        {desc && <span className="block text-label text-muted">{desc}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-raised ring-1 ring-line transition-colors peer-checked:bg-s-green peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ink">
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </span>
    </label>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="py-2">
      <legend className="mb-1.5 font-semibold">{label}</legend>
      <div className="flex rounded-[3px] bg-raised p-0.5">
        {options.map((o) => (
          <label
            key={o.v}
            className={`flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[2px] text-small font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${
              value === o.v ? 'bg-ink text-bg' : 'text-muted'
            }`}
          >
            <input type="radio" name={label} value={o.v} checked={value === o.v} onChange={() => onChange(o.v)} className="sr-only" />
            {o.l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SettingsDialog({ settings, onChange, onClose }: { settings: Settings; onChange: (s: Settings) => void; onClose: () => void }) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="divide-y divide-line">
        <Toggle label="Keep greens" desc="Copy correct items into the next row" checked={settings.keepGreens} onChange={(v) => set({ keepGreens: v })} />
        <Toggle label="Colorblind colors" desc="Blue, orange and purple tiles; share text matches" checked={settings.colorblind} onChange={(v) => set({ colorblind: v })} />
        <Segmented
          label="Theme"
          value={settings.theme}
          onChange={(v) => set({ theme: v })}
          options={[
            { v: 'system', l: 'System' },
            { v: 'dark', l: 'Dark' },
            { v: 'light', l: 'Light' },
          ]}
        />
        <Segmented
          label="Reduce motion"
          value={settings.reducedMotion}
          onChange={(v) => set({ reducedMotion: v })}
          options={[
            { v: 'system', l: 'System' },
            { v: 'on', l: 'On' },
            { v: 'off', l: 'Off' },
          ]}
        />
      </div>
    </Modal>
  );
}
