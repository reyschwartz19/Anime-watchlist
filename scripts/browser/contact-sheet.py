"""Make first-viewport inspection sheets from the saved route captures."""
from pathlib import Path
from PIL import Image, ImageDraw

folder = Path(__file__).resolve().parents[2] / 'docs/design/evidence/manga-shelf'
names = ['sign-in', 'verification', 'favorites', 'discover', 'my-list', 'search', 'details', 'profile']
for view in ['phone', 'desktop', 'compact']:
    tile_width, tile_height = (390, 900) if view == 'phone' else (480, 370)
    canvas = Image.new('RGB', (tile_width * 4, tile_height * 2), '#ffffff')
    draw = ImageDraw.Draw(canvas)
    for index, name in enumerate(names):
        path = folder / f'{name}-{view}-viewport.png'
        if not path.exists():
            path = folder / f'{name}-{view}.png'
        artwork = Image.open(path).convert('RGB')
        artwork.thumbnail((tile_width - 12, tile_height - 30))
        x, y = (index % 4) * tile_width, (index // 4) * tile_height
        canvas.paste(artwork, (x + 6, y + 24))
        draw.text((x + 8, y + 6), f'{name} — {view}', fill='#0f0f0b')
    canvas.save(folder / f'contact-{view}.jpg', quality=90)
