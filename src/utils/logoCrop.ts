export interface CropRect { x: number; y: number; width: number; height: number }

/** Ignore transparent pixels and pixels that appear white over white paper. */
export function contentBounds(data: Uint8ClampedArray, width: number, height: number): CropRect | null {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const alpha = data[i + 3] / 255;
    if (alpha <= 0.02 || [0, 1, 2].every(c => 255 - (255 - data[i + c]) * alpha >= 245)) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
