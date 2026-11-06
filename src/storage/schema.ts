// 保存データの形式チェックと、古いバージョンからの移行
import { z } from 'zod';
import { isGameDate } from '../core/date';
import { DIARY_MAX_IDEAL_CHARS } from '../core/rules';
import { SCHEMA_VERSION, type SaveData } from '../core/types';

const gameDate = z.string().refine(isGameDate, { message: '日付の形式が正しくありません' });

const frequency = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily') }),
  z.object({ kind: z.literal('weekdays'), days: z.array(z.number().int().min(0).max(6)).min(1) }),
  z.object({ kind: z.literal('weekly'), times: z.number().int().min(1).max(7) }),
  z.object({ kind: z.literal('assignments') }),
]);

const goalText = z.object({
  name: z.string().min(1),
  ideal: z.string().min(1),
  minimum: z.string().nullable(),
  idealChars: z.number().int().min(1).max(DIARY_MAX_IDEAL_CHARS).optional(),
});

const timed = <T extends z.ZodType>(value: T) => z.array(z.object({ from: gameDate, value })).min(1);

const goal = z.object({
  id: z.string().min(1),
  type: z.enum(['check', 'diary']),
  building: z.enum(['library', 'bank', 'news', 'gym', 'school', 'plaza', 'kura']),
  createdOn: gameDate,
  archivedFrom: gameDate.nullable(),
  text: timed(goalText),
  frequency: timed(frequency),
});

const todo = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  due: gameDate.nullable(),
  createdOn: gameDate,
  doneOn: gameDate.nullable(),
});

const assignment = z.object({
  id: z.string().min(1),
  goalId: z.string().min(1),
  title: z.string().min(1),
  due: gameDate,
  createdOn: gameDate,
  doneOn: gameDate.nullable(),
  weeklyId: z.string().min(1).optional(),
  preRegistered: z.literal(true).optional(),
});

const weeklyAssignment = z.object({
  id: z.string().min(1),
  goalId: z.string().min(1),
  title: z.string().min(1),
  issueDay: z.number().int().min(0).max(6),
  dueDay: z.number().int().min(0).max(6),
  createdOn: gameDate,
  issuedThrough: gameDate,
});

const facility = z.object({
  id: z.string().min(1),
  kind: z.enum(['bench', 'sakura', 'stall', 'teahouse', 'bathhouse', 'shrine']),
  date: gameDate,
});

const unique = <T>(list: T[], key: (t: T) => string) => new Set(list.map(key)).size === list.length;

const saveSchemaV4 = z
  .object({
    schemaVersion: z.literal(4),
    startDate: gameDate,
    dayStartHour: z.number().int().min(0).max(6),
    lastSeenDate: gameDate,
    goals: z.array(goal),
    checks: z.record(gameDate, z.record(z.string(), z.enum(['min', 'ideal']))),
    diary: z.record(gameDate, z.string()),
    todos: z.array(todo),
    assignments: z.array(assignment),
    weeklyAssignments: z.array(weeklyAssignment),
    facilities: z.array(facility),
    restDays: z.array(gameDate),
    upgrades: z.array(z.object({ date: gameDate, goalId: z.string().min(1) })),
    summarySeenDate: gameDate.nullable(),
    lastBackupDate: gameDate.nullable(),
    revision: z.number().int().min(0),
  })
  .refine(s => unique(s.goals, g => g.id), { message: '目標のIDが重複しています' })
  .refine(s => unique(s.todos, t => t.id), { message: 'ToDoのIDが重複しています' })
  .refine(s => unique(s.facilities, f => f.id), { message: '施設のIDが重複しています' })
  .refine(s => unique(s.assignments, a => a.id), { message: '課題のIDが重複しています' })
  .refine(s => unique(s.weeklyAssignments, w => w.id), { message: '毎週の課題のIDが重複しています' });

// 型と zod の定義がずれたらコンパイルエラーになるようにする
export const saveSchema: z.ZodType<SaveData> = saveSchemaV4;

/**
 * 移行処理。MIGRATIONS[n] はバージョン n → n+1 の変換。
 * 新しいバージョンを作るときは、ここに1つ足し、古い形式のテストデータで移行テストを書くこと。
 */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2：目標の種類・日記・ToDo・施設を追加
  1: data => ({
    ...data,
    schemaVersion: 2,
    goals: Array.isArray(data.goals)
      ? data.goals.map(g => (typeof g === 'object' && g !== null ? { type: 'check', ...g } : g))
      : data.goals,
    diary: {},
    todos: [],
    facilities: [],
  }),
  // v2 → v3：課題リストを追加（既存の目標の頻度は変えない。過去の判定が変わらないように）
  2: data => ({ ...data, schemaVersion: 3, assignments: [] }),
  // v3 → v4：毎週の課題を追加
  3: data => ({ ...data, schemaVersion: 4, weeklyAssignments: [] }),
};

export type ParseResult =
  | { ok: true; save: SaveData; migratedFrom: number | null }
  | { ok: false; error: string };

export function parseSave(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'データの形式が正しくありません' };
  let data = raw as Record<string, unknown>;
  const version = data.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'データのバージョンが読み取れません' };
  }
  if (version > SCHEMA_VERSION) {
    return { ok: false, error: 'このデータはより新しいバージョンのアプリで作られています。アプリを更新してください' };
  }
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, error: `バージョン${v}からの移行方法がありません` };
    data = step(data);
  }
  const parsed = saveSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join('.') || '(全体)';
    return { ok: false, error: `データに誤りがあります: ${where} ${issue?.message ?? ''}`.trim() };
  }
  return { ok: true, save: normalize(parsed.data), migratedFrom: version < SCHEMA_VERSION ? version : null };
}

/** 並び順などを整える（手で編集されたバックアップでも動作を一意にするため） */
function normalize(s: SaveData): SaveData {
  const byFrom = <T extends { from: string }>(list: T[]) => [...list].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return {
    ...s,
    goals: s.goals.map(g => ({ ...g, text: byFrom(g.text), frequency: byFrom(g.frequency) })),
    restDays: [...new Set(s.restDays)].sort(),
  };
}
