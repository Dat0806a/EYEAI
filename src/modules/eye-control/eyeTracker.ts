// Tep ho tro xu ly cac diem moc khuon mat (landmarks) de nhan dien trang thai mat va huong nhin.
// Su dung hinh hoc duong co so noi 2 khoe mat co dinh tren xuong so de triet tieu loi dao nguoc khi nhin xuong.

export interface Point {
  x: number;
  y: number;
  z: number;
}

/**
 * Tinh khoang cach Euclid 3 chieu (x, y, z) giua 2 diem moc MediaPipe.
 * Neu thieu do sau z thi mac dinh dung 0 de tranh loi NaN.
 */
export function dist(p1: Point, p2: Point): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z || 0) - (p2.z || 0));
}

/**
 * Tinh khoang cach Euclid 2 chieu (x, y) tren mat phang anh chuan hoa.
 * Bo qua truc z de ty le mo mat `EAR` va khoang cach khoe mat khong bi nhieu do sau.
 */
export function dist2D(p1: Point, p2: Point): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// Chi so cac diem moc chuan cua mo hinh MediaPipe FaceMesh (tong 478 diem)
export const EYE_INDICES = {
  // Cac diem moc chinh cua mat trai (ben trai nguoi dung)
  leftOuter: 33,
  leftInner: 133,
  leftTop: 159,
  leftBottom: 145,
  leftTop2: 158,
  leftBottom2: 144,
  leftIris: 468, // Tam con nguoi mat trai

  // Cac diem moc chinh cua mat phai (ben phai nguoi dung)
  rightInner: 362,
  rightOuter: 263,
  rightTop: 386,
  rightBottom: 374,
  rightTop2: 385,
  rightBottom2: 373,
  rightIris: 473, // Tam con nguoi mat phai

  // Cac diem moc tham chieu de uoc luong goc quay dau
  noseTip: 1,
  subnasale: 2,
  chin: 152,
  glabella: 10,
  leftCheek: 234,
  rightCheek: 454,
  mouthTop: 13,
  mouthBottom: 14,
};

// Vong duong vien day du cua hai mat de ve lop phu va xac dinh bien
export const LEFT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const RIGHT_EYE_CONTOUR = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];

// Cac diem vien con nguoi (tam, phai, tren, trai, duoi)
export const LEFT_IRIS_POINTS = [468, 469, 470, 471, 472];
export const RIGHT_IRIS_POINTS = [473, 474, 475, 476, 477];

// Vong duong bao khuon mat hinh bau duc de ve luoi khung day
export const FACE_OVAL_CONTOUR = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400,
  377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
];

// Vong duong bao moi
export const LIPS_CONTOUR = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78
];

// Song mui va duong vien mui
export const NOSE_CONTOUR = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2];

// Duong vien long may trai va phai
export const LEFT_EYEBROW = [70, 63, 105, 66, 107];
export const RIGHT_EYEBROW = [336, 296, 334, 293, 300];

// Cac doan noi chuan cua luoi khuon mat de ve do hoa theo doi mat
export const FACIAL_TESSELLATION_LINES: [number, number][] = [
  // Tu tran xuong song mui
  [10, 151], [151, 9], [9, 8], [8, 168], [168, 6], [6, 197], [197, 195], [195, 5], [5, 4], [4, 1],
  // Tu mui sang hai ben ma
  [1, 2], [2, 94], [94, 19],
  [1, 129], [129, 203], [203, 98], [98, 97], [97, 2],
  [1, 358], [358, 423], [423, 327], [327, 326], [326, 2],
  // Tu ma xuong quai ham
  [234, 127], [127, 162], [162, 21], [21, 54],
  [454, 356], [356, 389], [389, 251], [251, 284],
  // Tu long may sang thai duong
  [107, 55], [55, 65], [65, 52], [52, 53], [53, 46],
  [336, 285], [285, 295], [295, 282], [282, 283], [283, 276],
  // Duong noi cam va ham duoi
  [152, 148], [148, 176], [176, 149], [149, 150], [150, 136],
  [152, 377], [377, 400], [400, 378], [378, 379], [379, 365],
];

