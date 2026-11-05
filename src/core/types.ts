import type { GameDate } from './date';

export const SCHEMA_VERSION = 2;

export type CheckLevel = 'min' | 'ideal';

/** days は 0=月 … 6=日 */
export type Frequency =
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: number[] }
  | { kind: 'weekly'; times: number };

export type BuildingKind = 'library' | 'bank' | 'news' | 'gym' | 'school' | 'plaza' | 'kura';

/** check＝自分でチェックする目標、diary＝日記（文字数で自動判定） */
export type GoalType = 'check' | 'diary';

/** from 以降に有効な値。リストは from の昇順 */
export interface Timed<T> {
  from: GameDate;
  value: T;
}

export interface GoalText {
  name: string;
  ideal: string;
  /** null なら最低ラインなし */
  minimum: string | null;
  /** 日記のみ：「理想」になる文字数 */
  idealChars?: number;
}

export interface Goal {
  id: string;
  type: GoalType;
  building: BuildingKind;
  createdOn: GameDate;
  /** この日以降は対象外（アーカイブ）。null なら有効 */
  archivedFrom: GameDate | null;
  text: Timed<GoalText>[];
  frequency: Timed<Frequency>[];
}

export interface Upgrade {
  date: GameDate;
  goalId: string;
}

export interface Todo {
  id: string;
  title: string;
  due: GameDate | null;
  createdOn: GameDate;
  doneOn: GameDate | null;
}

export type FacilityKind = 'bench' | 'sakura' | 'stall' | 'teahouse' | 'bathhouse' | 'shrine';

export interface FacilityPurchase {
  id: string;
  kind: FacilityKind;
  date: GameDate;
}

/** 保存するのは「記録」だけ。コイン・やる気・建物の状態は simulate() で毎回計算する */
export interface SaveData {
  schemaVersion: typeof SCHEMA_VERSION;
  startDate: GameDate;
  /** 1日の区切り時刻（0〜6時） */
  dayStartHour: number;
  /** これまでに見た最新のゲーム日。時計が戻ってもこれより前には戻らない */
  lastSeenDate: GameDate;
  goals: Goal[];
  /** checks[日付][目標ID]（日記の目標は使わない） */
  checks: Record<GameDate, Record<string, CheckLevel>>;
  /** diary[日付] = 本文 */
  diary: Record<GameDate, string>;
  todos: Todo[];
  facilities: FacilityPurchase[];
  restDays: GameDate[];
  /** 実行した順に並ぶ */
  upgrades: Upgrade[];
  /** 朝のまとめを最後に確認した「確定済みの日」 */
  summarySeenDate: GameDate | null;
  lastBackupDate: GameDate | null;
  /** 保存のたびに +1（複数タブでの上書き検知用） */
  revision: number;
}
