// Recent issues filed by a set of logins, used to compare a new issue against
// prior submissions from related accounts (multi-account duplicate detection).
export function recentIssuesByLogins(db, logins, { excludeId = null, limit = 20 } = {}) {
  if (!logins || logins.length === 0) return [];
  const placeholders = logins.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT id, trigger_login, payload_json FROM jobs
     WHERE trigger_login IN (${placeholders}) AND (? IS NULL OR id != ?)
     ORDER BY created_at DESC LIMIT ?`,
  ).all(...logins, excludeId, excludeId, limit);
  return rows.map((r) => {
    let p = {};
    try { p = JSON.parse(r.payload_json || "{}"); } catch { /* ignore */ }
    return { login: r.trigger_login, title: p.title || "", body: p.comment_body || p.body || "" };
  });
}
