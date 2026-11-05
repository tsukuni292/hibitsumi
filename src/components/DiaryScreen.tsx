import { addDays, type GameDate } from '../core/date';
import { diaryChars } from '../core/rules';
import type { SaveData } from '../core/types';
import { formatDate } from '../app/format';

interface Props {
  save: SaveData;
  today: GameDate;
  onEdit: () => void;
}

/** 日記帳：これまでの日記を新しい順に読む（書き換えは「今日」画面で今日・前日のみ） */
export function DiaryScreen({ save, today, onEdit }: Props) {
  const yesterday = addDays(today, -1);
  const entries = Object.entries(save.diary)
    .filter(([, text]) => text.trim() !== '')
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));

  return (
    <div className="screen">
      <h1 className="screen-title">日記帳</h1>
      <p className="hint">これまでに書いた日記：{entries.length}日分</p>
      {entries.length === 0 ? (
        <p className="empty">まだ日記がありません。「今日」画面の日記の欄から書けます。</p>
      ) : (
        <ul className="diary-list">
          {entries.map(([date, text]) => (
            <li key={date} className="diary-entry">
              <div className="diary-entry-head">
                <span className="diary-date">{formatDate(date)}</span>
                <span className="hint">{diaryChars(text)}文字</span>
                {(date === today || date === yesterday) && (
                  <button type="button" className="link" onClick={onEdit}>「今日」画面で直す</button>
                )}
              </div>
              <p className="diary-text">{text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
