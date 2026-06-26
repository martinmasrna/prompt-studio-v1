// Shared time formatting for result/issue timelines. Both an absolute string
// (shown on hover) and a coarse relative string ("3 days ago") are derived from
// the same Unix-second timestamps the backend stores.

export function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

const relativeTimeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536000], ['month', 2592000], ['day', 86400],
  ['hour', 3600], ['minute', 60], ['second', 1],
];

export function formatRelative(seconds: number): string {
  const delta = seconds - Date.now() / 1000;
  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    if (Math.abs(delta) >= unitSeconds || unit === 'second') {
      return relativeTimeFormat.format(Math.round(delta / unitSeconds), unit);
    }
  }
  return relativeTimeFormat.format(0, 'second');
}
