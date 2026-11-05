// テスト用の記録づくりヘルパー
import { addDays, type GameDate } from './date';
import { SCHEMA_VERSION, type CheckLevel, type Frequency, type Goal, type SaveData } from './types';

export const MON = '2026-11-02'; // 月曜

export function goal(id: string, frequency: Frequency, opts: { createdOn?: GameDate; minimum?: string | null } = {}): Goal {
  const createdOn = opts.createdOn ?? MON;
  return {
    id,
    type: 'check',
    building: 'library',
    createdOn,
    archivedFrom: null,
    text: [{ from: createdOn, value: { name: id, ideal: '理想', minimum: opts.minimum === undefined ? '最低' : opts.minimum } }],
    frequency: [{ from: createdOn, value: frequency }],
  };
}

export function diaryGoal(id: string, idealChars = 10, createdOn: GameDate = MON): Goal {
  return {
    id,
    type: 'diary',
    building: 'kura',
    createdOn,
    archivedFrom: null,
    text: [{ from: createdOn, value: { name: '日記', ideal: `${idealChars}文字以上`, minimum: '一言', idealChars } }],
    frequency: [{ from: createdOn, value: { kind: 'daily' } }],
  };
}

export function save(goals: Goal[], patch: Partial<SaveData> = {}): SaveData {
  return {
    schemaVersion: SCHEMA_VERSION,
    startDate: MON,
    dayStartHour: 4,
    lastSeenDate: MON,
    goals,
    checks: {},
    diary: {},
    todos: [],
    facilities: [],
    restDays: [],
    upgrades: [],
    summarySeenDate: null,
    lastBackupDate: null,
    revision: 0,
    ...patch,
  };
}

/** day(0) = MON */
export const day = (n: number): GameDate => addDays(MON, n);

export function withChecks(s: SaveData, entries: Array<[number, string, CheckLevel]>): SaveData {
  const checks = structuredClone(s.checks);
  for (const [n, id, level] of entries) {
    const d = day(n);
    checks[d] = { ...(checks[d] ?? {}), [id]: level };
  }
  return { ...s, checks };
}
