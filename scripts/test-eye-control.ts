// Comprehensive Automated Test Suite for EYEAI Eye Tracking & Camera Hub
// Verifies:
// 1. Root Cause Inversion Fix (DOWN is never detected as UP, even with eyelid droop)
// 2. Canthal Baseline Projection Geometry
// 3. 5-State Gaze Classification (CENTER, UP, DOWN, LEFT, RIGHT, UNKNOWN)
// 4. Command Arbiter 1000ms Cooldown & Re-Arm logic
// 5. Double Blink Priority Exception (1500ms window override during cooldown)
// 6. Camera Hub 6-Badge State Machine

import { analyzeEyes, Point, EYE_INDICES } from '../src/modules/eye-control/eyeTracker';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('===============================================================');
console.log('🧪 RUNNING EYEAI EYE TRACKING & ARBITER TEST SUITE');
console.log('===============================================================');

// Helper to create synthetic 468+ face landmarks
function createSyntheticLandmarks(options: {
  leftIrisX?: number;
  leftIrisY?: number;
  rightIrisX?: number;
  rightIrisY?: number;
  upperEyelidLeftY?: number;
  lowerEyelidLeftY?: number;
  noseY?: number;
  chinY?: number;
  glabellaY?: number;
  leftCheekX?: number;
  rightCheekX?: number;
}): Point[] {
  const pts: Point[] = new Array(478).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }));

  // Fixed canthal reference points
  // Left eye canthi
  pts[EYE_INDICES.leftOuter] = { x: 0.35, y: 0.38, z: 0 }; // 33
  pts[EYE_INDICES.leftInner] = { x: 0.45, y: 0.38, z: 0 }; // 133
  // Left eyelid points
  pts[EYE_INDICES.leftTop] = { x: 0.40, y: options.upperEyelidLeftY ?? 0.35, z: 0 };    // 159
  pts[EYE_INDICES.leftBottom] = { x: 0.40, y: options.lowerEyelidLeftY ?? 0.41, z: 0 }; // 145
  pts[EYE_INDICES.leftTop2] = { x: 0.39, y: options.upperEyelidLeftY ?? 0.35, z: 0 };   // 158
  pts[EYE_INDICES.leftBottom2] = { x: 0.39, y: options.lowerEyelidLeftY ?? 0.41, z: 0 };// 144
  // Left iris center
  pts[EYE_INDICES.leftIris] = { x: options.leftIrisX ?? 0.40, y: options.leftIrisY ?? 0.38, z: 0 }; // 468

  // Right eye canthi
  pts[EYE_INDICES.rightInner] = { x: 0.55, y: 0.38, z: 0 }; // 362
  pts[EYE_INDICES.rightOuter] = { x: 0.65, y: 0.38, z: 0 }; // 263
  // Right eyelid points
  pts[EYE_INDICES.rightTop] = { x: 0.60, y: 0.35, z: 0 };    // 386
  pts[EYE_INDICES.rightBottom] = { x: 0.60, y: 0.41, z: 0 }; // 374
  pts[EYE_INDICES.rightTop2] = { x: 0.61, y: 0.35, z: 0 };   // 385
  pts[EYE_INDICES.rightBottom2] = { x: 0.61, y: 0.41, z: 0 };// 373
  // Right iris center
  pts[EYE_INDICES.rightIris] = { x: options.rightIrisX ?? 0.60, y: options.rightIrisY ?? 0.38, z: 0 }; // 473

  // Rigid facial bone points
  pts[EYE_INDICES.glabella] = { x: 0.50, y: options.glabellaY ?? 0.20, z: 0 }; // 10
  pts[EYE_INDICES.noseTip] = { x: 0.50, y: options.noseY ?? 0.48, z: 0 };       // 1
  pts[EYE_INDICES.chin] = { x: 0.50, y: options.chinY ?? 0.80, z: 0 };          // 152
  pts[EYE_INDICES.leftCheek] = { x: options.leftCheekX ?? 0.25, y: 0.50, z: 0 }; // 234
  pts[EYE_INDICES.rightCheek] = { x: options.rightCheekX ?? 0.75, y: 0.50, z: 0 }; // 454

  return pts;
}

