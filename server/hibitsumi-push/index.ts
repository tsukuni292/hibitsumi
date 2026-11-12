// ひびつみの通知サーバー
//   GET                         … 通知用の公開鍵（VAPID）を返す。なければここで作る（秘密鍵は外に出さない）
//   POST { action: 'register' } … 端末の宛先と、この先の通知の予定をまるごと置き換える
//   POST { action: 'unregister' } … 端末を消す
//   POST { action: 'test' }     … その端末にすぐ試しの通知を送る
//   POST { action: 'send', key } … 時刻が来た通知を送る（pg_cron が5分ごとに、DB の合い言葉 cron_key を付けて呼ぶ）
// アカウントはなく、端末が作った合い言葉（secret）で本人確認する。secret はハッシュだけ保存する
import webpush from 'npm:web-push@3.6.7';
import postgres from 'npm:postgres@3.4.5';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3 });

const ORIGINS = ['https://tsukuni292.github.io', 'http://localhost:5173'];
const MAX_ITEMS = 40;
const MAX_TITLE = 60;
const MAX_BODY = 400;
const MAX_AHEAD_MS = 15 * 24 * 60 * 60 * 1000;
/** これ以上遅れた通知は送らない（時期がずれたお知らせはかえって邪魔なため） */
const MAX_LATE_MS = 60 * 60 * 1000;
/** 登録できる端末の総数（個人用のアプリなので小さく。悪用で DB が膨らまないように） */
const MAX_DEVICES = 50;
/** 1回の送信で扱う件数 */
const SEND_BATCH = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Keys = { vapid_public: string; vapid_private: string; cron_key: string };
type Item = { at: string; title: string; body: string; tag: string };

async function vapidKeys(): Promise<Keys> {
  const rows = await sql<Keys[]>`select vapid_public, vapid_private, cron_key from hibitsumi.config where id = 1`;
  if (rows[0]) return rows[0];
  const k = webpush.generateVAPIDKeys();
  await sql`insert into hibitsumi.config (id, vapid_public, vapid_private) values (1, ${k.publicKey}, ${k.privateKey}) on conflict (id) do nothing`;
  const again = await sql<Keys[]>`select vapid_public, vapid_private, cron_key from hibitsumi.config where id = 1`;
  return again[0]!;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
/** 長すぎる文は断らずに切り詰める（1件の長さで予定全体が止まらないように） */
const clip = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 ? [...v].slice(0, max).join('') : null);

function validSubscription(s: any): boolean {
  return s && isStr(s.endpoint, 1000) && s.endpoint.startsWith('https://') && s.keys && isStr(s.keys.p256dh, 200) && isStr(s.keys.auth, 100);
}

function validItems(items: unknown): Item[] | null {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) return null;
  const now = Date.now();
  const out: Item[] = [];
  for (const it of items as any[]) {
    if (!it || typeof it !== 'object') return null;
    const t = Date.parse(it.at);
    if (!Number.isFinite(t) || t > now + MAX_AHEAD_MS) return null;
    const title = clip(it.title, MAX_TITLE);
    const body = clip(it.body, MAX_BODY);
    if (!title || !body || !isStr(it.tag, 40)) return null;
    if (t > now) out.push({ at: new Date(t).toISOString(), title, body, tag: it.tag });
  }
  return out;
}

async function push(keys: Keys, subscription: unknown, payload: { title: string; body: string; tag: string }) {
  webpush.setVapidDetails('https://tsukuni292.github.io/hibitsumi/', keys.vapid_public, keys.vapid_private);
  await webpush.sendNotification(subscription as webpush.PushSubscription, JSON.stringify(payload), { TTL: 3600 });
}

