#!/usr/bin/env python3
"""Grafika pro Google Play → store/
  - icon-512.png          ikona aplikace 512 × 512 (celý čtverec, Play si roh zakulatí sám)
  - feature-graphic.png   hlavní grafika 1024 × 500

Panáček je ze stejných tvarů jako ikona aplikace (scripts/gen-android-icon.py → src/mascot/gridMascot.ts).
Spuštění: python3 scripts/gen-store-assets.py   (potřebuje bun, rsvg-convert, Pillow)
"""
import importlib.util, math, pathlib, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'store'
CYAN, PINK, PURPLE = (0, 243, 255), (248, 0, 255), (140, 60, 255)
FONT_BLACK = '/usr/share/fonts/noto/NotoSans-Black.ttf'
FONT_BOLD = '/usr/share/fonts/noto/NotoSans-Bold.ttf'

spec = importlib.util.spec_from_file_location('icon', ROOT / 'scripts' / 'gen-android-icon.py')
icon = importlib.util.module_from_spec(spec); spec.loader.exec_module(icon)


def play_icon():
    """Stejná kompozice jako ikona v telefonu (pozadí + hlava), bez masky"""
    A = 1024
    bg = icon.background(256).resize((A, A), Image.BICUBIC).convert('RGBA')
    fg = icon.place(icon.render(icon.svg(glow=True), A * 2), A * 2).resize((A, A), Image.LANCZOS)
    full = Image.alpha_composite(bg, fg).crop((A * 0.09, A * 0.09, A * 0.91, A * 0.91))
    return full.resize((512, 512), Image.LANCZOS).convert('RGB')


def glow_text(base, xy, text, font, color, spacing, blur=(6, 16)):
    """Text s neonovou září (rozostřené kopie pod ostrým textem), letter-spacing ručně"""
    layer = Image.new('RGBA', base.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=(255, 255, 255, 255))
        x += font.getlength(ch) + spacing
    for r, col, a in ((blur[1], PINK, 150), (blur[0], color, 255)):
        g = Image.new('RGBA', base.size, col + (0,)); g.putalpha(layer.getchannel('A').filter(ImageFilter.GaussianBlur(r)).point(lambda v: min(255, v * a // 180)))
        base.alpha_composite(g)
    base.alpha_composite(layer)
    return x - spacing


def text_width(text, font, spacing):
    return sum(font.getlength(c) for c in text) + spacing * (len(text) - 1)


def feature_graphic():
    W, H = 1024, 500
    img = Image.new('RGBA', (W, H)); px = img.load()
    # Tmavé pozadí s modrou září vlevo (za panáčkem)
    for y in range(H):
        for x in range(W):
            t = min(1.0, math.hypot((x - 270) / 1.15, y - 230) / 620)
            px[x, y] = (round(20 - 15 * t), round(36 - 27 * t), round(78 - 52 * t), 255)

    # Neonová mřížka v perspektivě (spodek) – „GRID“
    grid = Image.new('RGBA', (W, H), (0, 0, 0, 0)); g = ImageDraw.Draw(grid)
    horizon, vx = 330, W * 0.62
    for i in range(-14, 15):
        x_bottom = vx + i * 120
        g.line([(vx + i * 9, horizon), (x_bottom, H + 40)], fill=CYAN + (70,), width=2)
    for k in range(1, 9):
        y = horizon + (H - horizon) * (k / 8) ** 1.8
        g.line([(0, y), (W, y)], fill=PURPLE + (int(40 + 60 * k / 8),), width=2)
    fade = Image.new('L', (W, H), 0); fd = ImageDraw.Draw(fade)
    for y in range(horizon, H):
        fd.line([(0, y), (W, y)], fill=int(255 * ((y - horizon) / (H - horizon)) ** 0.7))
    grid.putalpha(Image.composite(grid.getchannel('A'), Image.new('L', (W, H), 0), fade))
    img.alpha_composite(grid.filter(ImageFilter.GaussianBlur(3)))
    img.alpha_composite(grid)

    # Spektrum (sloupce) přes mřížku vpravo
    rnd = random.Random(7)
    bars = Image.new('RGBA', (W, H), (0, 0, 0, 0)); b = ImageDraw.Draw(bars)
    n, x0, x1, base = 34, 470, 990, 440
    for i in range(n):
        f = i / (n - 1)
        h = (0.35 + 0.65 * math.exp(-((f - 0.22) / 0.28) ** 2)) * (0.6 + 0.4 * rnd.random()) * 120
        x = x0 + (x1 - x0) * f
        col = tuple(round(CYAN[c] + (PINK[c] - CYAN[c]) * f) for c in range(3))
        b.rounded_rectangle((x, base - h, x + 9, base), radius=4, fill=col + (200,))
    img.alpha_composite(bars.filter(ImageFilter.GaussianBlur(7)))
    img.alpha_composite(bars)

    # Panáček (hlava se sluchátky) vlevo
    S = 470
    head = icon.place(icon.render(icon.svg(glow=True), S * 2), S * 2, scale=0.92).resize((S, S), Image.LANCZOS)
    img.alpha_composite(head, (40, 5))

    # GRID + podtitul + logo ZažijVR
    title_font = ImageFont.truetype(FONT_BLACK, 132)
    sp = 30
    tx = 488
    glow_text(img, (tx, 52), 'GRID', title_font, CYAN, sp)
    sub = ImageFont.truetype(FONT_BOLD, 34)
    ImageDraw.Draw(img).text((tx + 4, 222), 'Neonový hudební přehrávač', font=sub, fill=(200, 236, 255, 255))
    logo = Image.open(ROOT / 'public' / 'logo.png').convert('RGBA')
    logo = logo.resize((round(logo.width * 52 / logo.height), 52), Image.LANCZOS)
    lg = Image.new('RGBA', (W, H), (0, 0, 0, 0)); lg.alpha_composite(logo, (tx + 4, 282))
    halo = Image.new('RGBA', (W, H), CYAN + (0,)); halo.putalpha(lg.getchannel('A').filter(ImageFilter.GaussianBlur(8)).point(lambda v: v * 3 // 4))
    img.alpha_composite(halo); img.alpha_composite(lg)
    return img.convert('RGB')


def main():
    OUT.mkdir(exist_ok=True)
    play_icon().convert('RGBA').save(OUT / 'icon-512.png', optimize=True)  # Play chce 32bitové PNG
    feature_graphic().save(OUT / 'feature-graphic.png', optimize=True)
    print('hotovo:', OUT)


if __name__ == '__main__':
    main()
