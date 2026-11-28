/**
 * Standalone Low-Light Exposure Enhancement Filter for EYEAI (Impaired-User Pipeline).
 *
 * Uses Face/Eye-Region Weighted + Highlight-Suppressed Luminance Metering,
 * Adaptive EMA Smoothing, Gamma Deadband with Identity Snap, and a
 * Noise-Controlled Adaptive Gamma + Contrast-Shaped 256-entry Uint8Array LUT.
 * Designed as an add-only pre-processing stage before MediaPipe FaceMesh.
 */

export interface LowLightFilterConfig {
  /** Minimum allowed gamma (caps brightness gain to limit noise amplification). Default: 0.28 */
  minGamma?: number;
  /** Maximum allowed gamma (1.0 = identity, no darkening). Default: 1.0 */
  maxGamma?: number;
  /** Target perceptual luminance (0..255) before gamma relaxes to 1.0. Default: 138 */
  targetLuminance?: number;
  /** Baseline exponential moving average alpha for steady lighting (0..1). Default: 0.26 */
  emaAlpha?: number;
  /** Fast EMA alpha engaged automatically during sudden lighting changes (0..1). Default: 0.72 */
  fastEmaAlpha?: number;
  /** Luminance delta threshold triggering fast adaptation. Default: 8 */
  suddenChangeThreshold?: number;
  /** Minimum gamma delta required to rebuild LUT (prevents frame-to-frame flicker). Default: 0.01 */
  gammaDeadband?: number;
  /** Pixel sampling stride for fast luminance estimation. Default: 6 */
  sampleStep?: number;
  /** Shadow noise-floor toe strength (suppresses dark sensor grain amplification). Default: 0.022 */
  shadowToeStrength?: number;
  /** Gentle monotonic midtone S-contrast strength for iris/eyelid clarity. Default: 0.042 */
  contrastStrength?: number;
}

export interface NormalizedFaceRoi {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  eyeMinY?: number;
  eyeMaxY?: number;
}

