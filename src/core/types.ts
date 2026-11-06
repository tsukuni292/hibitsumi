import type { GameDate } from './date';

export const SCHEMA_VERSION = 4;

export type CheckLevel = 'min' | 'ideal';

/** days は 0=月 … 6=日 */
export type Frequency =
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: number[] }
  | { kind: 'weekly'; times: number }
  /** 課題があるときだけ（毎日の達成率に入らず、課題リストの提出で評価する） */
  | { kind: 'assignments' };

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

/** 期限つきの提出物（「課題があるときだけ」の目標に属する） */
export interface Assignment {
  id: string;
  goalId: string;
  title: string;
  /** この日の終わりまでに完了すれば期限内 */
  due: GameDate;
  createdOn: GameDate;
  doneOn: GameDate | null;
  /** 毎週の課題から自動で出たもの（その毎週の課題のID） */
  weeklyId?: string;
  /** 前もって登録してあった（毎週の課題から出た）ので、出た当日の完了もコインの対象 */
  preRegistered?: true;
}

/** 毎週の課題。出る曜日になると、課題リストに自動で1件追加する */
export interface WeeklyAssignment {
  id: string;
  goalId: string;
  title: string;
  /** 課題が出る曜日（0=月 … 6=日） */
  issueDay: number;
  /** 締切の曜日。出た日の翌日以降で最初のこの曜日（出る曜日と同じなら1週間後） */
  dueDay: number;
  createdOn: GameDate;
  /** この日の分まで課題を出し終えた */
  issuedThrough: GameDate;
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
  assignments: Assignment[];
  weeklyAssignments: WeeklyAssignment[];
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
