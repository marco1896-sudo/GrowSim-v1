#!/usr/bin/env python3
"""GrowSim transparent frame alignment pipeline.

Usage:
  python assets/plant_growth/build_pipeline.py
  python assets/plant_growth/build_pipeline.py assets/Plant_png
"""

from __future__ import annotations

import json
import math
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import cv2
import imageio.v2 as imageio
import numpy as np
from PIL import Image


DEFAULT_INPUT = Path("assets/Plant_png")
OUTPUT_ROOT = Path("assets/plant_growth")
ALIGNED_DIR = OUTPUT_ROOT / "aligned_frames"
SPRITE_PATH = OUTPUT_ROOT / "plant_growth_sprite.png"
META_PATH = OUTPUT_ROOT / "plant_growth_metadata.json"
REPORT_PATH = OUTPUT_ROOT / "plant_growth_report.txt"
GIF_PATH = OUTPUT_ROOT / "plant_growth_preview.gif"
MP4_PATH = OUTPUT_ROOT / "plant_growth_preview.mp4"

COLS = 8
PREFERRED_CANVAS = 2048


@dataclass
class PotDetection:
    width: float
    center_x: float
    top_rim_y: float
    bottom_center_x: float
    bottom_center_y: float
    method: str


@dataclass
class FrameInfo:
    idx: int
    src_path: Path
    image_rgba: np.ndarray
    orig_h: int
    orig_w: int
    detection: PotDetection
    scale: float
    scaled_rgba: np.ndarray
    scaled_h: int
    scaled_w: int
    scaled_center_x: float
    scaled_top_rim_y: float
    scaled_bottom_center_x: float
    scaled_bottom_center_y: float
    corrected_center_x: float
    corrected_top_rim_y: float
    corrected_bottom_center_x: float
    corrected_bottom_center_y: float
    output_name: str
    stage: str


def stage_for_frame(frame_idx_1_based: int) -> str:
    ranges = [
        (1, 3, "seed"),
        (4, 7, "sprout"),
        (8, 10, "seedling"),
        (11, 27, "vegetative"),
        (28, 31, "preflower"),
        (32, 38, "flowering"),
        (39, 43, "late_flowering"),
        (44, 46, "harvest"),
    ]
    for lo, hi, label in ranges:
        if lo <= frame_idx_1_based <= hi:
            return label
    return "unknown"


def load_ordered_frames(input_dir: Path) -> List[Path]:
    # Preserve sorted frame order by filename.
    return sorted(
        [p for p in input_dir.iterdir() if p.is_file() and p.suffix.lower() == ".png"],
        key=lambda p: p.name,
    )


def detect_largest_component(alpha_mask: np.ndarray, lower_fraction: float, min_area: int) -> Optional[Tuple[np.ndarray, str]]:
    h, w = alpha_mask.shape
    lower_fraction = float(np.clip(lower_fraction, 0.05, 1.0))
    lower_start = int(round(h * (1.0 - lower_fraction)))
    lower_start = max(0, min(h - 1, lower_start))

    lower_mask = np.zeros_like(alpha_mask, dtype=np.uint8)
    lower_mask[lower_start:, :] = alpha_mask[lower_start:, :]

    num_labels, labels, stats, _centroids = cv2.connectedComponentsWithStats(lower_mask, connectivity=8)
    best_label = 0
    best_area = 0
    for lbl in range(1, num_labels):
        area = int(stats[lbl, cv2.CC_STAT_AREA])
        if area < min_area:
            continue
        if area > best_area:
            best_area = area
            best_label = lbl

    if best_label <= 0:
        return None

    return (labels == best_label).astype(np.uint8), f"lower_{int(lower_fraction * 100)}_largest_component"


def component_row_spans(component_mask: np.ndarray) -> List[Tuple[int, int, int, float]]:
    ys, _xs = np.where(component_mask > 0)
    if ys.size == 0:
        return []
    y_min = int(ys.min())
    y_max = int(ys.max())
    spans: List[Tuple[int, int, int, float]] = []
    for y in range(y_min, y_max + 1):
        row_x = np.where(component_mask[y] > 0)[0]
        if row_x.size == 0:
            continue
        x0 = int(row_x.min())
        x1 = int(row_x.max())
        w = x1 - x0 + 1
        c = (x0 + x1) / 2.0
        spans.append((y, x0, x1, c))
    return spans