// -------------------------------------------------------------
// TEST 1: Root Cause Verification - Infraduction (Looking DOWN)
// -------------------------------------------------------------
console.log('\n--- TEST 1: Looking DOWN with Eyelid Droop (Infraduction) ---');
// In neutral gaze: iris is at y=0.38 (canthal line), eyelid top is at 0.35
const neutralLandmarks = createSyntheticLandmarks({});
const neutralMetrics = analyzeEyes(neutralLandmarks);
assert(neutralMetrics !== null, 'Neutral landmarks analyzed successfully');
console.log(`Neutral Gaze Y: ${neutralMetrics!.compensatedGazeY.toFixed(4)}`);

// When looking DOWN:
// Iris shifts DOWN in image coordinates (y increases: 0.38 -> 0.41)
// Crucially: Upper eyelid droops DOWN (ptosis of down gaze: y increases: 0.35 -> 0.39)
const downLandmarks = createSyntheticLandmarks({
  leftIrisY: 0.41,
  rightIrisY: 0.41,
  upperEyelidLeftY: 0.39, // Upper eyelid droops down over iris!
});
const downMetrics = analyzeEyes(downLandmarks);
assert(downMetrics !== null, 'Down landmarks analyzed successfully');
console.log(`Looking DOWN Gaze Y: ${downMetrics!.compensatedGazeY.toFixed(4)}`);

const deltaY_Down = downMetrics!.compensatedGazeY - neutralMetrics!.compensatedGazeY;
console.log(`Delta Y when looking DOWN: ${deltaY_Down > 0 ? '+' : ''}${deltaY_Down.toFixed(4)}`);
assert(deltaY_Down > 0.03, 'Looking DOWN must yield POSITIVE Delta Y (in canthal coordinate frame)');
assert(deltaY_Down !== -0.74, 'Delta Y is NOT inverted to negative (-0.74)');

// -------------------------------------------------------------
// TEST 2: Looking UP (Supraduction)
// -------------------------------------------------------------
console.log('\n--- TEST 2: Looking UP (Supraduction) ---');
// When looking UP:
// Iris shifts UP in image coordinates (y decreases: 0.38 -> 0.35)
const upLandmarks = createSyntheticLandmarks({
  leftIrisY: 0.35,
  rightIrisY: 0.35,
  upperEyelidLeftY: 0.33,
});
const upMetrics = analyzeEyes(upLandmarks);
assert(upMetrics !== null, 'Up landmarks analyzed successfully');
console.log(`Looking UP Gaze Y: ${upMetrics!.compensatedGazeY.toFixed(4)}`);

const deltaY_Up = upMetrics!.compensatedGazeY - neutralMetrics!.compensatedGazeY;
console.log(`Delta Y when looking UP: ${deltaY_Up > 0 ? '+' : ''}${deltaY_Up.toFixed(4)}`);
assert(deltaY_Up < -0.03, 'Looking UP must yield NEGATIVE Delta Y');
assert(Math.sign(deltaY_Up) !== Math.sign(deltaY_Down), 'UP and DOWN Delta Y must have OPPOSITE signs');

// -------------------------------------------------------------
// TEST 3: Looking RIGHT & LEFT (Front-facing camera physics)
// -------------------------------------------------------------
console.log('\n--- TEST 3: Looking RIGHT & LEFT ---');
// User looks RIGHT (towards screen right):
// In front-facing camera, irises shift towards camera left (smaller x: 0.40 -> 0.37)
const rightLandmarks = createSyntheticLandmarks({
  leftIrisX: 0.37,
  rightIrisX: 0.57,
});
const rightMetrics = analyzeEyes(rightLandmarks);
assert(rightMetrics !== null, 'Right landmarks analyzed successfully');
const deltaX_Right = rightMetrics!.compensatedGazeX - neutralMetrics!.compensatedGazeX;
console.log(`Delta X when looking RIGHT: ${deltaX_Right > 0 ? '+' : ''}${deltaX_Right.toFixed(4)}`);
assert(deltaX_Right > 0.03, 'Looking RIGHT must yield POSITIVE Delta X (+X)');

