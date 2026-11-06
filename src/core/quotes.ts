// 住民が教えてくれる名言。データは quotes.json（出典を確認できたものだけ）
import data from './quotes.json';

export interface Quote {
  text: string;
  /** やさしい解説 */
  meaning: string;
  /** 人物名、または「ことわざ」 */
  author: string;
  /** 出典（書名・篇・章など） */
  work: string;
  /** 原文や補足 */
  note?: string;
}

export const QUOTES: Quote[] = data as Quote[];

/** 表示用の出典（書名に人物名が含まれていれば重ねて書かない） */
export function formatSource(q: Quote): string {
  if (q.author === 'ことわざ') return q.work ? `ことわざ（${q.work}）` : 'ことわざ';
  if (q.work.includes(q.author)) return q.work;
  return `${q.author}　${q.work}`;
}

/**
 * n 番目に見せる名言。日ごとに始まりをずらし、互いに素な歩幅で並べ替えて、続けて同じ系統が出にくくする。
 * 同じ日・同じ n なら必ず同じ名言（ランダムにしないのでテストできる）。
 */
export function quoteFor(dayNumber: number, n: number, list: Quote[] = QUOTES): Quote | null {
  const len = list.length;
  if (len === 0) return null;
  let stride = 7;
  while (gcd(stride, len) !== 1) stride += 1;
  const start = (((dayNumber * 13) % len) + len) % len;
  const idx = (((start + n * stride) % len) + len) % len;
  return list[idx] ?? null;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
