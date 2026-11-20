"""Draws the bundled sample product photo (an unbranded amber perfume bottle
on a plain table) used by the "Try a sample product" button.

    python tools/make_sample_product.py

Writes apps/mobile/assets/sample-product.jpg (1500 x 2000). Everything is
drawn here, so the image carries no third-party rights.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

W, H = 1500, 2000
OUT = Path(__file__).resolve().parent.parent / "apps" / "mobile" / "assets" / "sample-product.jpg"


def vertical_gradient(size, top, bottom):
    w, h = size
    base = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        base.putpixel((0, y), tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return base.resize(size)


def horizontal_profile(size, colors):
    """Left-to-right shading across the bottle to suggest a cylinder."""
    w, h = size
    row = Image.new("RGB", (w, 1))
    n = len(colors) - 1
    for x in range(w):
        t = x / max(1, w - 1) * n
        i = min(int(t), n - 1)
        f = t - i
        a, b = colors[i], colors[i + 1]
        row.putpixel((x, 0), tuple(round(a[k] + (b[k] - a[k]) * f) for k in range(3)))
    return row.resize(size)


def main():
    img = Image.new("RGB", (W, H))
    horizon = int(H * 0.68)
    img.paste(vertical_gradient((W, horizon), (238, 233, 224), (226, 219, 207)), (0, 0))
    img.paste(vertical_gradient((W, H - horizon), (214, 201, 182), (196, 182, 160)), (0, horizon))

    # Soft window light from the upper left.
    light = Image.new("L", (W, H), 0)
    ImageDraw.Draw(light).ellipse((-W * 0.4, -H * 0.3, W * 0.8, H * 0.6), fill=60)
    light = light.filter(ImageFilter.GaussianBlur(220))
    img = Image.composite(Image.new("RGB", (W, H), (255, 252, 246)), img, light)

    bw, bh = 520, 760
    bx, by = (W - bw) // 2, horizon - bh + 40
    cap_w, cap_h = 250, 230
    cx, cy = (W - cap_w) // 2, by - cap_h + 30

    # Contact shadow and a long soft shadow to the right.
    shadow = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(shadow)
    sd.ellipse((bx - 40, horizon + 10, bx + bw + 40, horizon + 90), fill=150)
    sd.polygon([(bx + bw - 40, horizon + 50), (bx + bw + 420, horizon + 140), (bx + bw + 380, horizon + 210), (bx + 60, horizon + 80)], fill=70)
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    img = Image.composite(Image.new("RGB", (W, H), (120, 100, 78)), img, shadow)

    # Glass body: amber with cylinder shading.
    body = horizontal_profile(
        (bw, bh),
        [(92, 44, 12), (168, 92, 30), (205, 128, 52), (176, 98, 34), (120, 60, 18), (70, 32, 9)],
    )
    mask = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, bw - 1, bh - 1), 46, fill=255)
    # Liquid line: the top 12% of the bottle is empty glass (lighter, less saturated).
    empty = horizontal_profile((bw, int(bh * 0.12)), [(150, 110, 70), (214, 176, 128), (170, 128, 84)])
    body.paste(empty, (0, 0))
    hl = Image.new("L", (bw, bh), 0)
    hd = ImageDraw.Draw(hl)
    hd.rounded_rectangle((70, 40, 120, bh - 60), 25, fill=150)
    hd.rounded_rectangle((bw - 115, 60, bw - 95, bh - 90), 10, fill=70)
    hl = hl.filter(ImageFilter.GaussianBlur(14))
    body = Image.composite(Image.new("RGB", (bw, bh), (255, 236, 205)), body, hl)
    # Thick glass base.
    base = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(base).rounded_rectangle((8, bh - 90, bw - 8, bh - 8), 40, fill=110)
    base = base.filter(ImageFilter.GaussianBlur(6))
    body = Image.composite(Image.new("RGB", (bw, bh), (232, 170, 96)), body, base)
    img.paste(body, (bx, by), mask)

    # Black cap with a soft satin highlight.
    cap = horizontal_profile((cap_w, cap_h), [(18, 18, 18), (40, 40, 42), (78, 78, 82), (36, 36, 38), (12, 12, 12)])
    cmask = Image.new("L", (cap_w, cap_h), 0)
    ImageDraw.Draw(cmask).rounded_rectangle((0, 0, cap_w - 1, cap_h - 1), 16, fill=255)
    img.paste(cap, (cx, cy), cmask)

    # Faint reflection on the table.
    refl = body.transpose(Image.FLIP_TOP_BOTTOM).crop((0, 0, bw, 160))
    fade = Image.linear_gradient("L").resize((bw, 160)).point(lambda v: int((255 - v) * 0.18))
    rmask = ImageChops.multiply(fade, mask.transpose(Image.FLIP_TOP_BOTTOM).crop((0, 0, bw, 160)))
    img.paste(refl, (bx, by + bh), rmask)

    # Photo grain so it reads like a phone photo, not a flat render.
    noise = Image.effect_noise((W, H), 10).convert("RGB")
    img = Image.blend(img, ImageChops.add(img, noise, scale=2.0, offset=-40), 0.08)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "JPEG", quality=92)
    print(OUT, img.size)


if __name__ == "__main__":
    main()
