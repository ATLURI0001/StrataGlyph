import { describe, expect, it } from "vitest";

import {
  ciede2000,
  generateOklabScale,
  interpolateOklab,
  linearToSRGB,
  oklabDistance,
  oklabToSRGB,
  sRGBToCIELAB,
  sRGBToLinear,
  sRGBToOklab,
  wcagConformanceLevel,
} from "../src/color.ts";

describe("Color Science Utilities", () => {
  it("converts sRGB to linear and back accurately", () => {
    for (const v of [0, 10, 50, 128, 200, 255]) {
      const lin = sRGBToLinear(v);
      const back = linearToSRGB(lin);
      expect(back).toBe(v);
    }
  });

  it("converts sRGB to Oklab and back with minimal rounding error", () => {
    const testColors: [number, number, number][] = [
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [128, 64, 192],
    ];

    for (const rgb of testColors) {
      const lab = sRGBToOklab(rgb);
      const [r, g, b] = oklabToSRGB(lab);
      expect(Math.abs(r - rgb[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(g - rgb[1])).toBeLessThanOrEqual(1);
      expect(Math.abs(b - rgb[2])).toBeLessThanOrEqual(1);
    }
  });

  it("calculates Oklab distance correctly", () => {
    // Identity
    expect(oklabDistance("#ffffff", "#ffffff")).toBe(0.0);
    expect(oklabDistance("#3b82f6", "#3b82f6")).toBe(0.0);

    // Symmetry
    const d1 = oklabDistance("#ff0000", "#00ff00");
    const d2 = oklabDistance("#00ff00", "#ff0000");
    expect(Math.abs(d1 - d2)).toBeLessThan(1e-9);

    // Perceptual scale: black to white distance is ~1.0
    const bwDist = oklabDistance("#000000", "#ffffff");
    expect(bwDist).toBeGreaterThan(0.95);
    expect(bwDist).toBeLessThan(1.05);

    // Invalid hex fallback
    expect(oklabDistance("invalid", "#ffffff")).toBe(1.0);
  });

  it("converts sRGB to CIELAB D65", () => {
    // Reference: White #ffffff in D65 CIELAB has L* = 100, a* ~ 0, b* ~ 0
    const whiteLab = sRGBToCIELAB([255, 255, 255]);
    expect(Math.abs(whiteLab[0] - 100)).toBeLessThan(0.1);
    expect(Math.abs(whiteLab[1])).toBeLessThan(0.1);
    expect(Math.abs(whiteLab[2])).toBeLessThan(0.1);

    // Reference: Black #000000 has L* = 0, a* = 0, b* = 0
    const blackLab = sRGBToCIELAB([0, 0, 0]);
    expect(blackLab[0]).toBe(0);
    expect(blackLab[1]).toBe(0);
    expect(blackLab[2]).toBe(0);
  });

  it("computes CIEDE2000 color difference accurately", () => {
    // Identity
    expect(ciede2000("#ffffff", "#ffffff")).toBe(0.0);
    expect(ciede2000("#10b981", "#10b981")).toBe(0.0);

    // Symmetry
    const de1 = ciede2000("#2563eb", "#dc2626");
    const de2 = ciede2000("#dc2626", "#2563eb");
    expect(Math.abs(de1 - de2)).toBeLessThan(1e-9);

    // Small perceptual difference for subtle tint variations
    const subtleDelta = ciede2000("#2563eb", "#2564ea");
    expect(subtleDelta).toBeGreaterThan(0.0);
    expect(subtleDelta).toBeLessThan(1.0); // imperceptible (sub-JND)

    // Large difference for complementary colors
    const largeDelta = ciede2000("#000000", "#ffffff");
    expect(largeDelta).toBeGreaterThan(80.0);
  });

  it("evaluates WCAG 2.1 conformance levels correctly", () => {
    // Black on White: 21:1 -> AAA
    expect(wcagConformanceLevel("#000000", "#ffffff")).toBe("AAA");

    // Gray on White (#767676 on #ffffff): ~4.54:1 -> AA for normal text
    expect(wcagConformanceLevel("#767676", "#ffffff", 12)).toBe("AA");

    // Light gray on White (#999999 on #ffffff): ~2.8:1 -> FAIL for normal
    expect(wcagConformanceLevel("#999999", "#ffffff", 12)).toBe("FAIL");

    // Large text (#999999 on #ffffff with >= 18pt or >= 14pt bold): ~2.8:1 still fails 3.0:1
    expect(wcagConformanceLevel("#999999", "#ffffff", 18)).toBe("FAIL");

    // 3.5:1 text with 18pt -> passes "AA Large"
    expect(wcagConformanceLevel("#888888", "#ffffff", 18)).toBe("AA Large");
  });

  it("interpolates colors in perceptually uniform Oklab space without muddy midtones", () => {
    // Interpolating blue (#0000ff) to yellow (#ffff00) at t=0.5 in Oklab avoids muddy gray
    const midOklab = interpolateOklab("#0000ff", "#ffff00", 0.5);
    expect(midOklab.startsWith("#")).toBe(true);
    expect(midOklab.length).toBe(7);

    // Identity endpoints
    expect(interpolateOklab("#ff0000", "#00ff00", 0.0)).toBe("#ff0000");
    expect(interpolateOklab("#ff0000", "#00ff00", 1.0)).toBe("#00ff00");

    // Scale generation
    const scale = generateOklabScale("#000000", "#ffffff", 5);
    expect(scale.length).toBe(5);
    expect(scale[0]).toBe("#000000");
    expect(scale[4]).toBe("#ffffff");
  });
});
