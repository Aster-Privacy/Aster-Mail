from PIL import Image, ImageDraw, ImageFont
import os

SIZE = 32
SS = 16
CANVAS = SIZE * SS
FILL = (225, 29, 72, 255)
RING = (10, 10, 14, 235)
TEXT = (255, 255, 255, 255)
FONT_PATH = "C:/Windows/Fonts/segoeuib.ttf"

RING_PX = 1.35
INSET_PX = 0.35


def label_for(count):
    if count > 99:
        return "99+"
    return str(count)


def fitted_font(draw, label):
    target_w = {1: 17.5, 2: 22.0, 3: 25.0}[len(label)]
    target_h = {1: 19.0, 2: 17.0, 3: 14.0}[len(label)]
    size = SIZE * SS
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
    outer = INSET_PX * SS
    d.ellipse([outer, outer, CANVAS - 1 - outer, CANVAS - 1 - outer], fill=RING)
    inner = outer + RING_PX * SS
    d.ellipse([inner, inner, CANVAS - 1 - inner, CANVAS - 1 - inner], fill=FILL)

    label = label_for(count)
    font, box = fitted_font(d, label)
    w = box[2] - box[0]
    h = box[3] - box[1]
    x = (CANVAS - w) / 2 - box[0]
    y = (CANVAS - h) / 2 - box[1]
    d.text((x, y), label, font=font, fill=TEXT)

    return im.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    for count in range(1, 101):
        render(count).save(os.path.join(here, "b%d.png" % count), optimize=True)


if __name__ == "__main__":
    main()