export interface EyeMetrics {
  leftEAR: number;
  rightEAR: number;
  avgEAR: number;
  // Do lech cua con nguoi so voi tam hai khoe mat (da chuan hoa theo khoang cach 2 khoe mat)
  leftIrisH: number;
  leftIrisV: number;
  rightIrisH: number;
  rightIrisV: number;
  rawGazeX: number;
  rawGazeY: number;
  // Cac truong tuong thich nguoc cho bang dieu khien phien ban cu
  avgIrisH: number;
  avgIrisV: number;
  rawIrisH: number;
  rawIrisV: number;
  compensatedIrisH: number;
  compensatedIrisV: number;
  // Uoc luong goc quay/cui cua dau
  headYaw: number;
  headPitch: number;
  // Toa do huong nhin sau xu ly
  compensatedGazeX: number;
  compensatedGazeY: number;
  // Chat luong nhan dien va cac moc toa do tho de ve len khung hinh
  faceDetected: boolean;
  confidence: number;
  leftIrisCenter: Point;
  rightIrisCenter: Point;
  leftCanthusOuter: Point;
  leftCanthusInner: Point;
  rightCanthusInner: Point;
  rightCanthusOuter: Point;
}

/**
 * Ham phan tich hinh hoc mat cot loi tu 478 diem moc cua mo hinh MediaPipe FaceMesh.
 *
 * Dau vao: Mang toa do chuan hoa tu 0 den 1 (`landmarks`) gom toi thieu 468 diem moc khuon mat.
 * Dau ra: Doi tuong `EyeMetrics` chua chi so mo mat `EAR`, vector huong liec theo duong noi khoe mat
 * (thuat toan chieu len duong co so noi 2 khoe mat), goc quay dau (`headYaw`, `headPitch`) va do tin cay `confidence`.
 *
 * Nguyen ly cot loi: Lay duong thang noi 2 khoe mat gan co dinh tren xuong so lam he quy chieu thay vi mi mat,
 * giup triet tieu hoan toan loi dao nguoc huong nhin xuong khi mi tren tu nhien sup xuong theo con nguoi.
 */
