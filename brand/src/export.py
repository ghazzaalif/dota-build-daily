"""Rasters and web icons from the SVG masters (needs cairosvg + Pillow).

  python3 brand/src/export.py   → brand/png/*, brand/web/*, and the site's icons in public/
"""
import io, json, os, shutil
import cairosvg
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.dirname(HERE); ROOT = os.path.dirname(B)
INK = '#0E141B'

def png(svg, w=None, h=None):
    return Image.open(io.BytesIO(cairosvg.svg2png(url=os.path.join(B, svg), output_width=w, output_height=h))).convert('RGBA')

os.makedirs(f'{B}/png', exist_ok=True); os.makedirs(f'{B}/web', exist_ok=True)
for name in ['dbd-symbol', 'dbd-symbol-light', 'dbd-symbol-black', 'dbd-symbol-white']:
    for s in (64, 256, 1024):
        png(f'{name}.svg', s, s).save(f'{B}/png/{name}-{s}.png')
for name in ['dbd-horizontal', 'dbd-horizontal-light', 'dbd-horizontal-black', 'dbd-horizontal-white', 'dbd-stacked', 'dbd-stacked-light']:
    png(f'{name}.svg', 1200 if 'horizontal' in name else 800).save(f'{B}/png/{name}.png')
# Discord / app stores: 1024 full-bleed square (Discord crops it to a circle)
png('dbd-app-icon.svg', 1024, 1024).convert('RGB').save(f'{B}/png/dbd-app-icon-1024.png')

# Web icon set: the small cut on a rounded ink tile for tabs; the full mark for home screens
W = f'{B}/web'
shutil.copy(f'{B}/dbd-favicon.svg', f'{W}/favicon.svg')
for s in (16, 32, 48): png('dbd-favicon.svg', s, s).save(f'{W}/favicon-{s}.png')
png('dbd-favicon.svg', 48, 48).save(f'{W}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
png('dbd-app-icon.svg', 180, 180).convert('RGB').save(f'{W}/apple-touch-icon.png')
for s in (192, 512): png('dbd-app-icon.svg', s, s).convert('RGB').save(f'{W}/icon-{s}.png')
# Maskable: mark inside the 80 % safe zone on a full-bleed tile
mk = Image.new('RGBA', (512, 512), INK); m = png('dbd-symbol.svg', 300, 300); mk.alpha_composite(m, (106, 106)); mk.convert('RGB').save(f'{W}/maskable-512.png')
# Social preview (link cards): horizontal lockup on ink
og = Image.new('RGBA', (1200, 630), INK); lk = png('dbd-horizontal.svg', 960); og.alpha_composite(lk, ((1200 - lk.width) // 2, (630 - lk.height) // 2 - 20)); og.convert('RGB').save(f'{W}/og-image.png')
json.dump({
    'name': 'Dota Build Daily', 'short_name': 'Build Daily', 'start_url': '/', 'display': 'standalone',
    'background_color': INK, 'theme_color': INK,
    'icons': [{'src': '/icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
              {'src': '/icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
              {'src': '/maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}],
}, open(f'{W}/site.webmanifest', 'w'), indent=2)
for f in os.listdir(W): shutil.copy(f'{W}/{f}', f'{ROOT}/public/{f}')
print('exported')
