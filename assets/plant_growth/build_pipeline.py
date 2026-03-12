from pathlib import Path
import json
import math
from PIL import Image
import numpy as np

input_dir = Path(r"C:\Users\Marco\.openclaw\workspace\Runway Assets\Plant_png")
output_root = Path(r"C:\Users\Marco\.openclaw\workspace\assets\plant_growth")
aligned_dir = output_root / "aligned_frames"
output_root.mkdir(parents=True, exist_ok=True)
aligned_dir.mkdir(parents=True, exist_ok=True)

CANVAS_W = 2048
CANVAS_H = 2048
COLUMNS = 8

files = sorted(input_dir.glob("plant_*.png"), key=lambda p: int(p.stem.split('_')[1]))
if not files:
    raise SystemExit("No plant_*.png files found.")

frames = []
for idx, fp in enumerate(files, start=1):
    img = Image.open(fp).convert("RGBA")
    arr = np.array(img)
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        raise ValueError(f"Frame has no opaque pixels: {fp.name}")
    x_min, x_max = int(xs.min()), int(xs.max())
    y_min, y_max = int(ys.min()), int(ys.max())
    baseline_local = y_max
    center_local = (x_min + x_max) / 2.0
    frames.append({"idx": idx, "path": fp, "img": img, "w": img.width, "h": img.height, "baseline_local": baseline_local, "center_local": center_local})

lower_bound = max(f["baseline_local"] for f in frames)
upper_bound = min(CANVAS_H - f["h"] + f["baseline_local"] for f in frames)
if lower_bound > upper_bound:
    raise ValueError(f"Cannot place all frames on {CANVAS_W}x{CANVAS_H} canvas without cropping. baseline bounds invalid: {lower_bound}..{upper_bound}")

baseline_target = int(math.floor(upper_bound))
center_target = CANVAS_W / 2.0

aligned_paths = []
for f in frames:
    x_off = int(round(center_target - f["center_local"]))
    y_off = int(round(baseline_target - f["baseline_local"]))
    if x_off < 0 or y_off < 0 or x_off + f["w"] > CANVAS_W or y_off + f["h"] > CANVAS_H:
        raise ValueError(f"Frame {f['path'].name} out of canvas with offsets x={x_off}, y={y_off}.")
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    canvas.alpha_composite(f["img"], (x_off, y_off))
    out_path = aligned_dir / f"frame_{f['idx']:03d}.png"
    canvas.save(out_path)
    aligned_paths.append(out_path)

n = len(aligned_paths)
rows = math.ceil(n / COLUMNS)
sprite = Image.new("RGBA", (COLUMNS * CANVAS_W, rows * CANVAS_H), (0, 0, 0, 0))
for i, ap in enumerate(aligned_paths):
    r = i // COLUMNS
    c = i % COLUMNS
    frame_img = Image.open(ap).convert("RGBA")
    sprite.alpha_composite(frame_img, (c * CANVAS_W, r * CANVAS_H))

sprite_path = output_root / "plant_growth_sprite.png"
sprite.save(sprite_path)

def stage_for(frame_num: int) -> str:
    if 1 <= frame_num <= 3: return "seed"
    if 4 <= frame_num <= 7: return "sprout"
    if 8 <= frame_num <= 10: return "seedling"
    if 11 <= frame_num <= 27: return "vegetative"
    if 28 <= frame_num <= 31: return "preflower"
    if 32 <= frame_num <= 38: return "flowering"
    if 39 <= frame_num <= 43: return "late_flowering"
    if 44 <= frame_num <= 46: return "harvest"
    return "unknown"

metadata = {
    "frameWidth": CANVAS_W,
    "frameHeight": CANVAS_H,
    "columns": COLUMNS,
    "rows": rows,
    "frameCount": n,
    "frames": [{"frame": i, "stage": stage_for(i)} for i in range(1, n + 1)]
}

meta_path = output_root / "plant_growth_metadata.json"
meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

print(f"Done. Frames: {n}")
print(f"Baseline target y: {baseline_target}")
