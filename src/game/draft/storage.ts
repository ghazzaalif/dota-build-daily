// Draft F8 persistence under its own prefix (Draft PRD §9.4). Build Daily's dbd:v1:* keys
// are never touched; settings stay in the shared dbd:v1:settings key.
import { emptyStats, read, write, type GameStatus, type Stats } from '../storage';

export interface DraftSaved {
  rows: number[][];
  hintsRevealed: number;
  earlyReveals: number;
  lifeline?: { slot: number; heroId: number } | null;
  status: GameStatus;
  draft?: (number | null)[];
}

const K = {
  stats: 'dbd:draft:v1:stats',
  active: 'dbd:draft:v1:active',
  seenTutorial: 'dbd:draft:v1:seenTutorial',
  game: (date: string) => `dbd:draft:v1:game:${date}`,
};

export const loadDraftGame = (date: string) => read<DraftSaved>(K.game(date));
export const saveDraftGame = (date: string, g: DraftSaved) => write(K.game(date), g);
export const loadDraftStats = (): Stats => ({ ...emptyStats(), ...(read<Stats>(K.stats) ?? {}) });
export const saveDraftStats = (s: Stats) => write(K.stats, s);
export const loadDraftActiveDate = () => read<string>(K.active);
export const saveDraftActiveDate = (d: string) => write(K.active, d);
export const draftTutorialSeen = () => read<boolean>(K.seenTutorial) === true;
export const markDraftTutorialSeen = () => write(K.seenTutorial, true);
