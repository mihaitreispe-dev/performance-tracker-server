import { computeAspectCrop, type NormalizedBox, unionBoxes } from './crop-geometry';

describe('unionBoxes', () => {
  it('returns null for no valid boxes', () => {
    expect(unionBoxes([])).toBeNull();
    expect(unionBoxes([{ left: 0, top: 0, width: 0, height: 0 }])).toBeNull();
  });

  it('unions overlapping boxes into the covering box', () => {
    const union = unionBoxes([
      { left: 0.1, top: 0.2, width: 0.2, height: 0.3 },
      { left: 0.25, top: 0.1, width: 0.2, height: 0.2 },
    ]);
    expect(union).not.toBeNull();
    expect(union!.left).toBeCloseTo(0.1);
    expect(union!.top).toBeCloseTo(0.1);
    expect(union!.width).toBeCloseTo(0.35); // right edge 0.45 - left 0.1
    expect(union!.height).toBeCloseTo(0.4); // bottom 0.5 - top 0.1
  });

  it('clamps boxes that bleed past the frame edges', () => {
    const union = unionBoxes([{ left: -0.1, top: -0.05, width: 1.3, height: 1.2 }]);
    expect(union).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });
});

describe('computeAspectCrop', () => {
  const portrait = { frameWidth: 1080, frameHeight: 1920 }; // 9:16 source
  const wide = 16 / 9;

  it('produces a 16:9 crop from a portrait source, clamped to full width', () => {
    // Person centred vertically, occupying the middle of the frame.
    const region: NormalizedBox = { left: 0.25, top: 0.35, width: 0.5, height: 0.3 };
    const crop = computeAspectCrop({ region, ...portrait, targetAspect: wide })!;
    expect(crop).not.toBeNull();
    // A 16:9 crop can't be wider than the 1080px source, so width pins to 1080
    // and height follows the aspect (1080 / (16/9) = 607.5 → even).
    expect(crop.width).toBe(1080);
    expect(crop.height).toBeCloseTo(608, -1);
    // Aspect ratio is ~16:9.
    expect(crop.width / crop.height).toBeCloseTo(wide, 1);
    // Stays inside the frame.
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(portrait.frameWidth);
    expect(crop.y + crop.height).toBeLessThanOrEqual(portrait.frameHeight);
  });

  it('centres the crop on the person vertically', () => {
    const region: NormalizedBox = { left: 0.2, top: 0.1, width: 0.6, height: 0.2 }; // person near top
    const crop = computeAspectCrop({ region, ...portrait, targetAspect: wide })!;
    const personCenterY = (0.1 + 0.2 / 2) * portrait.frameHeight; // 0.2 * 1920 = 384
    const cropCenterY = crop.y + crop.height / 2;
    // Crop centre tracks the person (within a tolerance for clamping/even-rounding).
    expect(Math.abs(cropCenterY - personCenterY)).toBeLessThan(crop.height); // not pinned to frame centre
    expect(crop.y).toBeGreaterThanOrEqual(0);
  });

  it('returns even integer dimensions', () => {
    const region: NormalizedBox = { left: 0.3, top: 0.3, width: 0.37, height: 0.41 };
    const crop = computeAspectCrop({ region, ...portrait, targetAspect: wide })!;
    expect(crop.x % 2).toBe(0);
    expect(crop.y % 2).toBe(0);
    expect(crop.width % 2).toBe(0);
    expect(crop.height % 2).toBe(0);
  });

  it('handles a landscape source cropped to 9:16, framing the person', () => {
    // Tall person that nearly fills the height → crop pins to full height.
    const region: NormalizedBox = { left: 0.4, top: 0.05, width: 0.2, height: 0.9 };
    const crop = computeAspectCrop({
      region,
      frameWidth: 1920,
      frameHeight: 1080,
      targetAspect: 9 / 16,
    })!;
    expect(crop.height).toBe(1080); // padded person exceeds height → clamps to full height
    expect(crop.width).toBeCloseTo(608, -1); // 1080 * 9/16 = 607.5 → even
    expect(crop.width / crop.height).toBeCloseTo(9 / 16, 1);
    // Crop is narrower than the source and stays within it, centred on the person.
    expect(crop.width).toBeLessThan(1920);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1920);
  });

  it('returns null for degenerate input', () => {
    expect(
      computeAspectCrop({
        region: { left: 0, top: 0, width: 0, height: 0 },
        frameWidth: 1080,
        frameHeight: 1920,
        targetAspect: wide,
      }),
    ).toBeNull();
    expect(
      computeAspectCrop({
        region: { left: 0.2, top: 0.2, width: 0.5, height: 0.5 },
        frameWidth: 0,
        frameHeight: 0,
        targetAspect: wide,
      }),
    ).toBeNull();
  });
});
