/**
 * Shared utilities for Frostfall
 */

/** Simple UUID v4 generator (no external dependencies) */
export function randomUUID(): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const bytes = Array.from({ length: 16 }, () => (Math.random() * 256) | 0);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return (
    hex(bytes[0]) + hex(bytes[1]) + hex(bytes[2]) + hex(bytes[3]) + '-' +
    hex(bytes[4]) + hex(bytes[5]) + '-' +
    hex(bytes[6]) + hex(bytes[7]) + '-' +
    hex(bytes[8]) + hex(bytes[9]) + '-' +
    hex(bytes[10]) + hex(bytes[11]) + hex(bytes[12]) + hex(bytes[13]) + hex(bytes[14]) + hex(bytes[15])
  );
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Format a duration in ms to human readable */
export function formatDuration(ms: number): string {
  const s  = Math.floor(ms / 1000);
  const m  = Math.floor(s / 60);
  const h  = Math.floor(m / 60);
  const d  = Math.floor(h / 24);
  if (d > 0)  return `${d}d ${h % 24}h`;
  if (h > 0)  return `${h}h ${m % 60}m`;
  if (m > 0)  return `${m}m ${s % 60}s`;
  return `${s}s`;
}
