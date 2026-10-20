// Draft F9 how-to-play: ≤ 120 words plus one example row.
import type { DraftTileState } from '../../game/draft/types';
import { Modal } from '../Modal';
import { DRAFT_STATE_TEXT, DRAFT_SYMBOL } from './DraftGrid';

const EXAMPLE: { name: string; state: DraftTileState; note: string }[] = [
  { name: 'Tiny', state: 'green', note: 'right hero, right pick' },
  { name: 'Puck', state: 'yellow', note: 'in the team, picked at another point' },
  { name: 'Lion', state: 'grey', note: 'not in the team' },
];
const CHIP: Record<DraftTileState, string> = { green: 'bg-s-green', yellow: 'bg-s-yellow', grey: 'bg-s-grey' };

export function DraftHowTo({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play Draft" onClose={onClose}>
      <div className="space-y-4 text-small">
        <p>
          A real Captain's Mode draft from a big tournament. You see every ban and the enemy's five picks. Guess the hidden team's five heroes, each in the order
          they picked it. You get 6 rows.
        </p>
        <ul className="space-y-2" aria-label="Tile colors">
          {EXAMPLE.map((e) => (
            <li key={e.state} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-[3px] text-label font-bold text-[var(--s-ink)] ${CHIP[e.state]}`}
                aria-label={DRAFT_STATE_TEXT[e.state]}
              >
                {DRAFT_SYMBOL[e.state]}
              </span>
              <span>
                <b className="font-semibold">{e.name}</b> <span className="text-muted">{e.note}</span>
              </span>
            </li>
          ))}
        </ul>
        <p>Banned and enemy heroes can't be picked. Each wrong row unlocks a hint: positions, teams, players, attributes, then one free hero.</p>
      </div>
      <button type="button" onClick={onClose} className="mt-6 h-12 w-full rounded-[3px] bg-ink font-bold text-bg">
        Start drafting
      </button>
    </Modal>
  );
}
