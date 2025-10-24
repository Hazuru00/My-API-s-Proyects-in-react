import { describe, it, expect } from 'vitest';
import { lerp, snap, clamp, cubicBezierEasing } from '../animationUtils';

describe('animationUtils', () => {
  it('lerp interpolates correctly', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('snap rounds to interval', () => {
    expect(snap(123, 50)).toBe(100);
    expect(snap(149, 50)).toBe(150);
  });

  it('clamp bounds values', () => {
    expect(clamp(-1,0,1)).toBe(0);
    expect(clamp(0.5,0,1)).toBe(0.5);
    expect(clamp(2,0,1)).toBe(1);
  });

  it('cubic bezier easing is monotonic', () => {
    const f = cubicBezierEasing(0.25,0.1,0.25,1);
    const a = f(0.0), b = f(0.5), c = f(1.0);
    expect(a).toBeCloseTo(0, 5);
    expect(c).toBeCloseTo(1, 5);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
