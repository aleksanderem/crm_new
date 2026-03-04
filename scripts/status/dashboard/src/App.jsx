import { useState, useEffect, useCallback } from "react";

const POLL_MS = 5_000;
const STATUS_URL = "/status.json";

// ---------------------------------------------------------------------------
// State badge colours
// ---------------------------------------------------------------------------

const STATE_COLORS = {
  IDLE: { bg: "#e0e7ff", fg: "#3730a3" },
  RUNNING: { bg: "#dcfce7", fg: "#166534" },
  BLOCKED: { bg: "#fee2e2", fg: "#991b1b" },
  DONE: { bg: "#f0fdf4", fg: "#15803d" },
};

function Badge({ label, bg, fg }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 6,
        fontWeight: 600,
        fontSize: 13,
        background: bg,
        color: fg,
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function Card({ title, children }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ color: "#6b7280", fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{value ?? "—"}</span>
    </div>
  );
}

function ProcessList({ procs }) {
  if (!procs || procs.length === 0) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No active processes.</p>;
  return (
    <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13 }}>
      {procs.map((p) => (
        <li key={p} style={{ padding: "3px 0" }}>
          <code>{p}</code>
        </li>
      ))}
    </ul>
  );
}

function BlockerList({ blockers }) {
  if (!blockers || blockers.length === 0) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No blockers.</p>;
  return (
    <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, color: "#dc2626" }}>
      {blockers.map((b, i) => (
        <li key={i} style={{ padding: "3px 0" }}>{b}</li>
      ))}
    </ul>
  );
}

function CommandTimeline({ cmds }) {
  if (!cmds || cmds.length === 0) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No commands recorded.</p>;
  return (
    <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12, fontFamily: "monospace" }}>
      {cmds.slice(-15).reverse().map((c, i) => (
        <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>{c}</div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(STATUS_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
      setError(null);
      setLastFetch(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const stateColors = status ? STATE_COLORS[status.current_state] || STATE_COLORS.IDLE : STATE_COLORS.IDLE;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Project Status</h1>
          {status && <Badge label={status.current_state} bg={stateColors.bg} fg={stateColors.fg} />}
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          {lastFetch ? `Last poll: ${lastFetch}` : "Loading…"}
          {error && <span style={{ color: "#dc2626", marginLeft: 12 }}>Error: {error}</span>}
        </div>
      </header>

      {/* Grid */}
      <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        {/* Overview card */}
        <Card title="Overview">
          <StatusRow label="Current Task" value={status?.current_task} />
          <StatusRow label="Started At" value={status?.started_at} />
          <StatusRow label="Updated At" value={status?.updated_at} />
          <StatusRow label="Git Branch" value={status?.git?.branch} />
          <StatusRow label="Dirty Files" value={status?.git?.dirty_files} />
          <StatusRow label="Last Commit" value={status?.git?.last_commit} />
        </Card>

        {/* Health card */}
        <Card title="Health Checks">
          <StatusRow label="Test Status" value={status?.test_status} />
          <StatusRow label="Build Status" value={status?.build_status} />
          <StatusRow label="Lint Status" value={status?.lint_status} />
        </Card>

        {/* Active Processes */}
        <Card title="Active Processes">
          <ProcessList procs={status?.active_processes} />
        </Card>

        {/* Blockers */}
        <Card title="Blockers">
          <BlockerList blockers={status?.blockers} />
        </Card>

        {/* Command Timeline */}
        <Card title="Recent Commands">
          <CommandTimeline cmds={status?.last_commands} />
        </Card>

        {/* Notes */}
        <Card title="Notes">
          <p style={{ margin: 0, fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>
            {status?.notes || "—"}
          </p>
        </Card>
      </main>
    </div>
  );
}
