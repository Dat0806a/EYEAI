// Helper file for processing face mesh landmarks to detect eye state and gaze direction
// Uses skull-fixed intercanthal baseline geometry to eliminate eyelid-droop inversion on downward gaze.

export interface Point {
  x: number;
  y: number;
  z: number;
}

export function dist(p1: Point, p2: Point): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z || 0) - (p2.z || 0));
}

export function dist2D(p1: Point, p2: Point): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// MediaPipe FaceMesh standard landmark indices
export const EYE_INDICES = {
  // Left eye key points
  leftOuter: 33,
  leftInner: 133,
  leftTop: 159,
  leftBottom: 145,
  leftTop2: 158,
  leftBottom2: 144,
  leftIris: 468, // Center of left iris

  // Right eye key points
  rightInner: 362,
  rightOuter: 263,
  rightTop: 386,
  rightBottom: 374,
  rightTop2: 385,
  rightBottom2: 373,
  rightIris: 473, // Center of right iris

  // Key facial orientation reference landmarks
  noseTip: 1,
  subnasale: 2,
  chin: 152,
  glabella: 10,
  leftCheek: 234,
  rightCheek: 454,
  mouthTop: 13,
  mouthBottom: 14,
};

// Full eye contour loops for drawing & boundary detection
export const LEFT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const RIGHT_EYE_CONTOUR = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];

// Iris boundary landmarks (center, right, top, left, bottom)
export const LEFT_IRIS_POINTS = [468, 469, 470, 471, 472];
export const RIGHT_IRIS_POINTS = [473, 474, 475, 476, 477];

// Face oval boundary loop for wireframe mesh
export const FACE_OVAL_CONTOUR = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400,
  377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
];

// Lips contour loop
export const LIPS_CONTOUR = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78
];

// Nose bridge and contour
export const NOSE_CONTOUR = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2];

// Eyebrows contours
export const LEFT_EYEBROW = [70, 63, 105, 66, 107];
export const RIGHT_EYEBROW = [336, 296, 334, 293, 300];

// Canonical facial feature lines for Futuristic Face Mesh overlay
export const FACIAL_TESSELLATION_LINES: [number, number][] = [
  // Forehead to nose bridge
  [10, 151], [151, 9], [9, 8], [8, 168], [168, 6], [6, 197], [197, 195], [195, 5], [5, 4], [4, 1],
  // Nose to cheeks
  [1, 2], [2, 94], [94, 19],
  [1, 129], [129, 203], [203, 98], [98, 97], [97, 2],
  [1, 358], [358, 423], [423, 327], [327, 326], [326, 2],
  // Cheeks to jaw
  [234, 127], [127, 162], [162, 21], [21, 54],
  [454, 356], [356, 389], [389, 251], [251, 284],
  // Eyebrow to temples
  [107, 55], [55, 65], [65, 52], [52, 53], [53, 46],
  [336, 285], [285, 295], [295, 282], [282, 283], [283, 276],
  // Chin & Jaw connections
  [152, 148], [148, 176], [176, 149], [149, 150], [150, 136],
  [152, 377], [377, 400], [400, 378], [378, 379], [379, 365],
];

export interface EyeMetrics {
  leftEAR: number;
  rightEAR: number;
  avgEAR: number;
  // Eye-relative pupil displacements (normalized to intercanthal distance)
  leftIrisH: number;
  leftIrisV: number;
  rightIrisH: number;
  rightIrisV: number;
  rawGazeX: number;
  rawGazeY: number;
  // Compatibility aliases for legacy dashboards
  avgIrisH: number;
  avgIrisV: number;
  rawIrisH: number;
  rawIrisV: number;
  compensatedIrisH: number;
  compensatedIrisV: number;
  // Head pose estimation
  headYaw: number;
  headPitch: number;
  // Head-pose compensated gaze coordinates
  compensatedGazeX: number;
  compensatedGazeY: number;
  // Quality & status
  faceDetected: boolean;
  confidence: number;
  leftIrisCenter: Point;
  rightIrisCenter: Point;
  leftCanthusOuter: Point;
  leftCanthusInner: Point;
  rightCanthusInner: Point;
  rightCanthusOuter: Point;
}

