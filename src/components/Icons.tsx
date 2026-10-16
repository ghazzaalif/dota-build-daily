// Small inline icon set + item/hero images with text fallbacks (§12: CDN failure → text tile).
import { useState } from 'react';
import type { HeroInfo, ItemInfo } from '../game/types';

type P = { className?: string };
const svg = (d: string) =>
  function Icon({ className = 'h-5 w-5' }: P) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d={d} />
      </svg>
    );
  };

export const HelpIcon = svg('M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z');
export const StatsIcon = svg('M4 20V10M10 20V4M16 20v-7M22 20H2');
export const GearIcon = svg(
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
);
export const CloseIcon = svg('M18 6 6 18M6 6l12 12');
export const ChevronLeft = svg('m15 18-6-6 6-6');
export const ChevronRight = svg('m9 18 6-6-6-6');
export const LockIcon = svg('M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z');
export const SearchIcon = svg('m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z');
export const BulbIcon = svg('M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z');
export const ShareIcon = svg('M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13');
export const ExternalIcon = svg('M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6');

export function Coin({ className = 'h-3 w-3' }: P) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill="var(--gold)" />
      <circle cx="6" cy="6" r="3" fill="none" stroke="var(--bg)" strokeOpacity=".35" />
    </svg>
  );
}

/** Short label for the text fallback when an icon can't load. */
export function shortName(item: ItemInfo): string {
  const alias = item.aliases.find((a) => a.length <= 5);
  if (alias) return alias.toUpperCase();
  return item.name
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join('')
    .slice(0, 4);
}

/**
 * The short-name text tile always sits underneath; the icon covers it once loaded.
 * So a slow, blocked or broken CDN still shows something readable (§12).
 */
export function ItemImage({ item, className = '' }: { item: ItemInfo; className?: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');
  return (
    <span className={`relative block overflow-hidden bg-raised ${className}`}>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-[11px] font-bold leading-none text-ink">
        {state !== 'ok' && shortName(item)}
      </span>
      {state !== 'failed' && (
        <img
          src={item.img}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setState('ok')}
          onError={() => setState('failed')}
          className={`absolute inset-0 h-full w-full object-cover ${state === 'ok' ? '' : 'opacity-0'}`}
        />
      )}
    </span>
  );
}

export function HeroImage({ hero, className = '' }: { hero: HeroInfo | undefined; className?: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');
  return (
    <span className={`relative block overflow-hidden bg-raised ${className}`}>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center px-0.5 text-center text-[11px] font-semibold leading-tight text-ink [overflow-wrap:anywhere]">
        {state !== 'ok' && (hero?.name ?? '?')}
      </span>
      {hero && state !== 'failed' && (
        <img
          src={hero.img}
          alt=""
          loading="lazy"
          onLoad={() => setState('ok')}
          onError={() => setState('failed')}
          className={`absolute inset-0 h-full w-full object-cover ${state === 'ok' ? '' : 'opacity-0'}`}
        />
      )}
    </span>
  );
}
