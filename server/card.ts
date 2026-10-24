// The results card posted in Discord (like Wordle's): one panel per player with their
// avatar, name, score and colour grid. Colours only, never items. Drawn as SVG, rendered
// to PNG with resvg.
//
// All text is converted to outlines here (opentype.js, the game's own fonts) instead of
// being left to resvg's font lookup: on the server that lookup fell back to a wide system
// font, which pushed the title off the card. Outlines also let the card be sized to fit.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import opentype from 'opentype.js';
import { MARK_BODY, MARK_BOWL } from '../src/brand/mark';
import type { TileState } from '../src/game/types';

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

// --- text as outlines -----------------------------------------------------------------
let fonts: { display: opentype.Font; body: opentype.Font } | null = null;
function loadFonts() {
  if (fonts) return fonts;
  const req = createRequire(import.meta.url);
  const load = (f: string) => {
    const b = readFileSync(req.resolve(f));
    return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  };
  fonts = {
    display: load('@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff'),
    body: load('@fontsource/sofia-sans/files/sofia-sans-latin-700-normal.woff'),
  };
  return fonts;
}

type Face = 'display' | 'body';
/** Drops characters the font can't draw (emoji, CJK…), which would otherwise render as boxes. */
const drawable = (face: Face, text: string) => [...text].filter((ch) => loadFonts()[face].charToGlyph(ch).index !== 0).join('');
export const textWidth = (face: Face, text: string, size: number, tracking = 0) =>
  loadFonts()[face].getAdvanceWidth(text, size, { kerning: true }) + tracking * Math.max(0, [...text].length - 1);

/** Shortens text with an ellipsis until it fits maxWidth. */
function fit(face: Face, text: string, size: number, maxWidth: number): string {
  if (textWidth(face, text, size) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1 && textWidth(face, chars.join('') + '…', size) > maxWidth) chars.pop();
  return chars.join('') + '…';
}

/** `text` as an SVG path with its baseline at y; anchor 'middle' centres it on x. */
function textPath(face: Face, text: string, x: number, y: number, size: number, fill: string, anchor: 'start' | 'middle' = 'start', tracking = 0): string {
  const font = loadFonts()[face];
  const w = textWidth(face, text, size, tracking);
  let cx = anchor === 'middle' ? x - w / 2 : x;
  const parts: string[] = [];
  for (const ch of text) {
    parts.push(font.getPath(ch, cx, y, size).toPathData(2));
    cx += font.getAdvanceWidth(ch, size) + tracking;
  }
  return `<path fill="${fill}" d="${parts.join('')}"/>`;
}

const TITLE_SIZE = 30;
const TITLE_TRACKING = 1;
const TITLE_X = PAD + 38; // after the mark
const TITLE_GAP = 11; // between "DAILY" and the number (the font's own space is very narrow)
const titleWidth = (puzzleNo: number) =>
  textWidth('display', 'DOTA BUILD DAILY', TITLE_SIZE, TITLE_TRACKING) + TITLE_GAP + textWidth('display', `#${puzzleNo}`, TITLE_SIZE, TITLE_TRACKING);

function panel(p: CardPlayer, i: number, x: number, y: number): string {
  const cx = x + PANEL_W / 2;
  const cy = y + 20 + 32;
  const avatar = p.avatar
    ? `<clipPath id="a${i}"><circle cx="${cx}" cy="${cy}" r="32"/></clipPath>
       <image href="data:image/png;base64,${p.avatar.toString('base64')}" x="${cx - 32}" y="${cy - 32}" width="64" height="64" clip-path="url(#a${i})" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${cx}" cy="${cy}" r="32" fill="${C.raised}"/>
       ${textPath('display', ([...drawable('display', p.name).trim()][0] ?? '?').toUpperCase(), cx, cy + 10, 30, C.ink, 'middle')}`;
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
    ${textPath('body', fit('body', drawable('body', p.name).trim() || 'Player', 15, PANEL_W - 16), cx, y + 106, 15, C.ink, 'middle')}
    ${textPath('body', score, cx, y + 123, 13, p.status === 'won' ? C.green : C.muted, 'middle')}
    ${tiles.join('')}
  </g>`;
}

export function cardSize(n: number, puzzleNo = 0): { width: number; height: number } {
  const shown = Math.min(n, MAX_SHOWN);
  const cols = Math.max(1, Math.min(shown, PER_ROW));
  const rows = Math.max(1, Math.ceil(shown / PER_ROW));
  const width = Math.ceil(Math.max(360, PAD * 2 + cols * PANEL_W + (cols - 1) * GAP, TITLE_X + titleWidth(puzzleNo) + PAD));
  const height = HEADER + rows * PANEL_H + (rows - 1) * GAP + PAD + (n > MAX_SHOWN ? 24 : 0);
  return { width, height };
}

export function cardSvg(input: CardInput): string {
  const { width, height } = cardSize(input.players.length, input.puzzleNo);
  const goldPart = 'DOTA BUILD DAILY';
  const numberX = TITLE_X + textWidth('display', goldPart, TITLE_SIZE, TITLE_TRACKING) + TITLE_GAP;
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
  <desc>${esc(`Dota Build Daily #${input.puzzleNo}: ${input.players.map((p) => p.name).join(', ')}`)}</desc>
  ${textPath('display', goldPart, TITLE_X, 50, TITLE_SIZE, C.gold, 'start', TITLE_TRACKING)}
  ${textPath('display', `#${input.puzzleNo}`, numberX, 50, TITLE_SIZE, C.ink, 'start', TITLE_TRACKING)}
  ${panels.join('\n')}
  ${more > 0 ? textPath('body', `+${more} more`, width / 2, height - PAD + 4, 14, C.muted, 'middle') : ''}
</svg>`;
}

export async function renderCard(input: CardInput): Promise<Buffer> {
  const { Resvg } = await import('@resvg/resvg-js');
  const svg = cardSvg(input);
  // No <text> is left in the SVG, so resvg needs no fonts at all.
  const r = new Resvg(svg, { fitTo: { mode: 'zoom', value: 2 }, font: { loadSystemFonts: false } });
  return r.render().asPng();
}
