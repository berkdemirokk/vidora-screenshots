#!/usr/bin/env python3
"""Compose App Store screenshots from the six raw simulator shots of one locale.

Usage:  python tools/compose_store_screens.py <raw_dir> <locale> <out_dir>

  raw_dir  folder with 01-home.png ... 06-library.png (any PNG whose name starts with 01..06)
  locale   tr or en
  out_dir  output folder; writes six 1320x2868 RGB PNGs (no alpha), same file names

Look: white paper, Anton uppercase headline in ink #141210 with one key word on an orange
#FF7A00 block, one Manrope sub-caption line, and the raw shot below in a rounded device-like
frame with a soft shadow. Raw shots of another size are scaled to fit. Needs Pillow only.
"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1320, 2868
PAPER = (255, 255, 255)
INK = (0x14, 0x12, 0x10)
ORANGE = (0xFF, 0x7A, 0x00)

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "..", "apps", "mobile", "modules", "karevia-editor", "ios", "fonts")
ANTON = os.path.join(FONT_DIR, "Anton_400Regular.ttf")
MANROPE = os.path.join(FONT_DIR, "Manrope_700Bold.ttf")

# Headlines are written already in capitals (Python's upper() turns Turkish i into I, not İ).
# (headline lines as word lists, index of the highlighted word as (line, word), sub-caption)
CAPTIONS = {
    "tr": [
        ("BİR FOTOĞRAF. BİR REKLAM.", "REKLAM.", "Ürün fotoğrafından reklam videosu"),
        ("ÜRÜNÜNÜ ÇEK", "ÜRÜNÜNÜ", "Kitaplıktan seç ya da kamerayla çek"),
        ("ADINI, FİYATINI YAZ", "FİYATINI", "Ad, fiyat, etiket ve buton yazısı"),
        ("STÜDYO ZEMİNİ SEÇ", "ZEMİNİ", "Hazır stüdyo zeminleri, canlı önizleme"),
        ("VİDEON HAZIR", "HAZIR", "9:16 video, Fotoğraflar'a kaydetmeye hazır"),
        ("HEPSİ TELEFONUNDA", "TELEFONUNDA", "Videoların Kitaplık'ta, bir dokunuşla"),
    ],
    "en": [
        ("ONE PHOTO. ONE AD.", "AD.", "A product ad video from one photo"),
        ("SHOOT YOUR PRODUCT", "PRODUCT", "Pick from your library or use the camera"),
        ("ADD NAME AND PRICE", "PRICE", "Name, price, label and button text"),
        ("PICK A STUDIO BACKDROP", "BACKDROP", "Ready-made studio backdrops, live preview"),
        ("YOUR AD IS READY", "READY", "A 9:16 video, ready to save to Photos"),
        ("ALL ON YOUR PHONE", "PHONE", "Your videos wait in the Library"),
    ],
}

MARGIN = 90  # side margin for text
TOP = 130  # top of the headline block (cap top of the first line)
MAX_HEAD = 200  # max Anton size in px
MAX_LINE_W = W - 2 * MARGIN
PAD_X, PAD_Y = 26, 20  # orange block padding around the key word
LINE_GAP = 46  # space between the headline lines (between block edges)


def font(path, size):
    return ImageFont.truetype(path, size)


def wrap(words, fnt, space, max_w):
    """Greedy wrap into lines; returns lines (lists of word indexes) or None when > 2 lines."""
    lines, cur, cur_w = [], [], 0
    for i, w in enumerate(words):
        ww = fnt.getlength(w)
        add = ww if not cur else space + ww
        if cur and cur_w + add > max_w:
            lines.append(cur)
            cur, cur_w = [i], ww
        else:
            cur.append(i)
            cur_w += add
    if cur:
        lines.append(cur)
    return lines


def fit_headline(text, key):
    """Largest Anton size (<= MAX_HEAD) where the headline fits in <= 2 lines of MAX_LINE_W."""
    words = text.split(" ")
    for size in range(MAX_HEAD, 60, -4):
        fnt = font(ANTON, size)
        space = fnt.getlength(" ") + 2
        # A highlighted word carries extra block padding on both sides.
        lines = wrap(words, fnt, space, MAX_LINE_W - 2 * PAD_X)
        if len(lines) > 2:
            continue
        ok = True
        for line in lines:
            total = sum(fnt.getlength(words[i]) for i in line) + space * (len(line) - 1)
            if any(words[i] == key for i in line):
                total += 2 * PAD_X
            if total > MAX_LINE_W:
                ok = False
        if ok:
            return fnt, words, lines, space
    raise ValueError("headline does not fit: " + text)


def draw_headline(img, text, key):
    d = ImageDraw.Draw(img)
    fnt, words, lines, space = fit_headline(text, key)
    cap = fnt.getbbox("H")  # (x0, top, x1, bottom) relative to the ascender origin
    cap_h = cap[3] - cap[1]
    y = TOP
    for line in lines:
        total = sum(fnt.getlength(words[i]) for i in line) + space * (len(line) - 1)
        has_key = any(words[i] == key for i in line)
        if has_key:
            total += 2 * PAD_X
        x = MARGIN
        base = y + cap_h  # baseline y
        for n, i in enumerate(line):
            w = words[i]
            ww = fnt.getlength(w)
            if w == key:
                d.rectangle(
                    [x, y - PAD_Y, x + ww + 2 * PAD_X, base + PAD_Y],
                    fill=ORANGE,
                )
                d.text((x + PAD_X, base), w, font=fnt, fill=INK, anchor="ls")
                x += ww + 2 * PAD_X
            else:
                d.text((x, base), w, font=fnt, fill=INK, anchor="ls")
                x += ww
            x += space
        y = base + PAD_Y + LINE_GAP + PAD_Y
    return y - LINE_GAP - PAD_Y  # bottom of the last block


def draw_sub(img, text, y):
    d = ImageDraw.Draw(img)
    for size in range(60, 30, -2):
        fnt = font(MANROPE, size)
        if fnt.getlength(text) <= MAX_LINE_W:
            break
    d.text((MARGIN, y), text, font=fnt, fill=INK, anchor="la")
    return y + size


def rounded_mask(size, radius, scale=3):
    w, h = size
    m = Image.new("L", (w * scale, h * scale), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w * scale - 1, h * scale - 1], radius * scale, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def place_shot(img, shot, top):
    """Put the screenshot in a rounded device-like frame (ink bezel) with a soft shadow."""
    bezel = 16
    bottom_margin = 90
    avail_h = H - top - bottom_margin
    # Frame outer size keeps the raw aspect (shot + bezel on each side).
    sw, sh = shot.size
    inner_h = avail_h - 2 * bezel
    inner_w = round(inner_h * sw / sh)
    if inner_w + 2 * bezel > W - 2 * MARGIN:
        inner_w = W - 2 * MARGIN - 2 * bezel
        inner_h = round(inner_w * sh / sw)
    shot = shot.resize((inner_w, inner_h), Image.LANCZOS)
    fw, fh = inner_w + 2 * bezel, inner_h + 2 * bezel
    fx = (W - fw) // 2
    fy = top + (avail_h - fh) // 2
    outer_r = round(fw * 0.115)
    inner_r = outer_r - bezel

    # Soft shadow.
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [fx + 6, fy + 34, fx + fw - 6, fy + fh + 26], outer_r, fill=(20, 18, 16, 80)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(38))
    base = img.convert("RGBA")
    base.alpha_composite(shadow)

    # Frame, then the screenshot with rounded corners.
    frame = Image.new("RGBA", (fw, fh), INK + (255,))
    base.paste(frame, (fx, fy), rounded_mask((fw, fh), outer_r))
    base.paste(shot.convert("RGBA"), (fx + bezel, fy + bezel), rounded_mask((inner_w, inner_h), inner_r))
    return base.convert("RGB")


def find_raws(raw_dir):
    files = {}
    for n in range(1, 7):
        found = sorted(glob.glob(os.path.join(raw_dir, "%02d-*.png" % n)))
        if not found:
            raise SystemExit("missing raw shot %02d-*.png in %s" % (n, raw_dir))
        files[n] = found[0]
    return files


def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    raw_dir, locale, out_dir = sys.argv[1:]
    if locale not in CAPTIONS:
        raise SystemExit("locale must be tr or en")
    os.makedirs(out_dir, exist_ok=True)
    raws = find_raws(raw_dir)
    for n in range(1, 7):
        text, key, sub = CAPTIONS[locale][n - 1]
        img = Image.new("RGB", (W, H), PAPER)
        bottom = draw_headline(img, text, key)
        sub_bottom = draw_sub(img, sub, bottom + PAD_Y + 44)
        shot = Image.open(raws[n]).convert("RGB")
        out = place_shot(img, shot, sub_bottom + 70)
        assert out.size == (W, H) and out.mode == "RGB"
        name = os.path.splitext(os.path.basename(raws[n]))[0] + ".png"
        out.save(os.path.join(out_dir, name), "PNG", optimize=True)
        print("wrote", os.path.join(out_dir, name))


if __name__ == "__main__":
    main()
