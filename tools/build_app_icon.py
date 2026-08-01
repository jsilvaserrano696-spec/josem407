from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "assets" / "icons"
CANVAS = 1024


def diamond(cx, cy, radius):
    return [
        (cx, cy - radius),
        (cx + radius, cy),
        (cx, cy + radius),
        (cx - radius, cy),
    ]


def build_icon():
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))

    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((82, 96, 942, 956), radius=210, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(42))
    image.alpha_composite(shadow)

    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((72, 64, 952, 944), radius=210, fill="#14161A")
    draw.rounded_rectangle((91, 83, 933, 925), radius=191, outline="#2D323B", width=20)

    # AXION's gold accent frames the same white diamond used in the application header.
    draw.polygon(diamond(512, 504, 290), fill="#F2B807")
    draw.polygon(diamond(512, 504, 202), fill="#14161A")
    draw.polygon(diamond(512, 504, 116), fill="#EEF0F3")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT_DIR / "icon.png", optimize=True)
    image.save(
        OUTPUT_DIR / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    build_icon()
    print(OUTPUT_DIR / "icon.ico")
