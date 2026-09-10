import type { Point } from "./types";
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const mix = (a: Point, b: Point, k: number): Point => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
});
export const angle = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x);
export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const path = (points: Point[]) =>
  points
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
export const length = (points: Point[]) =>
  points.slice(1).reduce((sum, p, i) => sum + dist(points[i], p), 0);
export function along(points: Point[], distance: number): Point {
  let remaining = distance;
  for (let i = 1; i < points.length; i++) {
    const l = dist(points[i - 1], points[i]);
    if (remaining <= l)
      return mix(points[i - 1], points[i], clamp(remaining / l, 0, 1));
    remaining -= l;
  }
  return { ...points[points.length - 1] };
}
export function project(p: Point, points: Point[]) {
  let best = points[0],
    error = Infinity,
    heading = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b.x - a.x,
      dy = b.y - a.y;
    const q = mix(
      a,
      b,
      clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1),
    );
    const e = dist(p, q);
    if (e < error) {
      best = q;
      error = e;
      heading = angle(a, b);
    }
  }
  return { point: best, error, heading };
}
export const timeLabel = (t: number) =>
  `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
