"""Compose App Store screenshots for Vidora from raw iPhone captures.

Put raw captures (PNG/JPEG, straight from the iPhone, unedited) here:

    docs/store/screenshots/raw/tr/1.png ... 7.png
    docs/store/screenshots/raw/en/1.png ... 7.png

Then run from the repo root:

    python tools/compose_screenshots.py

Output (RGB PNG, no alpha, exact App Store sizes):

    docs/store/screenshots/out/<lang>/6.9in/<n>.png   1320 x 2868
    docs/store/screenshots/out/<lang>/6.5in/<n>.png   1284 x 2778

The capture is only scaled (never stretched, never painted over), as App
Review requires screenshots to show the real app (Guideline 2.3.3).
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "docs" / "store" / "screenshots" / "raw"
OUT = ROOT / "docs" / "store" / "screenshots" / "out"

SIZES = {"6.9in": (1320, 2868), "6.5in": (1284, 2778)}

BACKGROUND = (12, 11, 10)  # Theme.bg #0C0B0A
GLOW = (90, 52, 30)  # warm studio light behind the phone
TEXT = (243, 239, 232)  # Theme.text #F3EFE8
MUTED = (156, 149, 139)  # Theme.muted #9C958B
ACCENT = (255, 91, 46)  # Theme.accent #FF5B2E

FONT_DIR = Path("C:/Windows/Fonts")
BOLD = [FONT_DIR / "segoeuib.ttf", Path("/System/Library/Fonts/SFNS.ttf")]
SEMIBOLD = [FONT_DIR / "seguisb.ttf", FONT_DIR / "segoeui.ttf"]

# Captions from docs/store/screenshots.md (line 1 / line 2). "Pro" marks Pro-only shots.
CAPTIONS = {
    "tr": {
        1: ("Tek fotoğraftan reklam videosu", "Saniyeler içinde, telefonunda"),
        2: ("Arka plan otomatik silinir", "Ürünün olduğu gibi kalır"),
        3: ("Satıcılar için hazır şablonlar", "Vitrin, Kampanya, Mağaza ve fazlası"),
        4: ("İndirim, fiyat ve çağrı tek dokunuşta", "Pro ile filigransız 1080p"),
        5: ("Yapay zekâ metin önerir", "Apple Intelligence ile, telefonunda · Pro"),
        6: ("Kurgu masası ve otomatik altyazı", "9 altyazı stili, Türkçe ve İngilizce"),
        7: ("Hesap yok, yükleme yok", "Fotoğrafların telefonunda kalır"),
    },
    "en": {
        1: ("One photo, one ad video", "In seconds, on your phone"),
        2: ("Background removed automatically", "Your product stays exactly as shot"),
        3: ("Templates made for sellers", "Showcase, Campaign, Store and more"),
        4: ("Discount, price and call to action", "Watermark-free 1080p with Pro"),
        5: ("AI writes your copy", "With Apple Intelligence, on device · Pro"),
        6: ("Editing desk with auto captions", "9 caption styles, Turkish and English"),
        7: ("No account, no uploads", "Your photos stay on your phone"),
    },
}


def font(candidates: list[Path], size: int) -> ImageFont.FreeTypeFont:
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    sys.exit("No suitable font found; install Segoe UI or edit BOLD/SEMIBOLD.")


def wrap(draw: ImageDraw.ImageDraw, text: str, face, width: int) -> list[str]:
    words, lines, line = text.split(), [], ""
    for word in words:
        trial = (line + " " + word).strip()
        if draw.textlength(trial, font=face) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def background(size: tuple[int, int]) -> Image.Image:
    w, h = size
    canvas = Image.new("RGB", size, BACKGROUND)
    glow = Image.new("RGB", size, BACKGROUND)
    d = ImageDraw.Draw(glow)
    d.ellipse((-w * 0.3, h * 0.25, w * 1.3, h * 1.1), fill=GLOW)
    glow = glow.filter(ImageFilter.GaussianBlur(w * 0.25))
    return Image.blend(canvas, glow, 0.55)


def compose(capture: Image.Image, caption: tuple[str, str], size: tuple[int, int]) -> Image.Image:
    w, h = size
    canvas = background(size)
    draw = ImageDraw.Draw(canvas)
    scale = w / 1320

    title_face = font(BOLD, round(92 * scale))
    sub_face = font(SEMIBOLD, round(50 * scale))
    margin = round(90 * scale)
    y = round(150 * scale)
    for line in wrap(draw, caption[0], title_face, w - 2 * margin)[:2]:
        lw = draw.textlength(line, font=title_face)
        draw.text(((w - lw) / 2, y), line, font=title_face, fill=TEXT)
        y += round(112 * scale)
    y += round(18 * scale)
    sub = caption[1]
    pro = sub.endswith("· Pro")
    for line in wrap(draw, sub, sub_face, w - 2 * margin)[:2]:
        lw = draw.textlength(line, font=sub_face)
        draw.text(((w - lw) / 2, y), line, font=sub_face, fill=ACCENT if pro else MUTED)
        y += round(64 * scale)

    # The capture: scaled only, keeping its aspect ratio.
    top = max(y + round(70 * scale), round(h * 0.22))
    max_w, max_h = round(w * 0.82), h - top - round(90 * scale)
    ratio = min(max_w / capture.width, max_h / capture.height)
    shot = capture.convert("RGB").resize(
        (round(capture.width * ratio), round(capture.height * ratio)), Image.LANCZOS
    )
    radius = round(60 * scale)
    mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *shot.size), radius, fill=255)
    x = (w - shot.width) // 2

    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (x, top + round(24 * scale), x + shot.width, top + round(24 * scale) + shot.height),
        radius,
        fill=(0, 0, 0, 170),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(round(40 * scale)))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB")
    canvas.paste(shot, (x, top), mask)
    # Hairline edge so a dark capture does not melt into the background.
    ImageDraw.Draw(canvas).rounded_rectangle(
        (x, top, x + shot.width - 1, top + shot.height - 1), radius, outline=(52, 48, 44), width=2
    )
    return canvas


def main() -> None:
    found = 0
    for lang, captions in CAPTIONS.items():
        for n, caption in captions.items():
            source = next(
                (p for ext in ("png", "PNG", "jpg", "jpeg", "JPG") if (p := RAW / lang / f"{n}.{ext}").exists()),
                None,
            )
            if not source:
                continue
            capture = Image.open(source)
            if capture.width > capture.height:
                sys.exit(f"{source} is landscape; capture in portrait.")
            for name, size in SIZES.items():
                target = OUT / lang / name / f"{n}.png"
                target.parent.mkdir(parents=True, exist_ok=True)
                image = compose(capture, caption, size)
                assert image.size == size and image.mode == "RGB"
                image.save(target, "PNG", optimize=True)
                found += 1
                print(f"{target.relative_to(ROOT)}  {size[0]}x{size[1]}")
    if not found:
        sys.exit(f"No captures found. Put them in {RAW}/tr and {RAW}/en as 1.png ... 7.png.")


if __name__ == "__main__":
    main()
