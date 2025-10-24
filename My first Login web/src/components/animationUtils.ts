export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// cubic-bezier evaluator: given control points (x1,y1,x2,y2) returns easing(t)
// Uses binary search to invert x(t) to find t for given x, then returns y(t)
export function cubicBezierEasing(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t;

  return (x: number) => {
    // binary search for t given x
    let low = 0, high = 1, mid = 0;
    for (let i = 0; i < 25; i++) {
      mid = (low + high) / 2;
      const xEst = sampleCurveX(mid);
      if (Math.abs(xEst - x) < 1e-6) break;
      if (xEst > x) high = mid; else low = mid;
    }
    return sampleCurveY(mid);
  };
}

export const snap = (value: number, interval = 50) => (interval > 0 ? Math.round(value / interval) * interval : value);
