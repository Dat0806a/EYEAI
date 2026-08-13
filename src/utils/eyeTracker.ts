// Helper file for processing face mesh landmarks to detect eye state

interface Point {
  x: number;
  y: number;
  z: number;
}

export function dist(p1: Point, p2: Point): number {
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) +
    Math.pow(p1.y - p2.y, 2) +
    Math.pow(p1.z - p2.z, 2)
  );
}

// MediaPipe FaceMesh standard indices
export const EYE_INDICES = {
  // Left eye outline
  leftOuter: 33,
  leftInner: 133,
  leftTop: 159,
  leftBottom: 145,
  leftIris: 468, // Center of left iris

  // Right eye outline
  rightInner: 362,
  rightOuter: 263,
  rightTop: 386,
  rightBottom: 374,
  rightIris: 473, // Center of right iris
};

export interface EyeMetrics {
  leftEAR: number;
  rightEAR: number;
  avgEAR: number;
  leftIrisH: number;  // 0 (outer) to 1 (inner)
  leftIrisV: number;  // 0 (top) to 1 (bottom)
  rightIrisH: number; // 0 (inner) to 1 (outer)
  rightIrisV: number; // 0 (top) to 1 (bottom)
  avgIrisH: number;
  avgIrisV: number;
  faceDetected: boolean;
}

export function analyzeEyes(landmarks: Point[] | undefined): EyeMetrics | null {
  if (!landmarks || landmarks.length < 468) {
    return null;
  }

  const getPoint = (idx: number): Point => {
    return landmarks[idx] || { x: 0, y: 0, z: 0 };
  };

  // 1. EAR Calculations
  const leftOuterPt = getPoint(EYE_INDICES.leftOuter);
  const leftInnerPt = getPoint(EYE_INDICES.leftInner);
  const leftTopPt = getPoint(EYE_INDICES.leftTop);
  const leftBottomPt = getPoint(EYE_INDICES.leftBottom);

  const rightInnerPt = getPoint(EYE_INDICES.rightInner);
  const rightOuterPt = getPoint(EYE_INDICES.rightOuter);
  const rightTopPt = getPoint(EYE_INDICES.rightTop);
  const rightBottomPt = getPoint(EYE_INDICES.rightBottom);

  const left_v = dist(leftTopPt, leftBottomPt);
  const left_h = dist(leftOuterPt, leftInnerPt);
  const leftEAR = left_h > 0 ? left_v / left_h : 0;

  const right_v = dist(rightTopPt, rightBottomPt);
  const right_h = dist(rightInnerPt, rightOuterPt);
  const rightEAR = right_h > 0 ? right_v / right_h : 0;

  const avgEAR = (leftEAR + rightEAR) / 2;

  // 2. Iris Ratio Tracking
  // If the iris center landmarks (468, 473) are not available, estimate using averages of eyelids.
  // Wait, let's write high-reliability fallbacks.
  let leftIris = getPoint(EYE_INDICES.leftIris);
  let rightIris = getPoint(EYE_INDICES.rightIris);

  // Fallbacks if iris is zero/empty
  if (leftIris.x === 0 && leftIris.y === 0) {
    // Left eye center estimation
    leftIris = {
      x: (leftOuterPt.x + leftInnerPt.x) / 2,
      y: (leftTopPt.y + leftBottomPt.y) / 2,
      z: (leftOuterPt.z + leftInnerPt.z) / 2,
    };
  }
  if (rightIris.x === 0 && rightIris.y === 0) {
    // Right eye center estimation
    rightIris = {
      x: (rightInnerPt.x + rightOuterPt.x) / 2,
      y: (rightTopPt.y + rightBottomPt.y) / 2,
      z: (rightInnerPt.z + rightOuterPt.z) / 2,
    };
  }

  // Horizontal position: how far iris is between outer and inner corner
  // For Left Eye: outer (33) has lower X (or larger depending on camera mirror).
  // Let's normalize relative to the eye's width.
  // Left eye horizontal ratio
  const leftIrisH = left_h > 0 ? (leftIris.x - leftOuterPt.x) / (leftInnerPt.x - leftOuterPt.x) : 0.5;
  // Left eye vertical ratio: position between top and bottom
  const leftIrisV = left_v > 0 ? (leftIris.y - leftTopPt.y) / (leftBottomPt.y - leftTopPt.y) : 0.5;

  // Right eye horizontal ratio
  const rightIrisH = right_h > 0 ? (rightIris.x - rightInnerPt.x) / (rightOuterPt.x - rightInnerPt.x) : 0.5;
  // Right eye vertical ratio: position between top and bottom
  const rightIrisV = right_v > 0 ? (rightIris.y - rightTopPt.y) / (rightBottomPt.y - rightTopPt.y) : 0.5;

  // Since we might mirror or look left/right together, we can average them.
  // Let's average the ratios for double stability.
  const avgIrisH = (leftIrisH + rightIrisH) / 2;
  const avgIrisV = (leftIrisV + rightIrisV) / 2;

  return {
    leftEAR,
    rightEAR,
    avgEAR,
    leftIrisH,
    leftIrisV,
    rightIrisH,
    rightIrisV,
    avgIrisH,
    avgIrisV,
    faceDetected: true,
  };
}