export function analyzeEyes(landmarks: Point[] | undefined): EyeMetrics | null {
  if (!landmarks || landmarks.length < 468) {
    return null;
  }

  const getPoint = (idx: number): Point => {
    return landmarks[idx] || { x: 0, y: 0, z: 0 };
  };

  // 1. Canthal Landmarks (Facial skeleton reference)
  const leftOuterPt = getPoint(EYE_INDICES.leftOuter);  // 33 (user's left outer / image left in non-mirrored)
  const leftInnerPt = getPoint(EYE_INDICES.leftInner);  // 133
  const rightInnerPt = getPoint(EYE_INDICES.rightInner); // 362
  const rightOuterPt = getPoint(EYE_INDICES.rightOuter); // 263

  // Eyelid points for EAR (Eye Aspect Ratio)
  const leftTopPt = getPoint(EYE_INDICES.leftTop);
  const leftBottomPt = getPoint(EYE_INDICES.leftBottom);
  const leftTopPt2 = getPoint(EYE_INDICES.leftTop2);
  const leftBottomPt2 = getPoint(EYE_INDICES.leftBottom2);

  const rightTopPt = getPoint(EYE_INDICES.rightTop);
  const rightBottomPt = getPoint(EYE_INDICES.rightBottom);
  const rightTopPt2 = getPoint(EYE_INDICES.rightTop2);
  const rightBottomPt2 = getPoint(EYE_INDICES.rightBottom2);

  // EAR Calculations
  const left_v1 = dist2D(leftTopPt, leftBottomPt);
  const left_v2 = dist2D(leftTopPt2, leftBottomPt2);
  const left_h = Math.max(0.001, dist2D(leftOuterPt, leftInnerPt));
  const leftEAR = (left_v1 + left_v2) / (2 * left_h);

  const right_v1 = dist2D(rightTopPt, rightBottomPt);
  const right_v2 = dist2D(rightTopPt2, rightBottomPt2);
  const right_h = Math.max(0.001, dist2D(rightInnerPt, rightOuterPt));
  const rightEAR = (right_v1 + right_v2) / (2 * right_h);

  const avgEAR = (leftEAR + rightEAR) / 2;

  // 2. Iris Centers
  let leftIris = getPoint(EYE_INDICES.leftIris);
  let rightIris = getPoint(EYE_INDICES.rightIris);

  // Geometric fallback if iris landmarks are missing or zeroed
  if (leftIris.x === 0 && leftIris.y === 0) {
    leftIris = {
      x: (leftOuterPt.x + leftInnerPt.x) / 2,
      y: (leftTopPt.y + leftBottomPt.y) / 2,
      z: (leftOuterPt.z + leftInnerPt.z) / 2,
    };
  }
  if (rightIris.x === 0 && rightIris.y === 0) {
    rightIris = {
      x: (rightInnerPt.x + rightOuterPt.x) / 2,
      y: (rightTopPt.y + rightBottomPt.y) / 2,
      z: (rightInnerPt.z + rightOuterPt.z) / 2,
    };
  }

  // =========================================================================
  // 3. CANTHAL BASELINE PROJECTION (Robust Against Eyelid Droop & Squint)
  // =========================================================================
  // In camera frame (non-mirrored raw MediaPipe):
  // User's Left Eye (anatomical left): outer=33 (smaller x), inner=133 (larger x).
  // Vector along Left Eye canthi: from outer (33) to inner (133).
  const blx_L = leftInnerPt.x - leftOuterPt.x;
  const bly_L = leftInnerPt.y - leftOuterPt.y;
  const len_L = Math.max(0.001, Math.hypot(blx_L, bly_L));
  const ux_L = blx_L / len_L; // Unit vector along eye axis (towards nose)
  const uy_L = bly_L / len_L;
  // Perpendicular unit vector pointing DOWNWARD in image space (90 deg clockwise)
  const vx_L = -uy_L;
  const vy_L = ux_L;

  const midX_L = (leftOuterPt.x + leftInnerPt.x) / 2;
  const midY_L = (leftOuterPt.y + leftInnerPt.y) / 2;
  const dx_L = leftIris.x - midX_L;
  const dy_L = leftIris.y - midY_L;

  // Normalized iris coordinate relative to canthal baseline:
  // Horizontal: projection along eye axis (positive towards inner canthus/nose, negative towards outer canthus/ear)
  const leftIrisH_proj = (dx_L * ux_L + dy_L * uy_L) / len_L;
  // Vertical: projection along perpendicular downward vector (positive = DOWN, negative = UP)
  const leftIrisV_proj = (dx_L * vx_L + dy_L * vy_L) / len_L;

  // User's Right Eye (anatomical right): inner=362 (smaller x), outer=263 (larger x).
  // Vector along Right Eye canthi: from inner (362) to outer (263).
  const blx_R = rightOuterPt.x - rightInnerPt.x;
  const bly_R = rightOuterPt.y - rightInnerPt.y;
  const len_R = Math.max(0.001, Math.hypot(blx_R, bly_R));
  const ux_R = blx_R / len_R; // Unit vector along eye axis (towards ear)
  const uy_R = bly_R / len_R;
  // Perpendicular unit vector pointing DOWNWARD in image space
  const vx_R = -uy_R;
  const vy_R = ux_R;

  const midX_R = (rightInnerPt.x + rightOuterPt.x) / 2;
  const midY_R = (rightInnerPt.y + rightOuterPt.y) / 2;
  const dx_R = rightIris.x - midX_R;
  const dy_R = rightIris.y - midY_R;

  // Horizontal: projection along eye axis (positive towards outer canthus/ear, negative towards inner canthus/nose)
  const rightIrisH_proj = (dx_R * ux_R + dy_R * uy_R) / len_R;
  // Vertical: projection along perpendicular downward vector (positive = DOWN, negative = UP)
  const rightIrisV_proj = (dx_R * vx_R + dy_R * vy_R) / len_R;

  // =========================================================================
  // 4. MIRRORED SELFIE COORDINATE MAPPING & DUAL-EYE FUSION
  // =========================================================================
  // In mirrored selfie mode (what the user sees on screen):
  // When user looks to their RIGHT (screen RIGHT):
  //   - Left eye looks towards nose (inner canthus) -> leftIrisH_proj is positive
  //   - Right eye looks towards ear (outer canthus) -> rightIrisH_proj is positive
  // When user looks to their LEFT (screen LEFT):
  //   - Left eye looks towards ear (outer canthus) -> leftIrisH_proj is negative
  //   - Right eye looks towards nose (inner canthus) -> rightIrisH_proj is negative
  // When user looks DOWN:
  //   - Both leftIrisV_proj and rightIrisV_proj increase positively
  // When user looks UP:
  //   - Both leftIrisV_proj and rightIrisV_proj decrease negatively

  // Weight each eye according to its opening (EAR):
  // Eye with higher EAR is less occluded and has a sharper iris landmark
  const wL = Math.max(0.01, leftEAR - 0.08);
  const wR = Math.max(0.01, rightEAR - 0.08);
  const wSum = wL + wR;

  // Horizontal Gaze: Negated so looking to SCREEN RIGHT (user's right) yields positive (+X),
  // and looking to SCREEN LEFT (user's left) yields negative (-X).
  const rawGazeX = -((wL * leftIrisH_proj + wR * rightIrisH_proj) / wSum);
  // Vertical Gaze: Positive = DOWN (+Y in screen space), Negative = UP (-Y in screen space)
  const rawGazeY = (wL * leftIrisV_proj + wR * rightIrisV_proj) / wSum;

  // =========================================================================
  // 5. HEAD POSE ESTIMATION & RIGID COMPENSATION
  // =========================================================================
  const nose = getPoint(EYE_INDICES.noseTip);
  const chin = getPoint(EYE_INDICES.chin);
  const glabella = getPoint(EYE_INDICES.glabella);
  const leftCheek = getPoint(EYE_INDICES.leftCheek);
  const rightCheek = getPoint(EYE_INDICES.rightCheek);

  const faceWidth = Math.max(0.001, dist2D(leftCheek, rightCheek));
  const faceHeight = Math.max(0.001, dist2D(glabella, chin));

  // Head Yaw: nose shift between cheeks (mirrored: turning head right -> nose shifts right)
  const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
  const headYaw = (faceCenterX - nose.x) / (faceWidth * 0.5);

  // Head Pitch: ratio of upper face to lower face
  // When tilting head DOWN: nose moves down closer to chin, dBottom shrinks
  // When tilting head UP: nose moves up closer to glabella, dTop shrinks
  const dTop = Math.max(0.001, dist2D(glabella, nose));
  const dBottom = Math.max(0.001, dist2D(nose, chin));
  const pitchRatio = dTop / (dTop + dBottom);
  // Neutral pitch ratio is around 0.45; tilting down -> pitchRatio > 0.45 (positive pitch)
  const headPitch = (pitchRatio - 0.45) * 3.5;

  // Pure Iris Position Tracking (chỉ áp dụng mống mắt cho thao tác mắt)
  // Eye operations are strictly governed by iris displacement relative to eye canthi
  const compensatedGazeX = rawGazeX;
  const compensatedGazeY = rawGazeY;

  // Confidence based on face dimensions and eye landmark stability
  const isSaneSize = faceWidth > 0.08 && faceHeight > 0.10;
  const eyesOpenScore = Math.min(1.0, avgEAR / 0.22);
  const confidence = isSaneSize ? Math.min(0.99, Math.max(0.3, 0.5 + eyesOpenScore * 0.45)) : 0.2;

  return {
    leftEAR,
    rightEAR,
    avgEAR,
    leftIrisH: leftIrisH_proj,
    leftIrisV: leftIrisV_proj,
    rightIrisH: rightIrisH_proj,
    rightIrisV: rightIrisV_proj,
    rawGazeX,
    rawGazeY,
    avgIrisH: (leftIrisH_proj + rightIrisH_proj) / 2,
    avgIrisV: (leftIrisV_proj + rightIrisV_proj) / 2,
    rawIrisH: (leftIrisH_proj + rightIrisH_proj) / 2,
    rawIrisV: (leftIrisV_proj + rightIrisV_proj) / 2,
    compensatedIrisH: compensatedGazeX,
    compensatedIrisV: compensatedGazeY,
    headYaw,
    headPitch,
    compensatedGazeX,
    compensatedGazeY,
    faceDetected: true,
    confidence,
    leftIrisCenter: leftIris,
    rightIrisCenter: rightIris,
    leftCanthusOuter: leftOuterPt,
    leftCanthusInner: leftInnerPt,
    rightCanthusInner: rightInnerPt,
    rightCanthusOuter: rightOuterPt,
  };
}

