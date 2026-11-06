import { useMemo, useState } from 'react';
import { useGame } from './app/useGame';
import { addDays } from './core/date';
import { isActive } from './core/goals';
import { stageForLevels } from './core/rules';
import { isCollapseImminent, summarizeSince } from './core/simulate';
import { importJson } from './storage/db';
import { DiaryScreen } from './components/DiaryScreen';
import { Header } from './components/Header';
import { MoraleModal } from './components/MoraleModal';
import { SettingsScreen } from './components/SettingsScreen';
import { SummaryModal } from './components/SummaryModal';
import { TodayScreen } from './components/TodayScreen';
import { TownScreen } from './components/TownScreen';

type Tab = 'today' | 'diary' | 'town' | 'settings';
const TABS: Array<[Tab, string]> = [['today', '今日'], ['diary', '日記'], ['town', '街'], ['settings', '設定']];

export function App() {
  const game = useGame();
  const { load, save, sim, today, dispatch, toasts } = game;
  const [tab, setTab] = useState<Tab>('today');
  const [moraleOpen, setMoraleOpen] = useState(false);

  const stage = useMemo(() => {
    if (!save || !sim) return 'hamlet' as const;
    const levels = save.goals.filter(g => isActive(g, today)).map(g => sim.buildings[g.id]?.level ?? 1);
    return stageForLevels(levels);
  }, [save, sim, today]);

  const summary = useMemo(() => (save && sim ? summarizeSince(sim, save.summarySeenDate) : null), [save, sim]);
  const imminent = useMemo(
    () => (save && sim ? save.goals.filter(g => isCollapseImminent(save, sim, g)).map(g => g.id) : []),
    [save, sim],
  );

  if (load.kind === 'loading') {
    return (
      <div className="center-screen">
        <div className="splash">
          <p className="app-title">ひびつみ</p>
          <p className="hint">日々を積んで、まちを育てる</p>
        </div>
      </div>
    );
  }
  if (load.kind === 'error') {
    return (
      <div className="center-screen">
        <div className="card">
          <h1>データを読み込めませんでした</h1>
          <p>{load.message}</p>
          {load.corrupt && <p className="hint">データは消していません。バックアップのJSONがあれば、そこから復元できます（今のデータは控えとして端末内に残します）。</p>}
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => window.location.reload()}>再読み込み</button>
            {load.corrupt && (
              <label className="btn primary">
                バックアップから復元
                <input
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const r = importJson(await f.text());
                    if (!r.ok) {
                      window.alert(`読み込めませんでした：${r.error}`);
                      return;
                    }
                    if (!window.confirm('このバックアップで復元しますか？')) return;
                    try {
                      await game.importSave(r.save, true);
                    } catch (err) {
                      console.error(err);
                      window.alert('復元に失敗しました。もう一度お試しください。');
                    }
                  }}
                />
              </label>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (!save || !sim) return null;

  return (
    <div className="app">
      <Header sim={sim} stage={stage} onMoraleClick={() => setMoraleOpen(true)} />
      <main className="app-main">
        {tab === 'today' && <TodayScreen save={save} sim={sim} today={today} dispatch={dispatch} newId={game.newId} onGoSettings={() => setTab('settings')} />}
        {tab === 'diary' && <DiaryScreen save={save} today={today} onEdit={() => setTab('today')} />}
        {tab === 'town' && <TownScreen save={save} sim={sim} today={today} stage={stage} dispatch={dispatch} newId={game.newId} />}
        {tab === 'settings' && <SettingsScreen game={game} save={save} today={today} />}
      </main>
      <nav className="tab-bar" aria-label="画面の切り替え">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" className={`tab${tab === key ? ' active' : ''}`} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="toasts" aria-live="polite">
        {toasts.map(t => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
      </div>
      {moraleOpen && !summary && <MoraleModal save={save} sim={sim} today={today} onClose={() => setMoraleOpen(false)} />}
      {summary && (
        <SummaryModal summary={summary} save={save} imminent={imminent} onClose={() => dispatch({ type: 'markSummarySeen', upTo: addDays(today, -1) })} />
      )}
    </div>
  );
}
