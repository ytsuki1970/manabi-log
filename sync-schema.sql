-- まなびログ 同期用テーブル（Cloudflare D1）
-- 作り方:  npx wrangler d1 create manabi-log
--          npx wrangler d1 execute manabi-log --remote --file=sync-schema.sql
--
-- 1件＝1レコード。まとめて上書きせず、updated（更新時刻）が新しい方を残す。
-- 消したものは行ごと消さず deleted=1 の墓標にする（他の端末で復活しないように）。

CREATE TABLE IF NOT EXISTS docs (
  user    TEXT    NOT NULL,          -- ログインしたメールアドレス
  kind    TEXT    NOT NULL,          -- entry(記録) / cat(項目) / material(教材) / check(チェック) / deck(暗記帳)
  id      TEXT    NOT NULL,          -- アプリ側のID
  updated INTEGER NOT NULL,          -- 更新時刻（ミリ秒）
  deleted INTEGER NOT NULL DEFAULT 0,
  data    TEXT,                      -- 中身（JSON）。削除時は NULL
  PRIMARY KEY (user, kind, id)
);

-- 「前回以降に変わったぶん」を引くための索引
CREATE INDEX IF NOT EXISTS docs_user_updated ON docs (user, updated);