def detect_pot(alpha: np.ndarray, lower_fraction: float = 0.35) -> PotDetection:
    mask = (alpha > 0).astype(np.uint8)
    h, w = mask.shape
    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        raise ValueError("No opaque pixels found")

    min_area = max(48, int(0.0002 * h * w))
    detected = detect_largest_component(mask, lower_fraction=lower_fraction, min_area=min_area)
    if detected is None:
        raise ValueError(f"No valid connected component found in lower {int(lower_fraction * 100)}% region")

    pot_mask, base_method = detected
    ys2, xs2 = np.where(pot_mask > 0)
    if len(xs2) == 0:
        raise ValueError("Detected component is empty")

    spans = component_row_spans(pot_mask)
    if not spans:
        raise ValueError("No row spans in detected component")

    row_widths = np.array([s[2] - s[1] + 1 for s in spans], dtype=np.float32)
    row_centers = np.array([s[3] for s in spans], dtype=np.float32)
    row_ys = np.array([s[0] for s in spans], dtype=np.int32)

    bottom_count = min(12, len(spans))
    bottom_width_ref = float(np.median(row_widths[-bottom_count:]))
    stable_thresh = max(6.0, bottom_width_ref * 0.72)

    pot_band = []
    miss_streak = 0
    for y, x0, x1, c in reversed(spans):
        width = float(x1 - x0 + 1)
        if width >= stable_thresh:
            pot_band.append((y, x0, x1, c, width))
            miss_streak = 0
        elif pot_band:
            miss_streak += 1
            if miss_streak >= 3:
                break

    if not pot_band:
        pot_band = [(y, x0, x1, c, float(x1 - x0 + 1)) for (y, x0, x1, c) in spans]

    pot_band.sort(key=lambda t: t[0])
    band_ys = np.array([r[0] for r in pot_band], dtype=np.float32)
    band_centers = np.array([r[3] for r in pot_band], dtype=np.float32)
    band_widths = np.array([r[4] for r in pot_band], dtype=np.float32)

    pot_width = float(np.median(band_widths))
    center_x = float(np.median(band_centers))
    top_rim_y = float(np.min(band_ys))
    top_rows = band_ys <= (top_rim_y + 2.0)
    top_rim_center = float(np.median(band_centers[top_rows])) if np.any(top_rows) else center_x

    bottom_y = float(np.max(band_ys))
    bottom_rows = band_ys >= (bottom_y - 2.0)
    bottom_center_x = float(np.median(band_centers[bottom_rows])) if np.any(bottom_rows) else center_x

    center_x = float((center_x * 0.7) + (top_rim_center * 0.3))

    return PotDetection(
        width=pot_width,
        center_x=center_x,
        top_rim_y=top_rim_y,
        bottom_center_x=bottom_center_x,
        bottom_center_y=bottom_y,
        method=base_method,
    )


def resize_rgba(img: np.ndarray, scale: float) -> np.ndarray:
    h, w = img.shape[:2]
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    pil_img = Image.fromarray(img, mode="RGBA")
    pil_scaled = pil_img.resize((new_w, new_h), resample=Image.Resampling.LANCZOS)
    return np.array(pil_scaled, dtype=np.uint8)


def smooth_anchor_series(values: List[float], threshold_px: float = 1.5) -> Tuple[List[float], bool]:
    if not values:
        return values, False
    corrected = list(values)
    changed = False

    for i in range(len(corrected)):
        lo = max(0, i - 1)
        hi = min(len(corrected), i + 2)
        local_med = float(np.median(corrected[lo:hi]))
        if abs(corrected[i] - local_med) > threshold_px:
            corrected[i] = local_med
            changed = True

    smoothed = list(corrected)
    for i in range(1, len(corrected) - 1):
        candidate = (corrected[i - 1] + 2.0 * corrected[i] + corrected[i + 1]) / 4.0
        if abs(candidate - corrected[i]) > 0.2:
            smoothed[i] = candidate
            changed = True

    return smoothed, changed


def fill_missing_linear(values: List[float], invalid_mask: List[bool]) -> List[float]:
    out = [float(v) for v in values]
    n = len(out)
    if n == 0:
        return out

    valid_indices = [i for i, bad in enumerate(invalid_mask) if not bad]
    if not valid_indices:
        return out

    for i, bad in enumerate(invalid_mask):
        if not bad:
            continue
        left = max((j for j in valid_indices if j < i), default=None)
        right = min((j for j in valid_indices if j > i), default=None)
        if left is None and right is None:
            continue
        if left is None:
            out[i] = out[right]
        elif right is None:
            out[i] = out[left]
        else:
            t = (i - left) / float(right - left)
            out[i] = out[left] * (1.0 - t) + out[right] * t
    return out


