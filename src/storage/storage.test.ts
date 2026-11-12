import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialSave } from '../core/defaults';
import { ConflictError, CorruptDataError, DB_NAME, exportJson, importJson, loadSave, replaceWithImport, resetStoreForTest, STORE_NAME, writeSave } from './db';
import { parseSave } from './schema';

let n = 0;
const fresh = () => createInitialSave('2026-11-05', () => `id${n++}`);

beforeEach(() => {
  // テストごとに空のデータベースにする
  globalThis.indexedDB = new IDBFactory();
  resetStoreForTest();
});

describe('形式チェック', () => {
  it('正しいデータは通る', () => {
    expect(parseSave(fresh()).ok).toBe(true);
  });

  it('壊れたデータ・未来のバージョンは弾く', () => {
    expect(parseSave(null).ok).toBe(false);
    expect(parseSave({}).ok).toBe(false);
    expect(parseSave({ ...fresh(), schemaVersion: 99 })).toMatchObject({ ok: false, error: expect.stringContaining('新しいバージョン') });
    expect(parseSave({ ...fresh(), startDate: '2026-02-30' }).ok).toBe(false);
    expect(parseSave({ ...fresh(), dayStartHour: 9 }).ok).toBe(false);
    const s = fresh();
    expect(parseSave({ ...s, goals: [...s.goals, s.goals[0]] })).toMatchObject({ ok: false, error: expect.stringContaining('重複') });
  });

  it('v1 のデータを最新（v5）まで移行できる', () => {
    const v2 = fresh();
    const v1 = {
      ...v2,
      schemaVersion: 1,
      goals: v2.goals.filter(g => g.type !== 'diary').map(({ type: _type, ...g }) => g),
      diary: undefined, todos: undefined, facilities: undefined,
    };
    const r = parseSave(JSON.parse(JSON.stringify(v1)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(1);
    expect(r.save.schemaVersion).toBe(5);
    expect(r.save.weeklyAssignments).toEqual([]);
    expect(r.save.assignments).toEqual([]);
    expect(r.save.goals.every(g => g.type === 'check')).toBe(true);
    expect(r.save.diary).toEqual({});
    expect(r.save.todos).toEqual([]);
    expect(r.save.facilities).toEqual([]);
  });

  it('v2 → v3：課題リストが空で追加され、目標の頻度は変わらない', () => {
    const v3 = fresh();
    const { assignments: _a, weeklyAssignments: _w, ...rest } = v3;
    const r = parseSave(JSON.parse(JSON.stringify({ ...rest, schemaVersion: 2 })));
    expect(r.ok && r.migratedFrom).toBe(2);
    expect(r.ok && r.save.assignments).toEqual([]);
    expect(r.ok && r.save.goals).toEqual(v3.goals);
  });

  it('v3 → v4：毎週の課題が空で追加される', () => {
    const { weeklyAssignments: _w, ...rest } = fresh();
    const r = parseSave(JSON.parse(JSON.stringify({ ...rest, schemaVersion: 3 })));
    expect(r.ok && r.migratedFrom).toBe(3);
    expect(r.ok && r.save.weeklyAssignments).toEqual([]);
  });

  it('移行して読み込むと、移行前の控えを残し revision を上げる', async () => {
    const v2 = fresh();
    const v1 = { ...v2, schemaVersion: 1, revision: 5, goals: v2.goals.map(({ type: _type, ...g }) => g).slice(0, 6) };
    const { set, get, createStore } = await import('idb-keyval');
    const st = createStore(DB_NAME, STORE_NAME);
    await set('save', JSON.parse(JSON.stringify({ ...v1, diary: undefined, todos: undefined, facilities: undefined })), st);
    const loaded = await loadSave();
    expect(loaded?.schemaVersion).toBe(5);
    expect(loaded?.revision).toBe(6);
    expect((await get('backup:pre-migration-v1', st) as { schemaVersion: number }).schemaVersion).toBe(1);
  });

  it('並び順を整える', () => {
    const s = fresh();
    const r = parseSave({ ...s, restDays: ['2026-11-07', '2026-11-06', '2026-11-07'] });
    expect(r.ok && r.save.restDays).toEqual(['2026-11-06', '2026-11-07']);
  });

  it('書き出し → 読み込みで同じデータに戻る', () => {
    const s = fresh();
    const r = importJson(exportJson(s));
    expect(r.ok && r.save).toEqual(s);
    expect(importJson('{壊れたJSON').ok).toBe(false);
  });
});

describe('IndexedDB への保存', () => {
  it('初回は null、保存すると revision が 1 になり読み戻せる', async () => {
    expect(await loadSave()).toBeNull();
    const saved = await writeSave(fresh(), null);
    expect(saved.revision).toBe(1);
    expect(await loadSave()).toEqual(saved);
  });

  it('古い revision からの保存は ConflictError で、上書きしない', async () => {
    const a = await writeSave(fresh(), null);
    const b = await writeSave({ ...a, dayStartHour: 2 }, a.revision);
    await expect(writeSave({ ...a, dayStartHour: 5 }, a.revision)).rejects.toBeInstanceOf(ConflictError);
    expect((await loadSave())?.dayStartHour).toBe(b.dayStartHour);
  });

  it('壊れた保存データは CorruptDataError', async () => {
    await writeSave(fresh(), null);
    const { set, createStore } = await import('idb-keyval');
    await set('save', { schemaVersion: 1, broken: true }, createStore(DB_NAME, STORE_NAME));
    await expect(loadSave()).rejects.toBeInstanceOf(CorruptDataError);
  });

  it('取り込みは revision を確かめ、ずれていれば置き換えない（復元時の force は除く）', async () => {
    const a = await writeSave(fresh(), null);
    await expect(replaceWithImport({ ...fresh(), dayStartHour: 0 }, a.revision - 1)).rejects.toBeInstanceOf(ConflictError);
    expect((await loadSave())?.dayStartHour).toBe(a.dayStartHour);
    const forced = await replaceWithImport({ ...fresh(), dayStartHour: 1 }, null, true);
    expect(forced.revision).toBe(a.revision + 1);
  });

  it('取り込みは現在のデータを残して置き換える', async () => {
    const a = await writeSave(fresh(), null);
    const imported = await replaceWithImport({ ...fresh(), dayStartHour: 0 }, a.revision);
    expect(imported.revision).toBe(a.revision + 1);
    expect((await loadSave())?.dayStartHour).toBe(0);
    const { get, createStore } = await import('idb-keyval');
    expect(await get('backup:before-import', createStore(DB_NAME, STORE_NAME))).toEqual(a);
  });
});
