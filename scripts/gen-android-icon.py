#!/usr/bin/env python3
"""Ikona Android aplikace GRID – hlava VR panáčka se sluchátky (jako původní logo) (rodina ikon s Moje Károu a e-mailem).

Tvary bere ze src/mascot/gridMascot.ts (stejné jako úvodní animace), vykreslí je rsvg-convert
a složí s tmavě modrým pozadím do src-tauri/icons/android/* (adaptivní ikona + klasické).
Spuštění: python3 scripts/gen-android-icon.py   (potřebuje bun, rsvg-convert, Pillow)
"""
import math, pathlib, subprocess, tempfile
from PIL import Image, ImageChops, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'src-tauri' / 'icons' / 'android'
A = 432 * 4
CYAN = (0, 243, 255)

def svg(**opts):
    js = f"import {{ mascotSvg, HEAD_VIEWBOX }} from './src/mascot/gridMascot.ts'; process.stdout.write(mascotSvg({{ glow: {str(opts.get('glow', True)).lower()}, mono: {str(opts.get('mono', False)).lower()}, viewBox: HEAD_VIEWBOX, bust: true }}));"
    return subprocess.check_output(['bun', '-e', js], cwd=ROOT).decode()

def render(svg_text, px):
    with tempfile.TemporaryDirectory() as d:
        src = pathlib.Path(d) / 'm.svg'; out = pathlib.Path(d) / 'm.png'
        src.write_text(svg_text)
        subprocess.check_call(['rsvg-convert', '-w', str(px), '-h', str(px), '-b', 'none', str(src), '-o', str(out)])
        return Image.open(out).convert('RGBA')

def background(size):
    img = Image.new('RGB', (size, size)); px = img.load(); c = size / 2
    inner, outer = (18, 34, 72), (6, 13, 34)
    for y in range(size):
        for x in range(size):
            t = min(1.0, math.hypot(x - c, y - c) / (size * 0.72))
            px[x, y] = tuple(round(inner[i] + (outer[i] - inner[i]) * t) for i in range(3))
    return img

def place(mascot, size, scale=0.7, dy=0.0):
    """Panáček do středu plátna size; scale = podíl šířky plátna. Ramena dole plynule vyblednou."""
    m = mascot.resize((round(size * scale), round(size * scale)), Image.LANCZOS)
    fade = Image.new('L', m.size, 255)
    fd = ImageDraw.Draw(fade)
    start = int(m.height * 0.72)
    for y in range(start, m.height):
        fd.line([(0, y), (m.width, y)], fill=round(255 * (1 - (y - start) / (m.height - start)) ** 1.5))
    m.putalpha(ImageChops.multiply(m.getchannel('A'), fade))
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    layer.alpha_composite(m, ((size - m.width) // 2, round((size - m.height) / 2 + dy * size)))
    return layer

def main():
    fg_full = place(render(svg(glow=True), A), A)
    mono = place(render(svg(glow=False, mono=True), A), A)
    bg = background(432)
    down = lambda im, px: im.resize((px, px), Image.LANCZOS)
    adaptive = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
    legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for dens, px in adaptive.items():
        d = OUT / f'mipmap-{dens}'; d.mkdir(parents=True, exist_ok=True)
        down(bg.convert('RGBA'), px).convert('RGB').save(d / 'ic_launcher_background.png')
        down(fg_full, px).save(d / 'ic_launcher_foreground.png')
        down(mono, px).save(d / 'ic_launcher_monochrome.png')

    full = Image.alpha_composite(down(bg.convert('RGBA'), A), fg_full)
    full = full.crop((A * 0.09, A * 0.09, A * 0.91, A * 0.91)).resize((A, A), Image.LANCZOS)
    def masked(shape):
        m = Image.new('L', (A, A), 0); dr = ImageDraw.Draw(m); box = (A * 0.02, A * 0.02, A * 0.98, A * 0.98)
        (dr.ellipse if shape == 'round' else lambda b, fill: dr.rounded_rectangle(b, radius=A * 0.2, fill=fill))(box, fill=255)
        out = Image.new('RGBA', (A, A), (0, 0, 0, 0)); out.paste(full, (0, 0), m)
        od = ImageDraw.Draw(out)
        if shape == 'round': od.ellipse(box, outline=CYAN + (110,), width=round(A * 0.008))
        else: od.rounded_rectangle(box, radius=A * 0.2, outline=CYAN + (110,), width=round(A * 0.008))
        return out
    square, round_ = masked('square'), masked('round')
    for dens, px in legacy.items():
        d = OUT / f'mipmap-{dens}'
        down(square, px).save(d / 'ic_launcher.png')
        down(round_, px).save(d / 'ic_launcher_round.png')

    (OUT / 'mipmap-anydpi-v26').mkdir(parents=True, exist_ok=True)
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
           '  <background android:drawable="@mipmap/ic_launcher_background"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
           '  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n</adaptive-icon>\n')
    (OUT / 'mipmap-anydpi-v26' / 'ic_launcher.xml').write_text(xml)
    (OUT / 'mipmap-anydpi-v26' / 'ic_launcher_round.xml').write_text(xml)
    (OUT / 'values').mkdir(exist_ok=True)
    (OUT / 'values' / 'ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_background">#0A1634</color>\n</resources>\n')
    # ── Malá ikona do stavového řádku / oznámení: bílá silueta (Android ji obarví) ──
    stat = render(svg(glow=False, mono=True), 384)
    stat_sizes = {'mdpi': 24, 'hdpi': 36, 'xhdpi': 48, 'xxhdpi': 72, 'xxxhdpi': 96}
    for dens, px in stat_sizes.items():
        d = OUT / f'drawable-{dens}'; d.mkdir(parents=True, exist_ok=True)
        stat.resize((px, px), Image.LANCZOS).save(d / 'ic_stat_grid.png')

    # ── Obrázek přehrávače v liště (Android z něj bere pozadí i barvy ovladače) ──
    ART = 1024
    art_bg = background(ART // 4).resize((ART, ART), Image.BICUBIC).convert('RGBA')
    head = place(render(svg(glow=True), ART * 2), ART * 2, scale=0.62).resize((ART, ART), Image.LANCZOS)
    art = Image.alpha_composite(art_bg, head)
    d = OUT / 'drawable-nodpi'; d.mkdir(parents=True, exist_ok=True)
    art.convert('RGB').save(d / 'media_art.png', optimize=True)
    print('hotovo:', OUT)

if __name__ == '__main__':
    main()
