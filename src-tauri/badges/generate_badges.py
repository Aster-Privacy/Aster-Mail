from PIL import Image, ImageDraw, ImageFont
import os

SIZE = 32
SS = 16
CANVAS = SIZE * SS
FILL = (225, 29, 72, 255)
RING = (10, 10, 14, 235)
TEXT = (255, 255, 255, 255)
FONT_PATH = "C:/Windows/Fonts/segoeuib.ttf"

DIAM_PX = 22.0
MARGIN_PX = 0.5
RING_PX = 1.1
SCALE = DIAM_PX / SIZE


def label_for(count):
    if count > 99:
        return "99+"
    return str(count)


def fitted_font(draw, label):
    target_w = {1: 17.5, 2: 22.0, 3: 27.5}[len(label)] * SCALE
    target_h = {1: 19.0, 2: 17.0, 3: 15.5}[len(label)] * SCALE
    lo, hi = 8, CANVAS
    best = None
    while lo <= hi:
        mid = (lo + hi) // 2
        font = ImageFont.truetype(FONT_PATH, mid)
        box = draw.textbbox((0, 0), label, font=font)
        w = box[2] - box[0]
        h = box[3] - box[1]
        if w <= target_w * SS and h <= target_h * SS:
            best = (font, box)
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def render(count):
    im = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    right = CANVAS - 1 - MARGIN_PX * SS
    bottom = right
    left = right - DIAM_PX * SS
    top = bottom - DIAM_PX * SS
    d.ellipse([left, top, right, bottom], fill=RING)
    ring = RING_PX * SS
    d.ellipse([left + ring, top + ring, right - ring, bottom - ring], fill=FILL)

    label = label_for(count)
    font, box = fitted_font(d, label)
    w = box[2] - box[0]
    h = box[3] - box[1]
    x = (left + right - w) / 2 - box[0]
    y = (top + bottom - h) / 2 - box[1]
    d.text((x, y), label, font=font, fill=TEXT)

    return im.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    for count in range(1, 101):
        render(count).save(os.path.join(here, "b%d.png" % count), optimize=True)


if __name__ == "__main__":
    main()
