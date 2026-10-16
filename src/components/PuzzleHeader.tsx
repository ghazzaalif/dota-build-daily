// F2 puzzle header, styled as a broadcast lower-third: the hero portrait butted
// against a solid name bar with one angled edge, then a meta strip underneath.
// Only shows what's public from the start (no team, side or times — those are hints).
import type { HeroInfo, Puzzle } from '../game/types';
import { HeroImage } from './Icons';

export function PuzzleHeader({ puzzle, hero }: { puzzle: Puzzle; hero: HeroInfo | undefined }) {
  return (
    <header className="pb-5 pt-4">
      <div className="flex items-stretch">
        <HeroImage hero={hero} className="aspect-[16/9] w-[112px] shrink-0 sm:w-[152px]" />
        <div className="chyron-cut flex min-w-0 flex-1 flex-col justify-center bg-ink py-2 pl-4 pr-9 text-bg sm:pl-5">
          <h1 className="font-display text-hero font-extrabold uppercase [overflow-wrap:anywhere] [text-wrap:balance] sm:text-heroLg">{puzzle.hero.name}</h1>
          <p className="mt-1 text-small font-semibold">{puzzle.role.label}</p>
        </div>
      </div>
      {/* Segments are separate blocks split by a 1px gap, so wrapping on narrow screens stays clean. */}
      <dl className="mt-px flex flex-wrap gap-px text-label">
        <div className="flex items-center bg-panel px-3 py-1.5">
          <dt className="sr-only">Tournament</dt>
          <dd className="font-semibold">{puzzle.tournament.name}</dd>
        </div>
        <div className="flex items-center bg-panel px-3 py-1.5">
          <dt className="sr-only">Stage</dt>
          <dd>{puzzle.tournament.stage}</dd>
        </div>
        <div className="flex flex-1 items-center bg-panel px-3 py-1.5 text-muted">
          <dt className="sr-only">Patch</dt>
          <dd>Patch {puzzle.patch}</dd>
        </div>
      </dl>
    </header>
  );
}
