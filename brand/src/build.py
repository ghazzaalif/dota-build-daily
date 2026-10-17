"""Builds the Dota Build Daily logo masters (SVG) from code, so every variant shares one geometry.

  python3 brand/src/build.py      → brand/*.svg

The mark: six item tiles (the six inventory slots of a build) on a 3×3 grid form a D.
The wordmark is Big Shoulders Display ExtraBold (OFL, @fontsource) converted to outlines.
"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
ROOT = os.path.dirname(OUT)

INK = '#0E141B'      # dark background / ink on light
PAPER = '#EDF1F4'    # text on dark
GOLD = '#E2AE48'     # tiles on dark
GREEN = '#4FA35A'    # the found slot
GREEN_LIGHT = '#3D8A47'  # green on light backgrounds (AA for large shapes)

def tile(x, y, w, h, tl=8, tr=8, br=8, bl=8):
    return (f'M{x+tl:.2f},{y:.2f} H{x+w-tr:.2f} A{tr},{tr} 0 0 1 {x+w:.2f},{y+tr:.2f} V{y+h-br:.2f} '
            f'A{br},{br} 0 0 1 {x+w-br:.2f},{y+h:.2f} H{x+bl:.2f} A{bl},{bl} 0 0 1 {x:.2f},{y+h-bl:.2f} '
            f'V{y+tl:.2f} A{tl},{tl} 0 0 1 {x+tl:.2f},{y:.2f} Z')

def mark_paths(u=62, g=13, r=8, x_nudge=3, small=False):
    """Returns (body_d, bowl_d) in a 256 box. The bowl (middle-right) is the 'found' tile.
    Optical corrections: the whole mark sits 3 px right of centre (the left column is heavier),
    and the round bowl overshoots 2 px to the right."""
    span = 3 * u + 2 * g
    x0 = (256 - span) / 2 + x_nudge
    y0 = (256 - span) / 2 - 1  # optical centre slightly above geometric
    R = u / 2
    P = lambda c, r_: (x0 + c * (u + g), y0 + r_ * (u + g))
    body = [tile(*P(0, 0), u, u, r, r, r, r), tile(*P(0, 1), u, u, r, r, r, r), tile(*P(0, 2), u, u, r, r, r, r),
            tile(*P(1, 0), u, u, r, R, r, r), tile(*P(1, 2), u, u, r, r, R, r)]
    bx, by = P(2, 1)
    bowl = tile(bx, by, u + 2, u, r, R, R, r)
    return ' '.join(body), bowl

def svg(w, h, inner, title='Dota Build Daily'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><title>{title}</title>{inner}</svg>\n'

def symbol(body_fill, bowl_fill, small=False, size_args=None):
    b, w = mark_paths(**(size_args or {}))
    return f'<path fill="{body_fill}" d="{b}"/><path fill="{bowl_fill}" d="{w}"/>'

SMALL = dict(u=58, g=21, r=6, x_nudge=3)  # ≤32 px: wider gaps so the tiles stay apart at 16 px

# --- wordmark as outlines -------------------------------------------------------------------
def wordmark(text, cap_px, tracking=0.02):
    from fontTools.ttLib import TTFont
    import io
    f = os.path.join(ROOT, 'node_modules/@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff')
    font = TTFont(f)
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font['head'].unitsPerEm
    cap = font['OS/2'].sCapHeight or 700
    s = cap_px / cap
    hmtx = font['hmtx']
    x = 0.0
    parts = []
    for ch in text:
        gname = cmap[ord(ch)]
        adv = hmtx[gname][0]
        pen = SVGPathPen(gs)
        gs[gname].draw(TransformPen(pen, (s, 0, 0, -s, x, cap_px)))
        d = pen.getCommands()
        if d: parts.append(d)
        x += adv * s + tracking * upm * s
    width = x - tracking * upm * s
    return ' '.join(parts), width

def write(name, content):
    with open(os.path.join(OUT, name), 'w') as fh: fh.write(content)

def main():
    # Symbol masters
    write('dbd-symbol.svg', svg(256, 256, symbol(GOLD, GREEN)))                 # on dark
    write('dbd-symbol-light.svg', svg(256, 256, symbol(INK, GREEN_LIGHT)))      # on light
    write('dbd-symbol-black.svg', svg(256, 256, symbol('#000000', '#000000')))
    write('dbd-symbol-white.svg', svg(256, 256, symbol('#FFFFFF', '#FFFFFF')))
    write('dbd-symbol-small.svg', svg(256, 256, symbol(GOLD, GREEN, size_args=SMALL)))
    # App icon: mark on the ink tile (Discord, phones). Discord crops to a circle, so keep the mark inside 70 %.
    b, w = mark_paths()
    k = 0.62; t = 128 * (1 - k)
    inner = (f'<rect width="256" height="256" fill="{INK}"/>'
             f'<g transform="translate({t:.2f} {t:.2f}) scale({k})"><path fill="{GOLD}" d="{b}"/><path fill="{GREEN}" d="{w}"/></g>')
    write('dbd-app-icon.svg', svg(256, 256, inner))
    bs, ws = mark_paths(**SMALL)
    inner_s = (f'<rect width="256" height="256" rx="48" fill="{INK}"/>'
               f'<g transform="translate({128*(1-0.72):.2f} {128*(1-0.72):.2f}) scale(0.72)"><path fill="{GOLD}" d="{bs}"/><path fill="{GREEN}" d="{ws}"/></g>')
    write('dbd-favicon.svg', svg(256, 256, inner_s))

    # Lockups: symbol height 256; wordmark cap height = 0.36 × symbol, on one line
    cap = 92
    word, ww = wordmark('DOTA BUILD DAILY', cap)
    gap = 40
    W = 256 + gap + ww + 24
    def horizontal(sym_body, sym_bowl, text_fill, bg=None):
        y = (256 - cap) / 2 - 1
        bgr = f'<rect width="{W:.0f}" height="256" fill="{bg}"/>' if bg else ''
        return svg(round(W), 256, bgr + symbol(sym_body, sym_bowl) +
                   f'<g transform="translate({256 + gap - 12} {y:.2f})"><path fill="{text_fill}" d="{word}"/></g>')
    write('dbd-horizontal.svg', horizontal(GOLD, GREEN, PAPER))           # on dark
    write('dbd-horizontal-light.svg', horizontal(INK, GREEN_LIGHT, INK))  # on light
    write('dbd-horizontal-black.svg', horizontal('#000000', '#000000', '#000000'))
    write('dbd-horizontal-white.svg', horizontal('#FFFFFF', '#FFFFFF', '#FFFFFF'))
    # Stacked: symbol over the wordmark
    capS = 58
    wordS, wws = wordmark('DOTA BUILD DAILY', capS)
    SW = max(256, wws) + 48
    def stacked(sym_body, sym_bowl, text_fill):
        sx = (SW - 256) / 2
        return svg(round(SW), 256 + 36 + capS + 24,
                   f'<g transform="translate({sx:.2f} 0)">{symbol(sym_body, sym_bowl)}</g>'
                   f'<g transform="translate({(SW - wws) / 2:.2f} {256 + 28})"><path fill="{text_fill}" d="{wordS}"/></g>')
    write('dbd-stacked.svg', stacked(GOLD, GREEN, PAPER))
    write('dbd-stacked-light.svg', stacked(INK, GREEN_LIGHT, INK))
    # Shared shapes for the game (nav logo, Discord results card)
    bs2, ws2 = mark_paths(**SMALL)
    ts = ('// Generated by brand/src/build.py: do not edit by hand.\n'
          '// The Dota Build Daily mark in a 256 box: six item tiles forming a D; BOWL is the "found" tile.\n'
          f"export const MARK_BODY = '{b}';\nexport const MARK_BOWL = '{w}';\n"
          f"export const MARK_SMALL_BODY = '{bs2}';\nexport const MARK_SMALL_BOWL = '{ws2}';\n")
    with open(os.path.join(ROOT, 'src/brand/mark.ts'), 'w') as fh: fh.write(ts)
    print('wrote masters to', OUT)

main()