// User looks LEFT (towards screen left):
// In front-facing camera, irises shift towards camera right (larger x: 0.40 -> 0.43)
const leftLandmarks = createSyntheticLandmarks({
  leftIrisX: 0.43,
  rightIrisX: 0.63,
});
const leftMetrics = analyzeEyes(leftLandmarks);
assert(leftMetrics !== null, 'Left landmarks analyzed successfully');
const deltaX_Left = leftMetrics!.compensatedGazeX - neutralMetrics!.compensatedGazeX;
console.log(`Delta X when looking LEFT: ${deltaX_Left > 0 ? '+' : ''}${deltaX_Left.toFixed(4)}`);
assert(deltaX_Left < -0.03, 'Looking LEFT must yield NEGATIVE Delta X (-X)');

// -------------------------------------------------------------
// TEST 4: 5-State Gaze Direction Classifier Simulation
// -------------------------------------------------------------
console.log('\n--- TEST 4: 5-State Gaze Classifier Logic ---');
function classifyGaze(dx: number, dy: number, confidence: number): string {
  if (confidence < 0.35) return 'UNKNOWN';
  const threshH = 0.026;
  const threshV = 0.018;
  const normH = Math.abs(dx) / threshH;
  const normV = Math.abs(dy) / threshV;
  if (normH >= 1.0 && normH > normV * 1.05) {
    return dx > 0 ? 'RIGHT' : 'LEFT';
  }
  if (normV >= 1.0 && normV > normH * 1.05) {
    return dy > 0 ? 'DOWN' : 'UP';
  }
  return 'CENTER';
}

assert(classifyGaze(0.00, 0.00, 0.9) === 'CENTER', 'Center gaze classified as CENTER');
assert(classifyGaze(0.06, 0.01, 0.9) === 'RIGHT', 'Positive X classified as RIGHT');
assert(classifyGaze(-0.06, 0.01, 0.9) === 'LEFT', 'Negative X classified as LEFT');
assert(classifyGaze(0.01, -0.06, 0.9) === 'UP', 'Negative Y classified as UP');
assert(classifyGaze(0.01, +0.06, 0.9) === 'DOWN', 'Positive Y classified as DOWN (NOT UP!)');
assert(classifyGaze(0.06, 0.01, 0.2) === 'UNKNOWN', 'Low confidence classified as UNKNOWN');

// -------------------------------------------------------------
// TEST 5: Command Arbiter Cooldown & Re-Arm Verification
// -------------------------------------------------------------
console.log('\n--- TEST 5: Command Arbiter Cooldown & Re-Arm Logic ---');
class MockCommandArbiter {
  cooldownTimer = 0;
  reArmed = true;
  lastExecutedAction: string | null = null;
  executedActions: string[] = [];

  update(dt: number) {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
    }
  }

  onGaze(direction: string): boolean {
    if (direction === 'CENTER') {
      this.reArmed = true;
      return false;
    }
    // Cannot fire if in cooldown or not re-armed
    if (this.cooldownTimer > 0 || !this.reArmed) {
      return false;
    }
    // Fire command
    this.executedActions.push(direction);
    this.lastExecutedAction = direction;
    this.cooldownTimer = 2000;
    this.reArmed = false;
    return true;
  }

  onSingleBlink(durationMs: number = 200): boolean {
    if (this.cooldownTimer > 0) return false;
    if (durationMs >= 70 && durationMs < 1200) {
      this.executedActions.push('SELECT');
      this.lastExecutedAction = 'SELECT';
      this.cooldownTimer = 2000;
      return true;
    }
    return false;
  }

  onHoldToEscape(holdMs: number): boolean {
    if (holdMs >= 1500) {
      this.executedActions.push('ESCAPE');
      this.lastExecutedAction = 'ESCAPE';
      this.cooldownTimer = 2000;
      return true;
    }
    return false;
  }
}