export const DEFAULT_LOW_LIGHT_CONFIG: Required<LowLightFilterConfig> = {
  minGamma: 0.28,
  maxGamma: 1.0,
  targetLuminance: 138,
  emaAlpha: 0.26,
  fastEmaAlpha: 0.72,
  suddenChangeThreshold: 8,
  gammaDeadband: 0.01,
  sampleStep: 6,
  shadowToeStrength: 0.022,
  contrastStrength: 0.042,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Extracts a normalized [0..1] face + eye-band ROI from MediaPipe FaceMesh landmarks
 * strictly for exposure metering (never alters landmarks or tracking logic).
 */
export function extractFaceRoiFromLandmarks(
  landmarks: Array<{ x: number; y: number }> | undefined | null
): NormalizedFaceRoi | null {
  if (!landmarks || landmarks.length < 468) return null;

  // Face perimeter & eye anchor indices
  const faceIndices = [10, 152, 234, 454, 127, 356, 58, 288];
  const eyeIndices = [33, 133, 159, 145, 362, 263, 386, 374];

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  let foundFace = false;

  for (let i = 0; i < faceIndices.length; i++) {
    const pt = landmarks[faceIndices[i]];
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    foundFace = true;
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  if (!foundFace || maxX <= minX || maxY <= minY) return null;

  let eyeMinY = 1;
  let eyeMaxY = 0;
  let foundEyes = false;
  for (let i = 0; i < eyeIndices.length; i++) {
    const pt = landmarks[eyeIndices[i]];
    if (!pt || !Number.isFinite(pt.y)) continue;
    foundEyes = true;
    if (pt.y < eyeMinY) eyeMinY = pt.y;
    if (pt.y > eyeMaxY) eyeMaxY = pt.y;
  }

  // Trim 10% inward horizontally from outer cheeks/ears so dark hair does not skew bright-room metering
  const insetX = (maxX - minX) * 0.1;
  const padY = (maxY - minY) * 0.02;
  const eyePad = foundEyes ? Math.max(0.025, (eyeMaxY - eyeMinY) * 1.2) : 0;

  return {
    minX: clamp(minX + insetX, 0, 1),
    maxX: clamp(maxX - insetX, 0, 1),
    minY: clamp(minY - padY, 0, 1),
    maxY: clamp(maxY + padY, 0, 1),
    eyeMinY: foundEyes ? clamp(eyeMinY - eyePad, 0, 1) : undefined,
    eyeMaxY: foundEyes ? clamp(eyeMaxY + eyePad, 0, 1) : undefined,
  };
}

/**
 * Estimates unweighted perceptual mean luminance (Rec. 601) from RGBA pixel buffer using strided sampling.
 * Returns a value in [0, 255].
 */
export function estimateMeanLuminance(
  data: Uint8ClampedArray,
  sampleStep: number = DEFAULT_LOW_LIGHT_CONFIG.sampleStep
): number {
  const totalPixels = Math.floor(data.length / 4);
  if (totalPixels <= 0) return 0;

  const stride = Math.max(1, Math.floor(sampleStep));
  let sum = 0;
  let count = 0;

  for (let p = 0; p < totalPixels; p += stride) {
    const idx = p * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    sum += 0.299 * r + 0.587 * g + 0.114 * b;
    count += 1;
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Estimates face-prioritized, highlight-suppressed effective scene luminance (0..255).
 * Prevents bright lamps, windows, or screen glare in the background from hiding dark faces/eyes.
 */
export function estimateSceneLuminance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sampleStep: number = DEFAULT_LOW_LIGHT_CONFIG.sampleStep,
  faceRoi?: NormalizedFaceRoi | null
): number {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return estimateMeanLuminance(data, sampleStep);
  }

  const stride = Math.max(1, Math.floor(sampleStep));
  const bins = new Float64Array(16);
  let weightedSum = 0;
  let totalWeight = 0;

  const hasRoi =
    Boolean(faceRoi) &&
    faceRoi!.maxX > faceRoi!.minX &&
    faceRoi!.maxY > faceRoi!.minY;

  const roiMinX = hasRoi ? faceRoi!.minX : 0.22;
  const roiMaxX = hasRoi ? faceRoi!.maxX : 0.78;
  const roiMinY = hasRoi ? faceRoi!.minY : 0.16;
  const roiMaxY = hasRoi ? faceRoi!.maxY : 0.80;
  const eyeMinY =
    hasRoi && faceRoi!.eyeMinY !== undefined
      ? faceRoi!.eyeMinY
      : roiMinY + (roiMaxY - roiMinY) * 0.16;
  const eyeMaxY =
    hasRoi && faceRoi!.eyeMaxY !== undefined
      ? faceRoi!.eyeMaxY
      : roiMinY + (roiMaxY - roiMinY) * 0.56;

  for (let y = 0; y < height; y += stride) {
    const ny = y / height;
    const inY = ny >= roiMinY && ny <= roiMaxY;
    const inEyeY = ny >= eyeMinY && ny <= eyeMaxY;
    const rowOffset = y * width;

    for (let x = 0; x < width; x += stride) {
      const nx = x / width;
      const idx = (rowOffset + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      const inFace = inY && nx >= roiMinX && nx <= roiMaxX;
      let weight = inFace ? (inEyeY ? (hasRoi ? 7.0 : 5.0) : (hasRoi ? 4.5 : 3.8)) : (hasRoi ? 0.2 : 0.25);

      // Suppress bright background highlights/glare so dark facial/eye regions still receive full exposure
      if (!inFace && lum > 185) {
        weight *= 0.12;
      } else if (lum > 225) {
        weight *= 0.35;
      }

      weightedSum += lum * weight;
      totalWeight += weight;

      const binIdx = Math.min(15, Math.max(0, Math.floor(lum / 16)));
      bins[binIdx] += weight;
    }
  }

  if (totalWeight <= 0) return 0;

  const weightedMean = weightedSum / totalWeight;

  // Compute weighted mean of the central facial tone band (20%..80% cumulative mass)
  // so neither deep hair/pupils nor specular highlights distort true facial exposure
  const lowMass = totalWeight * 0.2;
  const highMass = totalWeight * 0.8;
  let accumMass = 0;
  let midSum = 0;
  let midMass = 0;

  for (let b = 0; b < 16; b++) {
    const binMass = bins[b];
    if (binMass <= 0) continue;

    const binStart = accumMass;
    const binEnd = accumMass + binMass;
    accumMass = binEnd;

    const overlapStart = Math.max(binStart, lowMass);
    const overlapEnd = Math.min(binEnd, highMass);
    if (overlapEnd > overlapStart) {
      const takeMass = overlapEnd - overlapStart;
      const binCenter = b * 16 + 8;
      midSum += binCenter * takeMass;
      midMass += takeMass;
    }
  }

  const midtoneMean = midMass > 0 ? midSum / midMass : weightedMean;
  return 0.8 * weightedMean + 0.2 * midtoneMean;
}

/**
 * Computes adaptive gamma from smoothed luminance.
 * Solves (L / 255)^gamma = (targetLuminance / 255), clamped to [minGamma, maxGamma].
 */
export function computeAdaptiveGamma(
  smoothedLuminance: number,
  config: LowLightFilterConfig = {}
): number {
  const minGamma = config.minGamma ?? DEFAULT_LOW_LIGHT_CONFIG.minGamma;
  const maxGamma = config.maxGamma ?? DEFAULT_LOW_LIGHT_CONFIG.maxGamma;
  const targetLuminance = config.targetLuminance ?? DEFAULT_LOW_LIGHT_CONFIG.targetLuminance;

  if (!Number.isFinite(smoothedLuminance)) {
    return maxGamma;
  }

  const clampedLum = clamp(smoothedLuminance, 0, 255);
  if (clampedLum >= targetLuminance) {
    return maxGamma;
  }

  const safeLum = Math.max(1, clampedLum);
  const normLum = safeLum / 255;
  const normTarget = clamp(targetLuminance, 1, 254) / 255;

  const rawGamma = Math.log(normTarget) / Math.log(normLum);
  return clamp(rawGamma, minGamma, maxGamma);
}

/**
 * Populates a 256-entry Uint8Array Look-Up Table combining:
 * 1) Noise-safe shadow toe (prevents sensor black-level noise explosion)
 * 2) Adaptive gamma brightening
 * 3) Gentle monotonic midtone S-contrast for iris & eyelid detail clarity
 */
export function buildGammaLUT(
  gamma: number,
  outLut?: Uint8Array,
  config: LowLightFilterConfig = {}
): Uint8Array {
  const lut = outLut && outLut.length === 256 ? outLut : new Uint8Array(256);
  const safeGamma = Number.isFinite(gamma) && gamma > 0 ? gamma : 1.0;

  if (Math.abs(safeGamma - 1.0) < 1e-4) {
    for (let i = 0; i < 256; i++) {
      lut[i] = i;
    }
    return lut;
  }

  const minGamma = config.minGamma ?? DEFAULT_LOW_LIGHT_CONFIG.minGamma;
  const denom = Math.max(0.1, 1.0 - minGamma);
  const strength = clamp((1.0 - safeGamma) / denom, 0, 1);
  const toe = Math.max(0, (config.shadowToeStrength ?? DEFAULT_LOW_LIGHT_CONFIG.shadowToeStrength) * strength);
  const contrast = clamp((config.contrastStrength ?? DEFAULT_LOW_LIGHT_CONFIG.contrastStrength) * strength, 0, 0.08);

  lut[0] = 0;
  for (let i = 1; i < 255; i++) {
    const x = i / 255;
    const effectiveX = toe > 0 ? (x * x) / (x + toe * (1 - x)) : x;
    const g = Math.pow(effectiveX, safeGamma);
    const shaped = contrast > 0 ? g - contrast * Math.sin(2 * Math.PI * g) : g;
    const corrected = Math.round(255 * shaped);
    lut[i] = corrected < 0 ? 0 : corrected > 255 ? 255 : corrected;
  }
  lut[255] = 255;

  return lut;
}

/**
 * Applies a 256-entry gamma LUT in-place to an RGBA pixel buffer (leaves alpha channel untouched).
 */
export function applyGammaLUT(data: Uint8ClampedArray, lut: Uint8Array): void {
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
}

/**
 * Updates adaptive EMA-smoothed luminance and applies gamma deadband decision
 * with fast transition on sudden lighting changes and clean snap to maxGamma.
 */
export function updateLuminanceAndGamma(
  previousSmoothedLuminance: number | null,
  previousGamma: number,
  rawLuminance: number,
  config: LowLightFilterConfig = {}
): { smoothedLuminance: number; gamma: number; lutUpdated: boolean } {
  const baseAlpha = clamp(config.emaAlpha ?? DEFAULT_LOW_LIGHT_CONFIG.emaAlpha, 0.01, 1.0);
  const fastAlpha = clamp(config.fastEmaAlpha ?? DEFAULT_LOW_LIGHT_CONFIG.fastEmaAlpha, baseAlpha, 1.0);
  const suddenThreshold = Math.max(1, config.suddenChangeThreshold ?? DEFAULT_LOW_LIGHT_CONFIG.suddenChangeThreshold);
  const deadband = Math.max(0, config.gammaDeadband ?? DEFAULT_LOW_LIGHT_CONFIG.gammaDeadband);
  const minGamma = config.minGamma ?? DEFAULT_LOW_LIGHT_CONFIG.minGamma;
  const maxGamma = config.maxGamma ?? DEFAULT_LOW_LIGHT_CONFIG.maxGamma;

  let smoothedLuminance: number;
  if (previousSmoothedLuminance === null) {
    smoothedLuminance = rawLuminance;
  } else {
    const deltaLum = Math.abs(rawLuminance - previousSmoothedLuminance);
    const boostFactor =
      deltaLum > suddenThreshold
        ? clamp((deltaLum - suddenThreshold) / (suddenThreshold * 2.5), 0, 1)
        : 0;
    const effectiveAlpha = baseAlpha + boostFactor * (fastAlpha - baseAlpha);
    smoothedLuminance = effectiveAlpha * rawLuminance + (1 - effectiveAlpha) * previousSmoothedLuminance;
  }

  const rawCandidate = computeAdaptiveGamma(smoothedLuminance, config);
  const candidateGamma = rawCandidate >= maxGamma - 0.005 ? maxGamma : rawCandidate;

  const crossesIdentity =
    (candidateGamma >= maxGamma - 0.005 && previousGamma < maxGamma - 0.005) ||
    (candidateGamma < maxGamma - 0.005 && previousGamma >= maxGamma - 0.005);
  const hitsMinBound =
    candidateGamma <= minGamma + 0.002 && previousGamma > minGamma + 0.002;
  const shouldUpdate =
    previousSmoothedLuminance === null ||
    crossesIdentity ||
    hitsMinBound ||
    Math.abs(candidateGamma - previousGamma) >= deadband;

  return {
    smoothedLuminance,
    gamma: shouldUpdate ? candidateGamma : previousGamma,
    lutUpdated: shouldUpdate,
  };
}

/**
 * Stateful frame processor maintaining a single reusable Canvas & 256-entry LUT.
 */
export class LowLightExposureProcessor {
  private readonly config: Required<LowLightFilterConfig>;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly lut: Uint8Array = new Uint8Array(256);
  private smoothedLuminance: number | null = null;
  private currentGamma: number = 1.0;
  private lastRawLuminance: number | null = null;
  private lastSceneLuminance: number | null = null;
  private lastOutputLuminance: number | null = null;
  private hasBuiltInitialLut: boolean = false;

  constructor(config: LowLightFilterConfig = {}) {
    this.config = {
      ...DEFAULT_LOW_LIGHT_CONFIG,
      ...config,
    };
    buildGammaLUT(1.0, this.lut, this.config);
  }

  public getState(): {
    smoothedLuminance: number | null;
    currentGamma: number;
    lastRawLuminance: number | null;
    lastSceneLuminance: number | null;
    lastOutputLuminance: number | null;
  } {
    return {
      smoothedLuminance: this.smoothedLuminance,
      currentGamma: this.currentGamma,
      lastRawLuminance: this.lastRawLuminance,
      lastSceneLuminance: this.lastSceneLuminance,
      lastOutputLuminance: this.lastOutputLuminance,
    };
  }

  private ensureCanvas(width: number, height: number): CanvasRenderingContext2D | null {
    if (typeof document === 'undefined') return null;

    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    if (!this.ctx) {
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    if (!this.ctx) return null;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    return this.ctx;
  }

  /**
   * Ham xu ly bo loc thieu sang (tang sang gamma thich ung theo vung khuon mat) cho tung khung hinh camera:
   * - Buoc 1: Ve khung hinh tu the `<video>` len khung ve tam va doc mang diem anh RGBA.
   * - Buoc 2: Uoc luong do sang khung canh uu tien vung khuon mat/mat (`faceRoi`) de tranh den nen lam sai lech.
   * - Buoc 3: Lam muot do sang theo thoi gian bang bo loc EMA va tinh he so gamma theo muc tieu `targetLuminance`.
   * - Buoc 4: Xay dung bang tra 256 muc co chong nhieu vung toi va tang nhe do tuong phan, sau do ap dung len anh.
   * - Tra ve null neu kich thuoc video chua san sang hoac khong tao duoc ngu canh ve 2D.
   */
  public processFrame(
    video: HTMLVideoElement,
    faceRoi?: NormalizedFaceRoi | null
  ): HTMLCanvasElement | null {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height || width <= 0 || height <= 0) {
      return null;
    }

    const ctx = this.ensureCanvas(width, height);
    if (!ctx || !this.canvas) {
      return null;
    }

    ctx.drawImage(video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const rawMean = estimateMeanLuminance(imageData.data, this.config.sampleStep);
    const sceneLuminance = estimateSceneLuminance(
      imageData.data,
      width,
      height,
      this.config.sampleStep,
      faceRoi
    );

    this.lastRawLuminance = rawMean;
    this.lastSceneLuminance = sceneLuminance;

    const next = updateLuminanceAndGamma(
      this.smoothedLuminance,
      this.currentGamma,
      sceneLuminance,
      this.config
    );

    this.smoothedLuminance = next.smoothedLuminance;

    if (!this.hasBuiltInitialLut || next.lutUpdated) {
      this.currentGamma = next.gamma;
      buildGammaLUT(this.currentGamma, this.lut, this.config);
      this.hasBuiltInitialLut = true;
    }

    if (this.currentGamma < 0.999) {
      applyGammaLUT(imageData.data, this.lut);
      ctx.putImageData(imageData, 0, 0);
      this.lastOutputLuminance = estimateMeanLuminance(imageData.data, this.config.sampleStep * 2);
    } else {
      this.lastOutputLuminance = rawMean;
    }

    return this.canvas;
  }

  /**
   * Resets temporal EMA/gamma state without destroying the reusable canvas.
   */
  public reset(): void {
    this.smoothedLuminance = null;
    this.currentGamma = 1.0;
    this.lastRawLuminance = null;
    this.lastSceneLuminance = null;
    this.lastOutputLuminance = null;
    this.hasBuiltInitialLut = false;
    buildGammaLUT(1.0, this.lut, this.config);
  }

  /**
   * Releases canvas backing memory on teardown.
   */
  public dispose(): void {
    this.reset();
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
      this.canvas = null;
    }
    this.ctx = null;
  }
}
