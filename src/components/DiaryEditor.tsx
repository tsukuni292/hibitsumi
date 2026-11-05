// 日記の入力欄。入力が止まって少したったら自動保存する。
// 書きかけが消えないよう、欄を離れたとき・画面を隠したとき・閉じるときにも保存する。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action } from '../core/actions';
import type { GameDate } from '../core/date';
import { idealCharsOn } from '../core/goals';
import { DIARY_MAX_LENGTH, diaryChars, diaryLevel } from '../core/rules';
import type { Goal, SaveData } from '../core/types';

interface Props {
  save: SaveData;
  goal: Goal;
  date: GameDate;
  dispatch: (a: Action) => boolean;
}

const SAVE_DELAY_MS = 600;

export function DiaryEditor({ save, goal, date, dispatch }: Props) {
  const saved = save.diary[date] ?? '';
  const [text, setText] = useState(saved);
  const [status, setStatus] = useState<'saved' | 'editing' | 'error'>('saved');
  // 保存待ちの本文と、その日付（日付が変わっても前の日の分を正しく保存するため）
  const pending = useRef<{ date: GameDate; text: string } | null>(null);
  const timer = useRef<number | null>(null);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const ok = dispatchRef.current({ type: 'setDiary', date: p.date, text: p.text });
    setStatus(ok ? 'saved' : 'error');
  }, []);

  // 別タブでの更新などで保存済みの内容が変わったら、書きかけがなければ取り込む
  useEffect(() => {
    if (!pending.current) setText(saved);
  }, [saved]);

  // 日付が変わる・画面から消えるときは、書きかけを先に保存する
  useEffect(() => {
    setText(save.diary[date] ?? '');
    return () => flush();
    // save.diary は日付が変わったときの初期値にだけ使う（依存に入れると入力のたびに巻き戻る）
  }, [date, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  const onChange = (value: string) => {
    setText(value);
    setStatus('editing');
    pending.current = { date, text: value };
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
  };

  const ideal = idealCharsOn(goal, date);
  const n = diaryChars(text);
  const level = diaryLevel(text, ideal);
  const left = Math.max(0, ideal - n);

  return (
    <div className="diary-editor">
      <textarea
        value={text}
        onChange={e => onChange(e.target.value)}
        onBlur={flush}
        maxLength={DIARY_MAX_LENGTH}
        rows={4}
        placeholder="今日あったこと、感じたこと、明日やりたいこと…"
        aria-label={`${date} の日記`}
      />
      <div className="diary-meta">
        <span className={`diary-badge level-${level ?? 'none'}`}>{level === 'ideal' ? '理想達成' : level === 'min' ? '最低達成' : 'まだ'}</span>
        <span>{n}文字{level !== 'ideal' ? `（理想まであと${left}文字）` : ''}</span>
        <span className="hint">{status === 'editing' ? '入力中…' : status === 'error' ? '保存できませんでした' : '保存済み'}</span>
      </div>
    </div>
  );
}