async function sendDue() {
  const keys = await vapidKeys();
  // 1件ずつ、消してから送る（二重送信を防ぐ。途中で止まっても、残りは次の回で送られる）
  const due = await sql`
    select q.id, q.send_at, q.title, q.body, q.tag, d.device_id, d.subscription
    from hibitsumi.queue q join hibitsumi.devices d on q.device_id = d.device_id
    where q.send_at <= now() order by q.send_at limit ${SEND_BATCH}`;
  let sent = 0;
  for (const r of due) {
    await sql`delete from hibitsumi.queue where id = ${r.id}`;
    if (Date.now() - new Date(r.send_at).getTime() > MAX_LATE_MS) continue;
    try {
      await push(keys, r.subscription, { title: r.title, body: r.body, tag: r.tag });
      sent += 1;
    } catch (e: any) {
      // 宛先がもう無い（通知を切った・アプリを消した）ときは端末ごと消す
      if (e?.statusCode === 404 || e?.statusCode === 410) await sql`delete from hibitsumi.devices where device_id = ${r.device_id}`;
      else console.error('push failed', e?.statusCode, e?.body ?? String(e));
    }
  }
  // 60日使われていない端末は片づける
  await sql`delete from hibitsumi.devices where updated_at < now() - interval '60 days'`;
  return { due: due.length, sent };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  const headers = {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0]!,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
    'Content-Type': 'application/json',
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });

  try {
    if (req.method === 'GET') return json({ publicKey: (await vapidKeys()).vapid_public });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== 'string') return json({ error: 'bad request' }, 400);
    if (body.action === 'send') {
      // pg_cron からだけ（DB の合い言葉を知っている者だけ）
      if (typeof body.key !== 'string' || body.key !== (await vapidKeys()).cron_key) return json({ error: 'forbidden' }, 403);
      return json(await sendDue());
    }

    const { deviceId, secret } = body;
    if (typeof deviceId !== 'string' || !UUID_RE.test(deviceId) || !isStr(secret, 200) || secret.length < 32) return json({ error: 'bad device' }, 400);
    const hash = await sha256(secret);
    const found = await sql`select secret_hash, subscription from hibitsumi.devices where device_id = ${deviceId}`;
    if (found[0] && found[0].secret_hash !== hash) return json({ error: 'forbidden' }, 403);

    if (body.action === 'unregister') {
      await sql`delete from hibitsumi.devices where device_id = ${deviceId}`;
      return json({ ok: true });
    }

    if (body.action === 'test') {
      if (!found[0]) return json({ error: 'not registered' }, 404);
      await push(await vapidKeys(), found[0].subscription, { title: 'ひびつみ', body: '通知の試しです。このように届きます。', tag: 'test' });
      return json({ ok: true });
    }

    if (body.action === 'register') {
      if (!validSubscription(body.subscription)) return json({ error: 'bad subscription' }, 400);
      const items = validItems(body.items);
      if (!items) return json({ error: 'bad items' }, 400);
      if (!found[0]) {
        const [{ n }] = await sql`select count(*)::int as n from hibitsumi.devices`;
        if (n >= MAX_DEVICES) return json({ error: 'too many devices' }, 429);
      }
      await sql.begin(async tx => {
        // 同じ宛先が別の端末IDで残っていたら消す（古い予定が二重に届かないように）
        await tx`delete from hibitsumi.devices where subscription->>'endpoint' = ${body.subscription.endpoint} and device_id <> ${deviceId}`;
        await tx`
          insert into hibitsumi.devices (device_id, secret_hash, subscription, updated_at)
          values (${deviceId}, ${hash}, ${tx.json(body.subscription)}, now())
          on conflict (device_id) do update set subscription = excluded.subscription, updated_at = now()`;
        await tx`delete from hibitsumi.queue where device_id = ${deviceId}`;
        if (items.length) {
          await tx`insert into hibitsumi.queue ${tx(items.map(it => ({ device_id: deviceId, send_at: it.at, title: it.title, body: it.body, tag: it.tag })))}`;
        }
      });
      return json({ ok: true, queued: items.length });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'server' }, 500);
  }
});
