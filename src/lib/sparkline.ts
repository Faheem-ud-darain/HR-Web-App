// Shared helper for the small inline SVG bar+line charts on the dashboard
// stat cards (ActiveEmployeesCard, AvgHoursWorkedCard). Turns a handful of
// (x, y) points into a smooth curve instead of a jagged polyline — a
// standard Catmull-Rom-to-cubic-Bezier conversion (tension 1/6), the same
// technique behind most "nice looking" sparklines/mini trend lines.
export interface SparklinePoint { x: number; y: number; }

export function smoothLinePath(points: SparklinePoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

// Closes a smoothed line into a fillable region by dropping straight down
// to `baseline` at the last point, running back along the baseline to
// under the first point, and closing the path — the shape a gradient-fill
// "area sparkline" needs. Used instead of a separate bar chart so the card
// reads as one clean shape (line + soft fill) rather than two competing
// chart idioms fighting for attention in a small space.
export function smoothAreaPath(points: SparklinePoint[], baseline: number): string {
  if (points.length === 0) return '';
  const line = smoothLinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x.toFixed(2)},${baseline} L ${first.x.toFixed(2)},${baseline} Z`;
}
