// The Dota Build Daily logo mark: six item tiles forming a D (shapes from brand/src/build.py).
// Below 40 px the small cut is used, whose wider gaps keep the tiles apart.
import { MARK_BODY, MARK_BOWL, MARK_SMALL_BODY, MARK_SMALL_BOWL } from '../brand/mark';

export function BrandMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  const small = size < 40;
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} aria-hidden="true" className={className}>
      <path fill="var(--brand-tile)" d={small ? MARK_SMALL_BODY : MARK_BODY} />
      <path fill="var(--brand-bowl)" d={small ? MARK_SMALL_BOWL : MARK_BOWL} />
    </svg>
  );
}