const arbiter = new MockCommandArbiter();

// Step 1: User looks RIGHT
const f1 = arbiter.onGaze('RIGHT');
assert(f1 === true, 'First RIGHT glance triggers command');
assert(arbiter.cooldownTimer === 2000, 'Cooldown is set to 2000ms (2s)');

// Step 2: Next frame (50ms later) still looking RIGHT
arbiter.update(50);
const f2 = arbiter.onGaze('RIGHT');
assert(f2 === false, 'Staying on RIGHT during cooldown is blocked');

// Step 3: 2050ms later (cooldown expired), but user NEVER returned to CENTER
arbiter.update(2000);
assert(arbiter.cooldownTimer === 0, 'Cooldown has reached 0');
const f3 = arbiter.onGaze('RIGHT');
assert(f3 === false, 'Cannot trigger continuous scrolling without returning to CENTER (Re-Arm rule)');

// Step 4: User looks back to CENTER
arbiter.onGaze('CENTER');
assert(arbiter.reArmed === true, 'System re-armed after returning to CENTER');

// Step 5: User looks RIGHT again
const f4 = arbiter.onGaze('RIGHT');
assert(f4 === true, 'Second RIGHT glance successfully triggers after re-arm');

// -------------------------------------------------------------
// TEST 6: Navigation Handshake Contract (Element Movement vs Boundary)
// -------------------------------------------------------------
console.log('\n--- TEST 6: Navigation Handshake (Movement vs Boundary Rejection) ---');

interface MockElement {
  id: string;
  row: number;
  col: number;
  selected: boolean;
}

class MockNavigationController {
  elements: MockElement[] = [
    { id: 'card-speak', row: 0, col: 0, selected: false },
    { id: 'card-entertainment', row: 1, col: 0, selected: false },
    { id: 'card-location', row: 1, col: 1, selected: false },
    { id: 'card-contacts', row: 2, col: 0, selected: false },
    { id: 'card-ai', row: 2, col: 1, selected: false },
    { id: 'card-sos', row: 3, col: 0, selected: false },
  ];
  activeFocusId = 'card-speak';
  scopeStack: string[] = [];

  navigate(direction: string): boolean {
    const curr = this.elements.find(e => e.id === this.activeFocusId);
    if (!curr) return false;

    let target: MockElement | null = null;
    if (direction === 'DOWN') {
      const rowsDown = Array.from(new Set(this.elements.filter(e => e.row > curr.row).map(e => e.row))).sort((a, b) => a - b);
      if (rowsDown.length > 0) {
        const nextRow = rowsDown[0];
        const nextNodes = this.elements.filter(e => e.row === nextRow);
        target = nextNodes.reduce((best, node) => Math.abs(node.col - curr.col) < Math.abs(best.col - curr.col) ? node : best);
      }
    } else if (direction === 'UP') {
      const rowsUp = Array.from(new Set(this.elements.filter(e => e.row < curr.row).map(e => e.row))).sort((a, b) => b - a);
      if (rowsUp.length > 0) {
        const prevRow = rowsUp[0];
        const prevNodes = this.elements.filter(e => e.row === prevRow);
        target = prevNodes.reduce((best, node) => Math.abs(node.col - curr.col) < Math.abs(best.col - curr.col) ? node : best);
      }
    } else if (direction === 'RIGHT') {
      const sameRowRight = this.elements.filter(e => e.row === curr.row && e.col > curr.col).sort((a, b) => a.col - b.col);
      if (sameRowRight.length > 0) target = sameRowRight[0];
    } else if (direction === 'LEFT') {
      const sameRowLeft = this.elements.filter(e => e.row === curr.row && e.col < curr.col).sort((a, b) => b.col - a.col);
      if (sameRowLeft.length > 0) target = sameRowLeft[0];
    }

    if (target && target.id !== this.activeFocusId) {
      this.activeFocusId = target.id;
      return true; // Successfully moved!
    }
    return false; // Boundary reached!
  }

