/**
 * Pure geometry for smart cropping — no AWS, fully unit-testable.
 *
 * Rekognition reports person bounding boxes in normalized [0,1] coordinates.
 * To frame a cross-orientation rendition (e.g. a 16:9 crop of a portrait
 * source) we union those boxes, pad them a little, then grow the result to
 * the target aspect ratio, centred on the person and clamped to the source
 * frame. The output is a pixel rectangle suitable for MediaConvert's
 * per-output `VideoDescription.Crop`.
 */

export interface NormalizedBox {
  /** Distance from the left edge, 0..1. */
  left: number;
  /** Distance from the top edge, 0..1. */
  top: number;
  width: number;
  height: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Union of normalized boxes → the smallest normalized box covering them all. */
export function unionBoxes(boxes: NormalizedBox[]): NormalizedBox | null {
  const valid = boxes.filter(
    (b) => Number.isFinite(b.left) && Number.isFinite(b.top) && b.width > 0 && b.height > 0,
  );
  if (valid.length === 0) return null;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const b of valid) {
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.left + b.width);
    bottom = Math.max(bottom, b.top + b.height);
  }
  // Clamp into the unit square — Rekognition can report boxes that bleed
  // slightly past the frame edges.
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(1, right);
  bottom = Math.min(1, bottom);
  return { left, top, width: right - left, height: bottom - top };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Round a dimension to the nearest even integer ≥ 2 (H.264 needs even dims). */
function evenDim(v: number): number {
  return Math.max(2, Math.round(v / 2) * 2);
}

/** Round an offset to the nearest even integer ≥ 0 (0 is a valid position). */
function evenOffset(v: number): number {
  return Math.max(0, Math.round(v / 2) * 2);
}

/**
 * Compute a crop rectangle (source pixels) of `targetAspect` that contains
 * the person region, centred on it, padded, and clamped to the frame.
 * Returns null for degenerate input. May return a full-frame crop when the
 * person spans the whole frame — callers can treat that as "no crop needed".
 */
export function computeAspectCrop(opts: {
  region: NormalizedBox;
  frameWidth: number;
  frameHeight: number;
  targetAspect: number;
  /** Fraction to grow the person box on every side before fitting. Default 0.15. */
  padding?: number;
}): PixelRect | null {
  const { region, frameWidth: W, frameHeight: H, targetAspect: AR } = opts;
  const padding = opts.padding ?? 0.15;
  if (!(W > 0) || !(H > 0) || !(AR > 0) || region.width <= 0 || region.height <= 0) {
    return null;
  }

  // Person box in pixels.
  const rx = region.left * W;
  const ry = region.top * H;
  const rw = region.width * W;
  const rh = region.height * H;

  // Pad around the person, then take the centre.
  const pw = rw * (1 + 2 * padding);
  const ph = rh * (1 + 2 * padding);
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;

  // Smallest box of the target aspect that covers the padded person box.
  let cw = Math.max(pw, ph * AR);
  let ch = cw / AR;

  // Clamp to the frame while preserving aspect.
  if (cw > W) {
    cw = W;
    ch = cw / AR;
  }
  if (ch > H) {
    ch = H;
    cw = H * AR;
  }
  if (cw > W) {
    cw = W;
    ch = cw / AR;
  }

  // Centre on the person, then keep the rect inside the frame.
  let x = clamp(cx - cw / 2, 0, Math.max(0, W - cw));
  let y = clamp(cy - ch / 2, 0, Math.max(0, H - ch));

  // Snap to even pixels and re-clamp position so width/height still fit.
  const ew = Math.min(evenDim(cw), Math.floor(W / 2) * 2);
  const eh = Math.min(evenDim(ch), Math.floor(H / 2) * 2);
  x = evenOffset(clamp(x, 0, Math.max(0, W - ew)));
  y = evenOffset(clamp(y, 0, Math.max(0, H - eh)));

  return { x, y, width: ew, height: eh };
}
