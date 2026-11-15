#!/usr/bin/env python3
"""Rasterize recorded xterm cells; no text/layout is inferred or added.

Optional preview utility (Pillow and Linux fonts required), outside CI tests:
  python3 integration-tests/interactive/fixtures/render-tui-cells.py EVIDENCE_DIR
The default xterm theme used for unspecified colors is white on black.
"""
import json
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

CELL_WIDTH, CELL_HEIGHT, PADDING = 12, 26, 20
DEFAULT_FOREGROUND, DEFAULT_BACKGROUND = (255, 255, 255), (0, 0, 0)
PALETTE = [
    (0, 0, 0), (205, 0, 0), (0, 205, 0), (205, 205, 0),
    (0, 0, 238), (205, 0, 205), (0, 205, 205), (229, 229, 229),
    (127, 127, 127), (255, 0, 0), (0, 255, 0), (255, 255, 0),
    (92, 92, 255), (255, 0, 255), (0, 255, 255), (255, 255, 255),
]
MONO = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 20)
CJK = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 20)
SYMBOLS = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSansSymbols2-Regular.ttf', 20)


def resolve_color(value, rgb, default):
    if value < 0:
        return default
    if rgb:
        return ((value >> 16) & 255, (value >> 8) & 255, value & 255)
    if value < 16:
        return PALETTE[value]
    if value < 232:
        index = value - 16
        scale = [0, 95, 135, 175, 215, 255]
        return (scale[index // 36], scale[(index // 6) % 6], scale[index % 6])
    return (8 + (value - 232) * 10,) * 3


def render(source, destination):
    rows = json.loads(source.read_text())
    columns = max(len(row['cells']) for row in rows)
    image = Image.new('RGB', (columns * CELL_WIDTH + PADDING * 2,
                             len(rows) * CELL_HEIGHT + PADDING * 2), DEFAULT_BACKGROUND)
    draw = ImageDraw.Draw(image)
    for row_index, row in enumerate(rows):
        for column, cell in enumerate(row['cells']):
            if not cell:
                continue
            x, y = PADDING + column * CELL_WIDTH, PADDING + row_index * CELL_HEIGHT
            background = resolve_color(cell.get('bg', -1), cell.get('bgRgb', False), DEFAULT_BACKGROUND)
            draw.rectangle((x, y, x + CELL_WIDTH - 1, y + CELL_HEIGHT - 1), fill=background)
    for row_index, row in enumerate(rows):
        for column, cell in enumerate(row['cells']):
            if not cell or not cell['text']:
                continue
            text = cell['text']
            foreground = resolve_color(cell['fg'], cell['rgb'], DEFAULT_FOREGROUND)
            if cell['dim']:
                foreground = tuple(int(channel * 0.65) for channel in foreground)
            font = CJK if any(0x2e80 <= ord(character) < 0xffff for character in text) else MONO
            if text in ['⏸', '⏵', '⏹']:
                font = SYMBOLS
            draw.text((PADDING + column * CELL_WIDTH, PADDING + row_index * CELL_HEIGHT + 20),
                      text, font=font, fill=foreground, anchor='ls')
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination)


if __name__ == '__main__':
    evidence = Path(sys.argv[1])
    target = Path(__file__).resolve().parents[3] / 'docs/images'
    for width in [80, 40]:
        render(evidence / f'representative-{width}x30-cells.json',
               target / f'bald-puppy-terminal-{width}.png')
