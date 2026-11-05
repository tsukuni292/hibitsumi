import { WEEKDAY_LABELS, weekday, type GameDate } from '../core/date';

export function formatDate(d: GameDate): string {
  const [, m, day] = d.split('-');
  return `${Number(m)}月${Number(day)}日(${WEEKDAY_LABELS[weekday(d)]})`;
}

export function formatShort(d: GameDate): string {
  const [, m, day] = d.split('-');
  return `${Number(m)}/${Number(day)}`;
}

export function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r > 0 ? `+${r}` : `${r}`;
}
