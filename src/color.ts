// Small color helpers: parsing, mixing and WCAG contrast.

export function parseHex(hex: string): [number, number, number] | undefined {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return undefined;
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** A hex color as the spec allows it: a leading "#" and 3 or 6 digits. */
export const isHex = (s: string) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s);

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** `amount` of `a` over `b`: mixHex(a, b, 0.1) is a 10% tint of a on b. */
export function mixHex(a: string, b: string, amount: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  return toHex(
    [0, 1, 2].map((i) => (ca[i] ?? 0) * amount + (cb[i] ?? 0) * (1 - amount)) as [
      number,
      number,
      number,
    ],
  );
}

export function luminance(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 0;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Moves `fg` toward whichever of black and white contrasts more with `bg` until it reaches
 * `ratio`. On mid-tone backgrounds the other pole can be worse than `fg` itself, and no color
 * contrasts more than that pole, so the result never has less contrast than `fg` and, when
 * `ratio` is out of reach, is that better pole.
 */
export function ensureContrast(fg: string, bg: string, ratio = 4.5): string {
  if (!isHex(fg) || !isHex(bg) || contrast(fg, bg) >= ratio) return fg;
  const target = contrast("#000000", bg) >= contrast("#ffffff", bg) ? "#000000" : "#ffffff";
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mixHex(target, fg, t);
    if (contrast(c, bg) >= ratio) return c;
  }
  return target;
}

/** Linearize sRGB gamma component in [0, 255] to linear [0, 1]. */
export function sRGBToLinear(v: number): number {
  const s = Math.max(0, Math.min(255, v)) / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Delinearize linear component [0, 1] to sRGB integer [0, 255]. */
export function linearToSRGB(c: number): number {
  const clamped = Math.max(0, Math.min(1, c));
  const s = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, s * 255)));
}

/** Convert sRGB [0..255] to Oklab coordinates [L in 0..1, a, b]. */
export function sRGBToOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const lr = sRGBToLinear(r);
  const lg = sRGBToLinear(g);
  const lb = sRGBToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bVal = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  return [L, a, bVal];
}

/** Convert Oklab coordinates back to sRGB [0..255]. */
export function oklabToSRGB([L, a, b]: [number, number, number]): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [linearToSRGB(lr), linearToSRGB(lg), linearToSRGB(lb)];
}

/** Compute perceptual Euclidean distance in Oklab color space. */
export function oklabDistance(hexA: string, hexB: string): number {
  const rgbA = parseHex(hexA);
  const rgbB = parseHex(hexB);
  if (!rgbA || !rgbB) return 1.0;

  const labA = sRGBToOklab(rgbA);
  const labB = sRGBToOklab(rgbB);

  const dL = labA[0] - labB[0];
  const da = labA[1] - labB[1];
  const db = labA[2] - labB[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** Convert sRGB [0..255] to D65 CIELAB [L*, a*, b*]. */
export function sRGBToCIELAB([r, g, b]: [number, number, number]): [number, number, number] {
  const lr = sRGBToLinear(r) * 100;
  const lg = sRGBToLinear(g) * 100;
  const lb = sRGBToLinear(b) * 100;

  const x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041;

  // Reference D65 illuminant
  const xn = 95.047;
  const yn = 100.0;
  const zn = 108.883;

  const fx = x / xn > 0.008856 ? Math.cbrt(x / xn) : 7.787 * (x / xn) + 16 / 116;
  const fy = y / yn > 0.008856 ? Math.cbrt(y / yn) : 7.787 * (y / yn) + 16 / 116;
  const fz = z / zn > 0.008856 ? Math.cbrt(z / zn) : 7.787 * (z / zn) + 16 / 116;

  const L = 116 * fy - 16;
  const aVal = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);
  return [L, aVal, bVal];
}

/** Compute CIEDE2000 total color difference Delta E 00 between two hex colors. */
export function ciede2000(hexA: string, hexB: string): number {
  const rgbA = parseHex(hexA);
  const rgbB = parseHex(hexB);
  if (!rgbA || !rgbB) return 100.0;

  const [L1, a1, b1] = sRGBToCIELAB(rgbA);
  const [L2, a2, b2] = sRGBToCIELAB(rgbB);

  const avgLp = (L1 + L2) / 2;
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (C1 + C2) / 2;

  const G = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;

  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);
  const avgCp = (C1p + C2p) / 2;

  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  let h1p = toDeg(Math.atan2(b1, a1p));
  if (h1p < 0) h1p += 360;
  let h2p = toDeg(Math.atan2(b2, a2p));
  if (h2p < 0) h2p += 360;

  let avghp: number;
  if (Math.abs(h1p - h2p) > 180) {
    avghp = (h1p + h2p + 360) / 2;
  } else {
    avghp = (h1p + h2p) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(toRad(avghp - 30)) +
    0.24 * Math.cos(toRad(2 * avghp)) +
    0.32 * Math.cos(toRad(3 * avghp + 6)) -
    0.2 * Math.cos(toRad(4 * avghp - 63));

  let deltahp: number;
  if (Math.abs(h1p - h2p) <= 180) {
    deltahp = h2p - h1p;
  } else if (h2p <= h1p) {
    deltahp = h2p - h1p + 360;
  } else {
    deltahp = h2p - h1p - 360;
  }

  const deltaLp = L2 - L1;
  const deltaCp = C2p - C1p;
  const deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(toRad(deltahp / 2));

  const SL = 1 + (0.015 * (avgLp - 50) ** 2) / Math.sqrt(20 + (avgLp - 50) ** 2);
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;

  const deltaTheta = 30 * Math.exp(-(((avghp - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7));
  const RT = -Math.sin(toRad(2 * deltaTheta)) * RC;

  const dE = Math.sqrt(
    (deltaLp / SL) ** 2 +
      (deltaCp / SC) ** 2 +
      (deltaHp / SH) ** 2 +
      RT * (deltaCp / SC) * (deltaHp / SH),
  );
  return dE;
}
