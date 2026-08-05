export const STRIKE_BAN_THRESHOLD = 5;

export function ensureStrikeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS strikes (
      login TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      reasons TEXT NOT NULL DEFAULT '[]',
      banned_at INTEGER,
      updated_at INTEGER NOT NULL
    );
  `);
}

export function getStrike(db, login) {
  const key = (login || "").toLowerCase();
  const row = db.prepare("SELECT * FROM strikes WHERE login = ?").get(key);
  if (!row) return null;
  let reasons = [];
  try { reasons = JSON.parse(row.reasons || "[]"); } catch { reasons = []; }
  return { ...row, reasons };
}

export function addStrike(db, login, { reason, issue, ts }) {
  const key = (login || "").toLowerCase();
  const existing = getStrike(db, key);
  const reasons = existing ? existing.reasons : [];
  reasons.push({ ts, reason, issue: issue ?? null });
  const count = (existing ? existing.count : 0) + 1;
  const banned = count >= STRIKE_BAN_THRESHOLD;
  const bannedAt = banned ? (existing?.banned_at ?? ts) : null;
  db.prepare(`
    INSERT INTO strikes (login, count, reasons, banned_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(login) DO UPDATE SET
      count = excluded.count, reasons = excluded.reasons,
      banned_at = excluded.banned_at, updated_at = excluded.updated_at
  `).run(key, count, JSON.stringify(reasons), bannedAt, ts);
  return { count, banned };
}

export function isBanned(db, login) {
  const key = (login || "").toLowerCase();
  const row = db.prepare("SELECT banned_at FROM strikes WHERE login = ?").get(key);
  return !!(row && row.banned_at !== null && row.banned_at !== undefined);
}

export function listBannedLogins(db) {
  return db.prepare("SELECT login FROM strikes WHERE banned_at IS NOT NULL")
    .all().map((r) => r.login);
}