export function analyzeEyes(landmarks: Point[] | undefined): EyeMetrics | null {
  if (!landmarks || landmarks.length < 468) {
    return null;
  }

  // Ham noi bo lay toa do diem moc an toan theo chi so (tra ve 0 neu thieu diem)
  const getPoint = (idx: number): Point => {
    return landmarks[idx] || { x: 0, y: 0, z: 0 };
  };

  // 1. Cac diem khoe mat (moc co dinh tren xuong so, khong bi di chuyen khi chop mat)
  const leftOuterPt = getPoint(EYE_INDICES.leftOuter);   // Diem 33: khoe ngoai mat trai (phia tai trai)
  const leftInnerPt = getPoint(EYE_INDICES.leftInner);   // Diem 133: khoe trong mat trai (phia song mui)
  const rightInnerPt = getPoint(EYE_INDICES.rightInner); // Diem 362: khoe trong mat phai (phia song mui)
  const rightOuterPt = getPoint(EYE_INDICES.rightOuter); // Diem 263: khoe ngoai mat phai (phia tai phai)

  // Cac diem mi tren va mi duoi de tinh ty le mo mat EAR (Eye Aspect Ratio)
  const leftTopPt = getPoint(EYE_INDICES.leftTop);
  const leftBottomPt = getPoint(EYE_INDICES.leftBottom);
  const leftTopPt2 = getPoint(EYE_INDICES.leftTop2);
  const leftBottomPt2 = getPoint(EYE_INDICES.leftBottom2);

  const rightTopPt = getPoint(EYE_INDICES.rightTop);
  const rightBottomPt = getPoint(EYE_INDICES.rightBottom);
  const rightTopPt2 = getPoint(EYE_INDICES.rightTop2);
  const rightBottomPt2 = getPoint(EYE_INDICES.rightBottom2);

  // Tinh ty le mo mat EAR = trung binh 2 khoang cach doc chia cho be rong ngang cua mat
  const left_v1 = dist2D(leftTopPt, leftBottomPt);
  const left_v2 = dist2D(leftTopPt2, leftBottomPt2);
  const left_h = Math.max(0.001, dist2D(leftOuterPt, leftInnerPt));
  const leftEAR = (left_v1 + left_v2) / (2 * left_h);

  const right_v1 = dist2D(rightTopPt, rightBottomPt);
  const right_v2 = dist2D(rightTopPt2, rightBottomPt2);
  const right_h = Math.max(0.001, dist2D(rightInnerPt, rightOuterPt));
  const rightEAR = (right_v1 + right_v2) / (2 * right_h);

  const avgEAR = (leftEAR + rightEAR) / 2;

  // 2. Toa do tam mong mat (con nguoi)
  let leftIris = getPoint(EYE_INDICES.leftIris);
  let rightIris = getPoint(EYE_INDICES.rightIris);

  // Du phong hinh hoc: neu khong co diem tam mong mat (x=0, y=0) thi lay tam trung binh cua khung mat
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
  // 3. THUAT TOAN CHIEU DUONG NOI KHOE MAT (CANTHAL BASELINE PROJECTION)
  // Giup on dinh huong nhin khi nheo mat, sup mi hoac nghieng dau
  // =========================================================================
  // Tren khung hinh camera tho (chua lat guong):
  // Mat trai cua nguoi dung: khoe ngoai = 33 (x nho), khoe trong = 133 (x lon).
  // Buoc 3a (Mat trai): Dung vector duong co so di tu khoe ngoai (33) toi khoe trong (133).
  const blx_L = leftInnerPt.x - leftOuterPt.x;
  const bly_L = leftInnerPt.y - leftOuterPt.y;
  // Chieu dai khoang cach giua 2 khoe mat trai (chan duoi 0.001 de tranh chia cho 0)
  const len_L = Math.max(0.001, Math.hypot(blx_L, bly_L));
  // Vector don vi u = (ux_L, uy_L) nam doc theo truc ngang mat trai (huong ve phia song mui)
  const ux_L = blx_L / len_L;
  const uy_L = bly_L / len_L;
  // Xoay vector u goc 90 do theo chieu kim dong ho de lay vector phap tuyen v huong XUONG DUOI
  const vx_L = -uy_L;
  const vy_L = ux_L;

  // Tinh trung diem giua 2 khoe mat trai lam goc toa do (0, 0) cua mat trai
  const midX_L = (leftOuterPt.x + leftInnerPt.x) / 2;
  const midY_L = (leftOuterPt.y + leftInnerPt.y) / 2;
  // Vector do lech cua tam con nguoi mat trai so voi goc trung diem
  const dx_L = leftIris.x - midX_L;
  const dy_L = leftIris.y - midY_L;

  // Chieu vector do lech len he truc (u, v) bang tich vo huong roi chia cho len_L de chuan hoa theo be rong mat:
  // - Chieu ngang: duong (+) khi con nguoi lech ve khoe trong/mui, am (-) khi lech ve khoe ngoai/tai
  const leftIrisH_proj = (dx_L * ux_L + dy_L * uy_L) / len_L;
  // - Chieu doc: duong (+) khi con nguoi nhin XUONG, am (-) khi con nguoi nhin LEN
  const leftIrisV_proj = (dx_L * vx_L + dy_L * vy_L) / len_L;

  // Mat phai cua nguoi dung: khoe trong = 362 (x nho), khoe ngoai = 263 (x lon).
  // Buoc 3b (Mat phai): Dung vector duong co so di tu khoe trong (362) toi khoe ngoai (263).
  const blx_R = rightOuterPt.x - rightInnerPt.x;
  const bly_R = rightOuterPt.y - rightInnerPt.y;
  // Chieu dai khoang cach giua 2 khoe mat phai
  const len_R = Math.max(0.001, Math.hypot(blx_R, bly_R));
  // Vector don vi u = (ux_R, uy_R) nam doc theo truc ngang mat phai (huong ve phia tai phai)
  const ux_R = blx_R / len_R;
  const uy_R = bly_R / len_R;
  // Vector phap tuyen v vuong goc truc mat phai, chi huong XUONG DUOI trong khong gian anh
  const vx_R = -uy_R;
  const vy_R = ux_R;

  // Trung diem 2 khoe mat phai lam goc toa do cho mat phai
  const midX_R = (rightInnerPt.x + rightOuterPt.x) / 2;
  const midY_R = (rightInnerPt.y + rightOuterPt.y) / 2;
  // Vector do lech cua tam con nguoi mat phai so voi trung diem
  const dx_R = rightIris.x - midX_R;
  const dy_R = rightIris.y - midY_R;

  // Chieu tich vo huong len truc ngang & truc doc cua mat phai roi chia len_R de chuan hoa:
  // - Chieu ngang: duong (+) khi lech ve khoe ngoai/tai, am (-) khi lech ve khoe trong/mui
  const rightIrisH_proj = (dx_R * ux_R + dy_R * uy_R) / len_R;
  // - Chieu doc: duong (+) khi nhin XUONG, am (-) khi nhin LEN
  const rightIrisV_proj = (dx_R * vx_R + dy_R * vy_R) / len_R;

  // =========================================================================
  // 4. QUY DOI TOA DO LAT GUONG SELFIE & HOA TRON TRONG SO HAI MAT
  // =========================================================================
  // O che do guong selfie (giong hinh nguoi dung nhin thay tren man hinh):
  // - Khi nguoi dung nhin sang PHAI:
  //   Mat trai nhin ve phia mui (khoe trong) -> leftIrisH_proj duong (+)
  //   Mat phai nhin ve phia tai (khoe ngoai) -> rightIrisH_proj duong (+)
  // - Khi nguoi dung nhin sang TRAI:
  //   Ca leftIrisH_proj va rightIrisH_proj deu am (-)
  // - Khi nhin XUONG: ca leftIrisV_proj va rightIrisV_proj deu tang duong (+)
  // - Khi nhin LEN: ca leftIrisV_proj va rightIrisV_proj deu giam am (-)

  // Tinh trong so tin cay cho tung mat dua tren do mo mat EAR:
  // Mat nao mo to hon se it bi mi che va cho toa do con nguoi sac net hon
  const wL = Math.max(0.01, leftEAR - 0.08);
  const wR = Math.max(0.01, rightEAR - 0.08);
  const wSum = wL + wR;

  // Huong liec ngang rawGazeX: dao dau (-) de nhin sang PHAI man hinh ra so duong (+X) va TRAI ra so am (-X)
  const rawGazeX = -((wL * leftIrisH_proj + wR * rightIrisH_proj) / wSum);
  // Huong liec doc rawGazeY: so duong (+Y) la nhin XUONG, so am (-Y) la nhin LEN
  const rawGazeY = (wL * leftIrisV_proj + wR * rightIrisV_proj) / wSum;

  // =========================================================================
  // 5. UOC LUONG TU THE DAU (YAW / PITCH) VA DO TIN CAY
  // =========================================================================
  const nose = getPoint(EYE_INDICES.noseTip);
  const chin = getPoint(EYE_INDICES.chin);
  const glabella = getPoint(EYE_INDICES.glabella);
  const leftCheek = getPoint(EYE_INDICES.leftCheek);
  const rightCheek = getPoint(EYE_INDICES.rightCheek);

  const faceWidth = Math.max(0.001, dist2D(leftCheek, rightCheek));
  const faceHeight = Math.max(0.001, dist2D(glabella, chin));

  // Goc quay ngang dau (headYaw): do do lech dau mui so voi trung diem hai ma
  const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
  const headYaw = (faceCenterX - nose.x) / (faceWidth * 0.5);

  // Goc cui/ngang dau (headPitch): ty le chieu dai nua mat tren (an duong -> mui) so voi toan chieu dai
  // Khi cui xuong: khoang cach tu mui den cam (dBottom) ngan lai, pitchRatio > 0.45 -> headPitch duong
  const dTop = Math.max(0.001, dist2D(glabella, nose));
  const dBottom = Math.max(0.001, dist2D(nose, chin));
  const pitchRatio = dTop / (dTop + dBottom);
  // Moc trung tinh khoang 0.45; nhan he so 3.5 de khuech dai do nhay goc cui/ngang
  const headPitch = (pitchRatio - 0.45) * 3.5;

  // Giu nguyen toa do mong mat thuan (chi dung vi tri con nguoi so voi khoe mat cho thao tac dieu khien)
  const compensatedGazeX = rawGazeX;
  const compensatedGazeY = rawGazeY;

  // Tinh do tin cay (0.2 -> 0.99) dua tren kich thuoc khuon mat hop le va muc do mo mat
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

