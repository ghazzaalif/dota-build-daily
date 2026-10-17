// The results card posted in Discord (like Wordle's): one panel per player with their
// avatar, name, score and colour grid. Colours only, never items. Drawn as SVG, rendered
// to PNG with resvg using the same fonts as the game.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { MARK_BODY, MARK_BOWL } from '../src/brand/mark';
import type { TileState } from '../src/game/types';
import { woffToSfnt } from './woff';

export interface CardPlayer {
  name: string;
  /** PNG bytes of the Discord avatar, or null to draw the initial instead. */
  avatar: Buffer | null;
  status: 'won' | 'lost' | 'in_progress';
  states: TileState[][];
}

export interface CardInput {
  puzzleNo: number;
  players: CardPlayer[];
}

// Same values as the dark theme in src/index.css.
const C = {
  bg: '#0e141b',
  panel: '#151e27',
  raised: '#1e2934',
  line: '#2c3a47',
  ink: '#edf1f4',
  muted: '#9aa8b5',
  gold: '#e2ae48',
  green: '#4fa35a',
  tile: { green: '#4fa35a', yellow: '#d6b33a', orange: '#db7a34', grey: '#3a4752' } as Record<TileState, string>,
};

export const MAX_SHOWN = 15;
const PER_ROW = 5;
const PAD = 28;
const HEADER = 76;
const PANEL_W = 128;
const PANEL_H = 228;
const GAP = 12;
const TILE = 13;
const TILE_GAP = 3;
const ROWS = 6;
const COLS = 6;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clip = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s);

function panel(p: CardPlayer, i: number, x: number, y: number): string {
  const cx = x + PANEL_W / 2;
  const cy = y + 20 + 32;
  const avatar = p.avatar
    ? `<clipPath id="a${i}"><circle cx="${cx}" cy="${cy}" r="32"/></clipPath>
       <image href="data:image/png;base64,${p.avatar.toString('base64')}" x="${cx - 32}" y="${cy - 32}" width="64" height="64" clip-path="url(#a${i})" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${cx}" cy="${cy}" r="32" fill="${C.raised}"/>
       <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-family="Big Shoulders Display" font-weight="800" font-size="30" fill="${C.ink}">${esc([...p.name][0]?.toUpperCase() ?? '?')}</text>`;
  const score = p.status === 'won' ? `${p.states.length}/6` : p.status === 'lost' ? 'X/6' : `${p.states.length}/6…`;
  const gridW = COLS * TILE + (COLS - 1) * TILE_GAP;
  const gx = x + (PANEL_W - gridW) / 2;
  const gy = y + 132;
  const tiles: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const s = p.states[r]?.[c];
      const tx = gx + c * (TILE + TILE_GAP);
      const ty = gy + r * (TILE + TILE_GAP);
      tiles.push(
        s
          ? `<rect x="${tx}" y="${ty}" width="${TILE}" height="${TILE}" rx="2" fill="${C.tile[s]}"/>`
          : `<rect x="${tx + 0.5}" y="${ty + 0.5}" width="${TILE - 1}" height="${TILE - 1}" rx="2" fill="none" stroke="${C.line}"/>`,
      );
    }
  }
  return `<g>
    <rect x="${x + 0.5}" y="${y + 0.5}" width="${PANEL_W - 1}" height="${PANEL_H - 1}" rx="14" fill="${C.panel}" stroke="${C.line}"/>
    ${avatar}
    <text x="${cx}" y="${y + 106}" text-anchor="middle" font-family="Sofia Sans" font-weight="700" font-size="15" fill="${C.ink}">${esc(clip(p.name, 12))}</text>
    <text x="${cx}" y="${y + 123}" text-anchor="middle" font-family="Sofia Sans" font-weight="700" font-size="13" fill="${p.status === 'won' ? C.green : C.muted}">${score}</text>
    ${tiles.join('')}
  </g>`;
}

export function cardSize(n: number): { width: number; height: number } {
  const shown = Math.min(n, MAX_SHOWN);
  const cols = Math.max(1, Math.min(shown, PER_ROW));
  const rows = Math.max(1, Math.ceil(shown / PER_ROW));
  const width = Math.max(360, PAD * 2 + cols * PANEL_W + (cols - 1) * GAP);
  const height = HEADER + rows * PANEL_H + (rows - 1) * GAP + PAD + (n > MAX_SHOWN ? 24 : 0);
  return { width, height };
}

export function cardSvg(input: CardInput): string {
  const { width, height } = cardSize(input.players.length);
  const shown = input.players.slice(0, MAX_SHOWN);
  const panels = shown.map((p, i) => {
    const row = Math.floor(i / PER_ROW);
    const inRow = Math.min(PER_ROW, shown.length - row * PER_ROW);
    const rowW = inRow * PANEL_W + (inRow - 1) * GAP;
    const x = (width - rowW) / 2 + (i % PER_ROW) * (PANEL_W + GAP);
    const y = HEADER + row * (PANEL_H + GAP);
    return panel(p, i, x, y);
  });
  const more = input.players.length - shown.length;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="18" fill="${C.bg}"/>
  <g transform="translate(${PAD - 4} 22) scale(${34 / 256})"><path fill="${C.gold}" d="${MARK_BODY}"/><path fill="${C.green}" d="${MARK_BOWL}"/></g>
  <text x="${PAD + 38}" y="50" font-family="Big Shoulders Display" font-weight="800" font-size="30" letter-spacing="1"><tspan fill="${C.gold}">DOTA BUILD DAILY</tspan><tspan fill="${C.ink}"> #${input.puzzleNo}</tspan></text>
  ${panels.join('\n')}
  ${more > 0 ? `<text x="${width / 2}" y="${height - PAD + 4}" text-anchor="middle" font-family="Sofia Sans" font-weight="700" font-size="14" fill="${C.muted}">+${more} more</text>` : ''}
</svg>`;
}

let fonts: Buffer[] | null = null;
function loadFonts(): Buffer[] {
  if (fonts) return fonts;
  const req = createRequire(import.meta.url);
  fonts = [
    '@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff',
    '@fontsource/sofia-sans/files/sofia-sans-latin-700-normal.woff',
  ].map((f) => woffToSfnt(readFileSync(req.resolve(f))));
  return fonts;
}

export async function renderCard(input: CardInput): Promise<Buffer> {
  const { Resvg } = await import('@resvg/resvg-js');
  const svg = cardSvg(input);
  // fontBuffers works at runtime (resvg-js ≥ 2.5) but is missing from its type definitions.
  const font = { fontBuffers: loadFonts(), loadSystemFonts: false, defaultFontFamily: 'Sofia Sans' };
  const r = new Resvg(svg, { fitTo: { mode: 'zoom', value: 2 }, font: font as { loadSystemFonts: boolean } });
  return r.render().asPng();
}
