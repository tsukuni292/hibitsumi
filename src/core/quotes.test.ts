import { describe, expect, it } from 'vitest';
import { formatSource, QUOTES, quoteFor } from './quotes';

describe('名言データ', () => {
  it('たくさんあり、すべてに本文・意味・人物・出典がある', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(50);
    for (const q of QUOTES) {
      expect(q.text.trim(), JSON.stringify(q)).not.toBe('');
      expect(q.meaning.trim(), q.text).not.toBe('');
      expect(q.author.trim(), q.text).not.toBe('');
      expect(q.work.trim(), q.text).not.toBe('');
    }
  });

  it('同じ名言が重複していない', () => {
    const texts = QUOTES.map(q => q.text);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe('名言の選び方', () => {
  it('タップを続けると、一周するまで同じ名言は出ない', () => {
    const seen = new Set(Array.from({ length: QUOTES.length }, (_, n) => quoteFor(5, n)?.text));
    expect(seen.size).toBe(QUOTES.length);
  });

  it('同じ日・同じ回数なら同じ名言、日が変わると始まりが変わる', () => {
    expect(quoteFor(10, 3)).toEqual(quoteFor(10, 3));
    expect(quoteFor(10, 0)?.text).not.toBe(quoteFor(11, 0)?.text);
    expect(quoteFor(10, 0, [])).toBeNull();
  });

  it('出典の表示', () => {
    expect(formatSource({ text: 't', meaning: 'm', author: '荀子', work: '『荀子』勧学篇' })).toBe('『荀子』勧学篇');
    expect(formatSource({ text: 't', meaning: 'm', author: '宮本武蔵', work: '『五輪書』水之巻' })).toBe('宮本武蔵　『五輪書』水之巻');
    expect(formatSource({ text: 't', meaning: 'm', author: 'ことわざ', work: '日本のことわざ' })).toBe('ことわざ（日本のことわざ）');
  });
});