def compute_canvas_and_anchor(frames: List[FrameInfo]) -> Tuple[int, int, float, float, bool]:
    left_rels = [(-f.corrected_center_x) for f in frames]
    right_rels = [(f.scaled_w - f.corrected_center_x) for f in frames]
    top_rels = [(-f.corrected_top_rim_y) for f in frames]
    bot_rels = [(f.scaled_h - f.corrected_top_rim_y) for f in frames]

    # Check if 2048x2048 is feasible.
    x_low = max(-lr for lr in left_rels)
    x_high = min(PREFERRED_CANVAS - rr for rr in right_rels)
    y_low = max(-tr for tr in top_rels)
    y_high = min(PREFERRED_CANVAS - br for br in bot_rels)
    if x_low <= x_high and y_low <= y_high:
        anchor_x = (x_low + x_high) / 2.0
        anchor_y = (y_low + y_high) / 2.0
        return PREFERRED_CANVAS, PREFERRED_CANVAS, anchor_x, anchor_y, True

    needed_w = int(math.ceil(max(right_rels) - min(left_rels)))
    needed_h = int(math.ceil(max(bot_rels) - min(top_rels)))
    anchor_x = -min(left_rels)
    anchor_y = -min(top_rels)
    return needed_w, needed_h, anchor_x, anchor_y, False


def place_on_canvas(frame: FrameInfo, canvas_w: int, canvas_h: int, anchor_x: float, anchor_y: float) -> Tuple[np.ndarray, int, int]:
    canvas = np.zeros((canvas_h, canvas_w, 4), dtype=np.uint8)
    x = int(round(anchor_x - frame.corrected_center_x))
    y = int(round(anchor_y - frame.corrected_top_rim_y))
    src = frame.scaled_rgba
    sh, sw = src.shape[:2]

    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(canvas_w, x + sw)
    y1 = min(canvas_h, y + sh)
    if x0 >= x1 or y0 >= y1:
        return canvas, x, y

    sx0 = x0 - x
    sy0 = y0 - y
    sx1 = sx0 + (x1 - x0)
    sy1 = sy0 + (y1 - y0)

    patch = src[sy0:sy1, sx0:sx1]
    alpha = patch[:, :, 3:4].astype(np.float32) / 255.0
    inv = 1.0 - alpha

    dst_rgb = canvas[y0:y1, x0:x1, :3].astype(np.float32)
    src_rgb = patch[:, :, :3].astype(np.float32)
    out_rgb = src_rgb * alpha + dst_rgb * inv
    canvas[y0:y1, x0:x1, :3] = np.clip(out_rgb, 0, 255).astype(np.uint8)
    canvas[y0:y1, x0:x1, 3] = np.maximum(canvas[y0:y1, x0:x1, 3], patch[:, :, 3])
    return canvas, x, y


def make_sprite(aligned_frames: List[np.ndarray], cell_w: int, cell_h: int, cols: int) -> Tuple[np.ndarray, int]:
    total = len(aligned_frames)
    rows = int(math.ceil(total / float(cols)))
    sprite = np.zeros((rows * cell_h, cols * cell_w, 4), dtype=np.uint8)
    for i, frame in enumerate(aligned_frames):
        r = i // cols
        c = i % cols
        y = r * cell_h
        x = c * cell_w
        sprite[y:y + cell_h, x:x + cell_w] = frame
    return sprite, rows


def ensure_dirs() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    ALIGNED_DIR.mkdir(parents=True, exist_ok=True)


def write_preview_gif(frames: List[np.ndarray], fps: float = 8.0) -> None:
    duration = max(0.05, 1.0 / fps)
    imageio.mimsave(str(GIF_PATH), frames, duration=duration, loop=0, disposal=2)


def try_write_mp4(frames: List[np.ndarray], fps: int = 12) -> Optional[str]:
    try:
        rgb_frames = [f[:, :, :3] for f in frames]
        writer = imageio.get_writer(str(MP4_PATH), fps=fps, codec="libx264", quality=8)
        for fr in rgb_frames:
            writer.append_data(fr)
        writer.close()
        return None
    except Exception as exc:  # noqa: BLE001
        try:
            if MP4_PATH.exists():
                MP4_PATH.unlink()
        except Exception:  # noqa: BLE001
            pass
        return f"MP4 preview skipped: {exc}"


