// 設定画面の「通知」：オン・オフ、朝と夜の時刻、知らせる内容
import { notifySupport } from '../app/notify';
import type { Notify } from '../app/useNotify';

export function NotifySection({ notify }: { notify: Notify }) {
  const { state, busy, error } = notify;
  const s = state.settings;
  const support = notifySupport();
  const set = (patch: Partial<typeof s>) => notify.setSettings({ ...s, ...patch });

  return (
    <section className="card">
      <h2>通知</h2>
      {support === 'needs-install' && <p className="hint">iPhone では、ホーム画面に追加したアプリから開くと通知を使えます（共有ボタン →「ホーム画面に追加」）。</p>}
      {support === 'unsupported' && <p className="hint">このブラウザでは通知を使えません。</p>}
      {support === 'denied' && <p className="hint">通知がブロックされています。端末の設定で、ひびつみの通知を許可してください。</p>}
      {support === 'ok' && !state.enabled && (
        <>
          <p className="hint">朝と夜に、今日の目標・住民のやる気・課題の締切・倒壊寸前の建物を知らせます。</p>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void notify.enable()}>通知をオンにする</button>
        </>
      )}
      {state.enabled && (
        <div className="notify-settings">
          <label className="notify-row">
            <input type="checkbox" checked={s.morning !== null} onChange={e => set({ morning: e.target.checked ? '08:00' : null })} />
            朝のお知らせ
            {s.morning !== null && <input type="time" value={s.morning} onChange={e => e.target.value && set({ morning: e.target.value })} aria-label="朝の時刻" />}
          </label>
          <label className="notify-row">
            <input type="checkbox" checked={s.evening !== null} onChange={e => set({ evening: e.target.checked ? '21:00' : null })} />
            夜のふり返り（まだの目標があるときだけ）
            {s.evening !== null && <input type="time" value={s.evening} onChange={e => e.target.value && set({ evening: e.target.value })} aria-label="夜の時刻" />}
          </label>
          <label className="notify-row">
            <input type="checkbox" checked={s.deadlines} onChange={e => set({ deadlines: e.target.checked })} />
            課題の締切（前日と当日）
          </label>
          <label className="notify-row">
            <input type="checkbox" checked={s.collapse} onChange={e => set({ collapse: e.target.checked })} />
            倒壊寸前の建物
          </label>
          <p className="hint">通知には目標や課題の名前が入ります。そのため、この先1週間分の通知の文を通知サーバーに預けます。1週間アプリを開かないと通知は止まります。</p>
          <div className="btn-row">
            <button type="button" className="btn small" disabled={busy} onClick={() => void notify.test()}>試しに通知を送る</button>
            <button type="button" className="btn small" disabled={busy} onClick={() => void notify.disable()}>通知をオフにする</button>
          </div>
        </div>
      )}
      {error && <p className="danger-text">{error}</p>}
    </section>
  );
}
