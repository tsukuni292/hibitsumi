import type { GameDate } from './date';
import { DIARY_DEFAULT_IDEAL_CHARS } from './rules';
import { SCHEMA_VERSION, type BuildingKind, type Frequency, type Goal, type GoalText, type GoalType, type SaveData } from './types';

export const BUILDING_LABEL: Record<BuildingKind, string> = {
  library: '図書館',
  bank: '銀行',
  news: '新聞社',
  gym: '訓練場',
  school: '学舎',
  plaza: '広場',
  kura: '蔵',
  custom: '自分で作る',
};

/** 目標の建物の名前（自分で作った建物はその名前） */
export function buildingName(goal: Pick<Goal, 'building' | 'look'>): string {
  return goal.building === 'custom' ? goal.look?.name ?? '建物' : BUILDING_LABEL[goal.building];
}

interface Preset {
  type: GoalType;
  building: BuildingKind;
  text: GoalText;
  frequency: Frequency;
}

export const DIARY_PRESET: Preset = {
  type: 'diary',
  building: 'kura',
  text: { name: '日記', ideal: `${DIARY_DEFAULT_IDEAL_CHARS}文字以上`, minimum: '一言', idealChars: DIARY_DEFAULT_IDEAL_CHARS },
  frequency: { kind: 'daily' },
};

// ユーザーが挙げた目標をもとにした初期値（設定画面で変更できる）
export const DEFAULT_GOALS: Preset[] = [
  { type: 'check', building: 'library', text: { name: '英語学習', ideal: '30分', minimum: '単語5個' }, frequency: { kind: 'daily' } },
  { type: 'check', building: 'bank', text: { name: 'FP学習', ideal: 'テキスト1節＋問題', minimum: '問題を3問' }, frequency: { kind: 'daily' } },
  { type: 'check', building: 'news', text: { name: 'ニュースを読む', ideal: '記事を3本', minimum: '見出しを読む' }, frequency: { kind: 'daily' } },
  { type: 'check', building: 'gym', text: { name: 'トレーニング', ideal: '30分', minimum: 'ストレッチ5分' }, frequency: { kind: 'weekly', times: 3 } },
  // 大学の課題は毎日の目標ではなく、提出物があるときだけ（課題リストで期限を管理）
  { type: 'check', building: 'school', text: { name: '大学の課題', ideal: '期限内に提出', minimum: null }, frequency: { kind: 'assignments' } },
  { type: 'check', building: 'plaza', text: { name: '掃除', ideal: '1部屋', minimum: '机の上だけ' }, frequency: { kind: 'weekly', times: 2 } },
  DIARY_PRESET,
];

export function createInitialSave(today: GameDate, newId: () => string, dayStartHour = 4): SaveData {
  const goals: Goal[] = DEFAULT_GOALS.map(p => ({
    id: newId(),
    type: p.type,
    building: p.building,
    createdOn: today,
    archivedFrom: null,
    text: [{ from: today, value: p.text }],
    frequency: [{ from: today, value: p.frequency }],
  }));
  return {
    schemaVersion: SCHEMA_VERSION,
    startDate: today,
    dayStartHour,
    lastSeenDate: today,
    goals,
    checks: {},
    diary: {},
    todos: [],
    assignments: [],
    weeklyAssignments: [],
    placements: {},
    events: [],
    terrainLog: [],
    taxFrom: today,
    facilities: [],
    restDays: [],
    upgrades: [],
    summarySeenDate: null,
    lastBackupDate: null,
    revision: 0,
  };
}
