/**
 * まなびログ 同期API（Cloudflare Pages Functions）
 *
 * 同じサイトの中に置いてあるので、Cloudflare Access のログインがそのまま効く。
 * 誰が来たかは Access が付けるヘッダから分かる（外から偽装して送ることはできない。
 * Cloudflare が入口で Cf-Access-* を消してから付け直すため）。
 *
 * 方式：1件ずつIDで併合する。まとめて後勝ちにすると、
 * 片方の端末が古いデータを送った瞬間に、もう片方の書き込みが消える。
 * レコードごとに updated（更新時刻）を持ち、新しい方を残す。
 * 削除は行を消さず deleted=1 の墓標として残す（消したものが復活しないように）。
 */

const KINDS = ["entry", "cat", "material", "check", "deck"];

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });

function whoami(request) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  return email ? email.toLowerCase() : null;
}

export async function onRequestPost({ request, env }) {
  const user = whoami(request);
  if (!user) return json({ error: "ログインが必要です" }, 401);
  if (!env.DB) return json({ error: "データベースが繋がっていません" }, 500);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "読み取れませんでした" }, 400);
  }

  const since = Number(body.since) || 0;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  const now = Date.now();

  // ---- 受け取る（新しい方だけ残す） ----
  let applied = 0;
  const stmts = [];
  for (const c of changes) {
    if (!c || !KINDS.includes(c.kind) || !c.id) continue;
    const updated = Number(c.updated) || now;
    const deleted = c.deleted ? 1 : 0;
    const data = deleted ? null : JSON.stringify(c.data ?? null);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO docs (user, kind, id, updated, deleted, data)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(user, kind, id) DO UPDATE SET
           updated = excluded.updated,
           deleted = excluded.deleted,
           data    = excluded.data
         WHERE excluded.updated > docs.updated`
      ).bind(user, c.kind, String(c.id), updated, deleted, data)
    );
    applied++;
  }
  if (stmts.length) {
    // D1 の無料枠は 1リクエストあたり50クエリまで。分けて送る。
    for (let i = 0; i < stmts.length; i += 40) {
      await env.DB.batch(stmts.slice(i, i + 40));
    }
  }

  // ---- 返す（前回以降に変わったぶんだけ） ----
  const { results } = await env.DB.prepare(
    `SELECT kind, id, updated, deleted, data FROM docs
      WHERE user = ?1 AND updated > ?2
      ORDER BY updated ASC
      LIMIT 2000`
  ).bind(user, since).all();

  const out = (results || []).map(r => ({
    kind: r.kind,
    id: r.id,
    updated: r.updated,
    deleted: !!r.deleted,
    data: r.data ? JSON.parse(r.data) : null
  }));

  return json({ ok: true, user, now, applied, changes: out, more: out.length >= 2000 });
}

/** 疎通確認用。ログインできているか、DBが繋がっているかを見る。 */
export async function onRequestGet({ request, env }) {
  const user = whoami(request);
  if (!user) return json({ error: "ログインが必要です" }, 401);
  let count = null, dbError = null;
  try {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM docs WHERE user = ?1`).bind(user).first();
    count = r ? r.n : 0;
  } catch (e) {
    dbError = String(e && e.message || e);
  }
  return json({ ok: !dbError, user, 保存件数: count, dbError });
}