def main() -> None:
    input_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT
    if not input_dir.exists():
        raise FileNotFoundError(f"Input folder not found: {input_dir}")

    ensure_dirs()
    input_paths = load_ordered_frames(input_dir)
    if not input_paths:
        raise RuntimeError(f"No PNG frames found in {input_dir}")

    warnings: List[str] = []
    detections: List[PotDetection] = []
    primary_failures: List[int] = []
    raw_rgba: List[np.ndarray] = []
    for p in input_paths:
        rgba = np.array(Image.open(p).convert("RGBA"), dtype=np.uint8)
        raw_rgba.append(rgba)
        alpha = rgba[:, :, 3]
        try:
            det = detect_pot(alpha, lower_fraction=0.35)
        except Exception as exc:  # noqa: BLE001
            primary_failures.append(len(raw_rgba))
            det = PotDetection(
                width=0.0,
                center_x=rgba.shape[1] / 2.0,
                top_rim_y=rgba.shape[0] * 0.70,
                bottom_center_x=rgba.shape[1] / 2.0,
                bottom_center_y=rgba.shape[0] - 1.0,
                method=f"primary_failed:{exc}",
            )
        detections.append(det)

    primary_valid_widths = [d.width for d in detections if d.width > 0]
    if not primary_valid_widths:
        raise RuntimeError("Pot detection failed for all frames in primary pass")

    primary_median = float(statistics.median(primary_valid_widths))
    for i, (rgba, det) in enumerate(zip(raw_rgba, detections), start=1):
        needs_retry = (
            det.width <= 0
            or abs(det.width - primary_median) / primary_median > 0.30
        )
        if not needs_retry:
            continue

        alpha = rgba[:, :, 3]
        try:
            retry = detect_pot(alpha, lower_fraction=0.50)
            if retry.width > 0 and abs(retry.width - primary_median) / primary_median <= 0.30:
                detections[i - 1] = PotDetection(
                    width=retry.width,
                    center_x=retry.center_x,
                    top_rim_y=retry.top_rim_y,
                    bottom_center_x=retry.bottom_center_x,
                    bottom_center_y=retry.bottom_center_y,
                    method=f"{retry.method}+retry",
                )
                warnings.append(
                    f"frame_{i:03d}: primary width {det.width:.3f} deviated >30%, retry(lower50) accepted ({retry.width:.3f})"
                )
            else:
                fallback_width = primary_median
                detections[i - 1] = PotDetection(
                    width=fallback_width,
                    center_x=retry.center_x if retry.width > 0 else det.center_x,
                    top_rim_y=retry.top_rim_y if retry.width > 0 else det.top_rim_y,
                    bottom_center_x=retry.bottom_center_x if retry.width > 0 else det.bottom_center_x,
                    bottom_center_y=retry.bottom_center_y if retry.width > 0 else det.bottom_center_y,
                    method=f"{retry.method if retry.width > 0 else det.method}+median_width_fallback",
                )
                warnings.append(
                    f"frame_{i:03d}: detection outlier after retry; using median width fallback ({fallback_width:.3f})"
                )
        except Exception as exc:  # noqa: BLE001
            fallback_width = primary_median
            detections[i - 1] = PotDetection(
                width=fallback_width,
                center_x=det.center_x,
                top_rim_y=det.top_rim_y,
                bottom_center_x=det.bottom_center_x,
                bottom_center_y=det.bottom_center_y,
                method=f"{det.method}+retry_failed+median_width_fallback",
            )
            warnings.append(
                f"frame_{i:03d}: retry(lower50) failed ({exc}); using median width fallback ({fallback_width:.3f})"
            )

    widths = [d.width for d in detections]
    target_width = float(statistics.median(widths))
    if target_width <= 0:
        raise RuntimeError("Invalid target pot width")

    frames: List[FrameInfo] = []
    for i, (src, rgba, det) in enumerate(zip(input_paths, raw_rgba, detections), start=1):
        scale = target_width / det.width if det.width > 0 else 1.0
        scaled = resize_rgba(rgba, scale)
        out_name = f"frame_{i:03d}.png"
        frames.append(
            FrameInfo(
                idx=i,
                src_path=src,
                image_rgba=rgba,
                orig_h=rgba.shape[0],
                orig_w=rgba.shape[1],
                detection=det,
                scale=scale,
                scaled_rgba=scaled,
                scaled_h=scaled.shape[0],
                scaled_w=scaled.shape[1],
                scaled_center_x=det.center_x * scale,
                scaled_top_rim_y=det.top_rim_y * scale,
                scaled_bottom_center_x=det.bottom_center_x * scale,
                scaled_bottom_center_y=det.bottom_center_y * scale,
                corrected_center_x=det.center_x * scale,
                corrected_top_rim_y=det.top_rim_y * scale,
                corrected_bottom_center_x=det.bottom_center_x * scale,
                corrected_bottom_center_y=det.bottom_center_y * scale,
                output_name=out_name,
                stage=stage_for_frame(i),
            )
        )

    raw_centers = [f.scaled_center_x for f in frames]
    raw_rims = [f.scaled_top_rim_y for f in frames]
    raw_bottom_x = [f.scaled_bottom_center_x for f in frames]
    raw_bottom_y = [f.scaled_bottom_center_y for f in frames]
    unreliable = [("median_width_fallback" in f.detection.method or "primary_failed" in f.detection.method) for f in frames]
    raw_centers = fill_missing_linear(raw_centers, unreliable)
    raw_rims = fill_missing_linear(raw_rims, unreliable)
    raw_bottom_x = fill_missing_linear(raw_bottom_x, unreliable)
    raw_bottom_y = fill_missing_linear(raw_bottom_y, unreliable)
    corrected_centers, center_smoothed = smooth_anchor_series(raw_centers, threshold_px=1.5)
    corrected_rims, rim_smoothed = smooth_anchor_series(raw_rims, threshold_px=1.5)
    corrected_bottom_x, bottom_x_smoothed = smooth_anchor_series(raw_bottom_x, threshold_px=2.0)
    corrected_bottom_y, bottom_y_smoothed = smooth_anchor_series(raw_bottom_y, threshold_px=2.0)
    for f, cx, ry, bx, by in zip(frames, corrected_centers, corrected_rims, corrected_bottom_x, corrected_bottom_y):
        f.corrected_center_x = cx
        f.corrected_top_rim_y = ry
        f.corrected_bottom_center_x = bx
        f.corrected_bottom_center_y = by

    canvas_w, canvas_h, anchor_x, anchor_y, used_preferred = compute_canvas_and_anchor(frames)

    aligned_frames: List[np.ndarray] = []
    aligned_top_rims: List[int] = []
    aligned_centers: List[int] = []
    aligned_bottom_centers: List[Tuple[int, int]] = []
    for f in frames:
        aligned, place_x, place_y = place_on_canvas(f, canvas_w, canvas_h, anchor_x, anchor_y)
        aligned_frames.append(aligned)
        aligned_top_rims.append(int(round(anchor_y)))
        aligned_centers.append(int(round(anchor_x)))
        aligned_bottom_centers.append(
            (
                int(round(place_x + f.corrected_bottom_center_x)),
                int(round(place_y + f.corrected_bottom_center_y)),
            )
        )
        Image.fromarray(aligned, mode="RGBA").save(ALIGNED_DIR / f.output_name)

    sprite, rows = make_sprite(aligned_frames, canvas_w, canvas_h, COLS)
    Image.fromarray(sprite, mode="RGBA").save(SPRITE_PATH)

    write_preview_gif(aligned_frames, fps=8.0)
    mp4_warning = try_write_mp4(aligned_frames, fps=12)
    if mp4_warning:
        if MP4_PATH.exists():
            MP4_PATH.unlink(missing_ok=True)
        warnings.append(mp4_warning)

    metadata_frames = []
    for f in frames:
        metadata_frames.append(
            {
                "frame": f.idx,
                "file": f.output_name,
                "stage": f.stage,
                "potWidth": round(f.detection.width, 3),
                "scaleFactor": round(f.scale, 6),
                "potCenterX": round(f.scaled_center_x, 3),
                "potTopRimY": round(f.scaled_top_rim_y, 3),
                "correctedAnchorX": round(f.corrected_center_x, 3),
                "correctedAnchorY": round(f.corrected_top_rim_y, 3),
            }
        )

    metadata = {
        "inputFolder": str(input_dir).replace("\\", "/"),
        "outputFolder": str(OUTPUT_ROOT).replace("\\", "/"),
        "frameWidth": canvas_w,
        "frameHeight": canvas_h,
        "columns": COLS,
        "rows": rows,
        "totalFrames": len(frames),
        "targetPotWidth": round(target_width, 3),
        "detectedPotWidths": [round(x, 3) for x in widths],
        "appliedScaleFactors": [round(f.scale, 6) for f in frames],
        "potCenterXPerFrame": [round(f.scaled_center_x, 3) for f in frames],
        "potTopRimYPerFrame": [round(f.scaled_top_rim_y, 3) for f in frames],
        "correctedAnchorXPerFrame": [round(f.corrected_center_x, 3) for f in frames],
        "correctedAnchorYPerFrame": [round(f.corrected_top_rim_y, 3) for f in frames],
        "temporalSmoothingApplied": bool(center_smoothed or rim_smoothed or bottom_x_smoothed or bottom_y_smoothed),
        "frames": metadata_frames,
    }
    META_PATH.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")

    sprite_h, sprite_w = sprite.shape[0], sprite.shape[1]
    report_lines = [
        "GrowSim Plant Growth Asset Processing Report",
        "===========================================",
        f"Input folder: {input_dir}",
        f"Output folder: {OUTPUT_ROOT}",
        "",
        f"Input PNG frames found: {len(input_paths)}",
        f"Output aligned frames created: {len(aligned_frames)}",
        f"Target pot width (median): {target_width:.3f}px",
        f"Pot width min/max before normalization: {min(widths):.3f}px / {max(widths):.3f}px",
        f"Output canvas size: {canvas_w}x{canvas_h}",
        f"Preferred 2048x2048 used: {'yes' if used_preferred else 'no'}",
        f"Aligned pot center X (all frames): {int(round(anchor_x))}",
        f"Aligned pot top rim Y (all frames): {int(round(anchor_y))}",
        f"Canvas size identical across all frames: {'yes' if len({(a.shape[1], a.shape[0]) for a in aligned_frames}) == 1 else 'no'}",
        f"Pot top rim identical across all frames: {'yes' if len(set(aligned_top_rims)) == 1 else 'no'}",
        f"Pot center identical across all frames: {'yes' if len(set(aligned_centers)) == 1 else 'no'}",
        f"Temporal smoothing applied: {'yes' if (center_smoothed or rim_smoothed or bottom_x_smoothed or bottom_y_smoothed) else 'no'}",
        "",
        f"Sprite sheet path: {SPRITE_PATH}",
        f"Sprite sheet size: {sprite_w}x{sprite_h}",
        f"Sprite grid: {COLS} columns x {rows} rows",
        "",
        f"GIF preview path: {GIF_PATH}",
        f"MP4 preview path: {MP4_PATH if (MP4_PATH.exists() and not mp4_warning) else '(not created)'}",
        "",
        "Detection methods by frame:",
    ]
    report_lines.append("")
    report_lines.append("Per-frame pot anchors (raw -> corrected):")
    for f in frames:
        report_lines.append(
            (
                f"- frame_{f.idx:03d}: method={f.detection.method}, "
                f"potWidth={f.detection.width:.3f}, scale={f.scale:.6f}, "
                f"centerX={f.scaled_center_x:.3f}->{f.corrected_center_x:.3f}, "
                f"topRimY={f.scaled_top_rim_y:.3f}->{f.corrected_top_rim_y:.3f}, "
                f"bottomCenter=({f.scaled_bottom_center_x:.3f},{f.scaled_bottom_center_y:.3f})"
                f"->({f.corrected_bottom_center_x:.3f},{f.corrected_bottom_center_y:.3f})"
            )
        )
    report_lines.append("")
    report_lines.append("Bottom-center placement validation (final canvas coords):")
    for i, (bx, by) in enumerate(aligned_bottom_centers, start=1):
        report_lines.append(f"- frame_{i:03d}: bottomCenterFinal=({bx},{by})")
    if warnings:
        report_lines.extend(["", "Warnings:"])
        report_lines.extend([f"- {w}" for w in warnings])
    else:
        report_lines.extend(["", "Warnings:", "- none"])

    REPORT_PATH.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print(f"Processed {len(frames)} frames from {input_dir}")
    print(f"Target pot width: {target_width:.3f}")
    print(f"Canvas: {canvas_w}x{canvas_h} (preferred used: {used_preferred})")
    print(f"Wrote aligned frames to: {ALIGNED_DIR}")
    print(f"Wrote sprite sheet: {SPRITE_PATH}")
    print(f"Wrote metadata: {META_PATH}")
    print(f"Wrote report: {REPORT_PATH}")
    print(f"Wrote gif preview: {GIF_PATH}")
    if MP4_PATH.exists() and not mp4_warning:
        print(f"Wrote mp4 preview: {MP4_PATH}")


if __name__ == "__main__":
    main()
