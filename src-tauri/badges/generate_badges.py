from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os

SIZE = 128
SS = 8
CANVAS = SIZE * SS
FILL = (232, 33, 61, 255)
RING = (255, 255, 255, 255)
SHADOW = (0, 0, 0, 110)
TEXT = (255, 255, 255, 255)
FONT_PATH = "C:/Windows/Fonts/segoeuib.ttf"

HEIGHT_PX = 62.0
MARGIN_PX = 1.0
RING_PX = 3.5
SHADOW_BLUR_PX = 2.5
SHADOW_OFFSET_PX = 1.5


def label_for(count):
    if count > 99:
        return "99+"
    return str(count)


def fitted_font(draw, label, inner_w, inner_h):
    target_w = inner_w * 0.78
    target_h = inner_h * 0.56
    lo, hi = 8, CANVAS
    best = None
    while lo <= hi:
        mid = (lo + hi) // 2
        font = ImageFont.truetype(FONT_PATH, mid)
        box = draw.textbbox((0, 0), "0", font=font)
        digit_h = box[3] - box[1]
        box = draw.textbbox((0, 0), label, font=font)
        w = box[2] - box[0]
        if w <= target_w and digit_h <= target_h:
            best = (font, box)
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def pill_width(label):
    extra = {1: 0.0, 2: 0.32, 3: 0.72}[len(label)]
    return HEIGHT_PX * (1.0 + extra)


def render(count):
    label = label_for(count)
    height = HEIGHT_PX * SS
    width = pill_width(label) * SS
    right = CANVAS - 1 - MARGIN_PX * SS
    bottom = right
    left = right - width
    top = bottom - height
    radius = height / 2

    shadow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    off = SHADOW_OFFSET_PX * SS
    sd.rounded_rectangle([left, top + off, right, bottom + off], radius=radius, fill=SHADOW)
    shadow = shadow.filter(ImageFilter.GaussianBlur(SHADOW_BLUR_PX * SS))

    im = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([left, top, right, bottom], radius=radius, fill=RING)
    ring = RING_PX * SS
    d.rounded_rectangle([left + ring, top + ring, right - ring, bottom - ring], radius=radius - ring, fill=FILL)

    font, box = fitted_font(d, label, width - 2 * ring, height - 2 * ring)
    w = box[2] - box[0]
    digit_box = d.textbbox((0, 0), "0", font=font)
    h = digit_box[3] - digit_box[1]
    x = (left + right - w) / 2 - box[0]
    y = (top + bottom - h) / 2 - digit_box[1]
    d.text((x, y), label, font=font, fill=TEXT)

    out = Image.alpha_composite(shadow, im)
    return out.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    for count in range(1, 101):
        render(count).save(os.path.join(here, "b%d.png" % count), optimize=True)


if __name__ == "__main__":
    main()
