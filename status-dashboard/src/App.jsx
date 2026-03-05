import { useState, useEffect, useCallback } from "react";

const POLL_MS = 5_000;
const STATUS_URL = "/status.json";

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

function AgentList({ agents }) {
  if (!agents || agents.length === 0) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No agents detected.</p>;
  return (
    <div style={{ fontSize: 13 }}>
      {agents.map((a, i) => (
        <div key={a.pid ?? i} style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Badge label={a.agent} bg="#dbeafe" fg="#1e40af" />
            <span style={{ color: "#6b7280", fontSize: 12 }}>PID {a.pid}</span>
            <Badge label={a.state} bg="#dcfce7" fg="#166534" />
          </div>
          <code style={{ fontSize: 11, color: "#4b5563", wordBreak: "break-all" }}>
            {a.command?.slice(0, 100)}
          </code>
          {a.started_at && (
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
              Started: {new Date(a.started_at).toLocaleString()}
            </div>
          )}
          <div style={{ fontSize: 11, color: "#111827", marginTop: 4 }}>
            <strong>Last output:</strong> {a.last_output || "(not captured — spawn via logging wrapper)"}
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionList({ sessions }) {
  if (!sessions || sessions.length === 0) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No sessions available.</p>;
  return (
    <div style={{ maxHeight: 300, overflowY: "auto", fontSize: 12 }}>
      {sessions.map((s, i) => (
        <div key={s.sessionId ?? i} style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontWeight: 600, color: "#374151" }}>{s.agentId ?? "—"}</span>
            {s.model && <Badge label={s.model} bg="#f3e8ff" fg="#6b21a8" />}
            {s.kind && <span style={{ fontSize: 11, color: "#9ca3af" }}>({s.kind})</span>}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
            {s.key?.slice(0, 60)}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 3, fontSize: 11, color: "#9ca3af" }}>
            {s.updatedAt && <span>Updated: {new Date(s.updatedAt).toLocaleString()}</span>}
            {s.totalTokens != null && <span>Tokens: {s.totalTokens.toLocaleString()}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkerRuns({ runs }) {
  if (!runs || runs.length === 0) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No worker runs yet.</p>;
  return (
    <div style={{ maxHeight: 320, overflowY: "auto", fontSize: 12 }}>
      {runs.map((r, i) => (
        <div key={`${r.agent}-${r.started_at}-${i}`} style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge label={r.agent || "worker"} bg="#ecfeff" fg="#155e75" />
            <Badge label={r.state || "unknown"} bg={r.state === "finished" ? "#dcfce7" : "#fef3c7"} fg={r.state === "finished" ? "#166534" : "#92400e"} />
            {r.exit_code != null && <span style={{ color: "#6b7280" }}>exit {r.exit_code}</span>}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
            {r.started_at ? `Started: ${new Date(r.started_at).toLocaleString()}` : "Started: —"}
          </div>
          <div style={{ fontSize: 11, color: "#111827", marginTop: 4 }}>
            <strong>Last output:</strong> {r.last_output || "(no output captured yet)"}
          </div>
        </div>
      ))}
    </div>
  );
}

function SprintTodo({ sprint0 }) {
  if (!sprint0?.tasks?.length) return <p style={{ color: "#9ca3af", fontSize: 13 }}>No sprint checklist.</p>;
  return (
    <div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        Progress: <strong>{sprint0.done_count}/{sprint0.total_count}</strong> · Focus: {sprint0.current_focus || "—"}
      </div>
      <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13 }}>
        {sprint0.tasks.map((t) => (
          <li key={t.id} style={{ padding: "3px 0", color: t.done ? "#15803d" : "#111827" }}>
            {t.done ? "✅" : "⬜"} {t.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

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

      <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        <Card title="Overview">
          <StatusRow label="Current Task" value={status?.current_task} />
          <StatusRow label="Started At" value={status?.started_at} />
          <StatusRow label="Updated At" value={status?.updated_at} />
          <StatusRow label="Git Branch" value={status?.git?.branch} />
          <StatusRow label="Dirty Files" value={status?.git?.dirty_files} />
          <StatusRow label="Last Commit" value={status?.git?.last_commit} />
        </Card>

        <Card title="Health Checks">
          <StatusRow label="Test Status" value={status?.test_status} />
          <StatusRow label="Build Status" value={status?.build_status} />
          <StatusRow label="Lint Status" value={status?.lint_status} />
        </Card>

        <Card title="Active Processes">
          <ProcessList procs={status?.active_processes} />
        </Card>

        <Card title="Agents">
          <AgentList agents={status?.agents} />
        </Card>

        <Card title="Worker Runs (with last output)">
          <WorkerRuns runs={status?.worker_runs} />
        </Card>

        <Card title="OpenClaw Sessions">
          <SessionList sessions={status?.openclaw_sessions} />
        </Card>

        <Card title="Sprint 0 TODO / DONE">
          <SprintTodo sprint0={status?.sprint0} />
        </Card>

        <Card title="Blockers">
          <BlockerList blockers={status?.blockers} />
        </Card>

        <Card title="Recent Commands">
          <CommandTimeline cmds={status?.last_commands} />
        </Card>

        <Card title="Notes">
          <p style={{ margin: 0, fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>
            {status?.notes || "—"}
          </p>
        </Card>
      </main>
    </div>
  );
}
