#!/usr/bin/env python3
"""Regenerate the favicon set and the social card from the brand artwork.

Not part of the build — run it only when the logo or the mark changes:

    python3 tools/make-icons.py

Both source files are a single solid colour plus alpha, so the alpha channel
IS the artwork: it can be recoloured by keeping the alpha and replacing the
RGB, which is how the mark is knocked out to white here.
"""
from PIL import Image, ImageDraw, ImageFilter
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, 'assets', *p)

DEEP = (6, 56, 60)      # --deep
AQUA = (18, 238, 242)   # --aqua
WHITE = (255, 255, 255)

def whiten(src):
    im = Image.open(src).convert('RGBA')
    out = Image.new('RGBA', im.size, WHITE + (0,))
    out.putalpha(im.getchannel('A'))
    return out.crop(out.getchannel('A').getbbox())

mark = whiten(A('hlm-mark.png'))
logo = whiten(A('hlm-logo.png'))

def icon(size):
    """Full-bleed brand square. No rounded corners: every platform applies
       its own mask, and at 16px a radius is just mush."""
    im = Image.new('RGBA', (size, size), DEEP + (255,))
    m = mark.copy()
    m.thumbnail((int(size * 0.80), int(size * 0.80)), Image.LANCZOS)
    im.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return im

for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'),
                   (180, 'apple-touch-icon.png'), (32, 'icon-32.png')]:
    icon(size).save(A(name))
    print('  assets/' + name, f'{size}x{size}')

icon(256).save(A('favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
print('  assets/favicon.ico  16/32/48')

# ── 1200x630 social card ──
og = Image.new('RGBA', (1200, 630), DEEP + (255,))
glow = Image.new('RGBA', (1200, 630), (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
g.ellipse((620, -220, 1500, 520), fill=AQUA + (70,))
g.ellipse((-260, 300, 420, 900), fill=(11, 143, 150, 60))
og.alpha_composite(glow.filter(ImageFilter.GaussianBlur(150)))

l = logo.copy()
l.thumbnail((620, 620), Image.LANCZOS)
og.alpha_composite(l, ((1200 - l.width) // 2, (630 - l.height) // 2 - 34))
rule_y = (630 + l.height) // 2 + 26
ImageDraw.Draw(og).rounded_rectangle((540, rule_y, 660, rule_y + 5), radius=3, fill=AQUA + (255,))
og.convert('RGB').save(A('og-card.jpg'), quality=88, optimize=True, progressive=True)
print('  assets/og-card.jpg  1200x630', os.path.getsize(A('og-card.jpg')), 'bytes')
