# 通知サーバー（Supabase）

- プロジェクト：`yhdhmynxjtczhyzhmauq`（ほかのアプリと同居。ひびつみ用の表は `hibitsumi` スキーマに分けてある）
- Edge Function：`hibitsumi-push`（JWT 確認なし。端末ごとの合い言葉で本人確認する）。中身は `hibitsumi-push/index.ts`
- 表とスケジュール：`migrations.sql`
- 5分ごとに pg_cron が `{"action":"send"}` を送り、時刻が来た通知を Web Push で送る
- VAPID の鍵は Edge Function が初回に自分で作り、`hibitsumi.config` に保存する（秘密鍵は外に出さない）

デプロイは Supabase の MCP（deploy_edge_function）か Supabase CLI で、`hibitsumi-push/index.ts` をそのまま上げる。