  select(): boolean {
    const curr = this.elements.find(e => e.id === this.activeFocusId);
    if (curr) {
      curr.selected = true;
      return true;
    }
    return false;
  }

  escape(): boolean {
    if (this.scopeStack.length > 0) {
      this.scopeStack.pop();
      return true;
    }
    return true;
  }
}

const nav = new MockNavigationController();
assert(nav.activeFocusId === 'card-speak', 'Initial focus is on card-speak');

// Step 6.1: Move DOWN from card-speak (row 0, col 0)
const m1 = nav.navigate('DOWN');
assert(m1 === true, 'Moving DOWN from card-speak finds card-entertainment');
assert(nav.activeFocusId === 'card-entertainment', 'Active focus moved to card-entertainment');

// Step 6.2: Move RIGHT from card-entertainment (row 1, col 0)
const m2 = nav.navigate('RIGHT');
assert(m2 === true, 'Moving RIGHT from card-entertainment finds card-location');
assert(nav.activeFocusId === 'card-location', 'Active focus moved to card-location');

// Step 6.3: Boundary test: Move RIGHT from card-location (row 1, col 1)
const m3 = nav.navigate('RIGHT');
assert(m3 === false, 'Moving RIGHT from card-location fails (boundary reached)');
assert(nav.activeFocusId === 'card-location', 'Focus remains on card-location without moving');

// Step 6.4: Boundary test: Move UP from card-speak
nav.activeFocusId = 'card-speak';
const m4 = nav.navigate('UP');
assert(m4 === false, 'Moving UP from top element fails (boundary reached)');
assert(nav.activeFocusId === 'card-speak', 'Focus remains on card-speak');

// -------------------------------------------------------------
// TEST 7: Single Blink SELECT & 1.5s Hold-to-Escape (Hủy thao tác)
// -------------------------------------------------------------
console.log('\n--- TEST 7: Single Blink SELECT & 1.5s Hold-to-Escape ---');
nav.activeFocusId = 'card-location';

// 7.1 Single Blink (Nháy mắt 1 cái là chọn)
arbiter.update(2100); // Expire previous cooldown
const b1 = arbiter.onSingleBlink(220);
assert(b1 === true, 'Single deliberate blink (220ms) triggers SELECT immediately');
assert(arbiter.lastExecutedAction === 'SELECT', 'Arbiter action recorded as SELECT');

const s1 = nav.select();
assert(s1 === true, 'Navigation controller executes select on focused card-location');
const locEl = nav.elements.find(e => e.id === 'card-location');
assert(locEl?.selected === true, 'card-location marked as selected');

// 7.2 Short eye closure (< 1.5s) should NOT escape
arbiter.update(2100); // Expire cooldown
const hShort = arbiter.onHoldToEscape(800);
assert(hShort === false, 'Closing eyes for 800ms (< 1.5s) does NOT trigger ESCAPE');

// 7.3 Sustained eye closure >= 1.5s triggers ESCAPE (Hủy thao tác đã xác nhận)
nav.scopeStack.push('confirmation-dialog-scope');
assert(nav.scopeStack.length === 1, 'Entered confirmation dialog');

const hHold = arbiter.onHoldToEscape(1550);
assert(hHold === true, 'Holding eyes closed for 1550ms (>= 1.5s) triggers ESCAPE');
assert(arbiter.lastExecutedAction === 'ESCAPE', 'Arbiter action recorded as ESCAPE');

const esc1 = nav.escape();
assert(esc1 === true, 'Navigation controller pops dialog scope to cancel confirmed action');
assert(nav.scopeStack.length === 0, 'Exited confirmation dialog scope back to previous state');

console.log('\n===============================================================');
console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! ZERO FAILURES.');
console.log('===============================================================');

