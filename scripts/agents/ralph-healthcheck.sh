#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CFG="$ROOT/.runtime/ralph-sessions.json"
STATE="$ROOT/.runtime/ralph-health-state.json"

[[ -f "$CFG" ]] || exit 0
[[ -f "$STATE" ]] || echo '{}' > "$STATE"

python3 - <<'PY'
import json, subprocess, hashlib, pathlib, re
root=pathlib.Path('/Users/alfred/.openclaw/workspace/projects/crm_new')
cfg=json.loads((root/'.runtime/ralph-sessions.json').read_text())
sp=root/'.runtime/ralph-health-state.json'
state=json.loads(sp.read_text() or '{}')
alerts=[]
for s in cfg.get('sessions',[]):
  name=s['name']; launch=s['launch']
  if subprocess.run(['tmux','has-session','-t',name],capture_output=True).returncode!=0:
    subprocess.run(['bash','-lc',launch],check=False)
    alerts.append(f'restarted missing: {name}')
    continue
  out=subprocess.run(['tmux','capture-pane','-pt',name,'-S','-200'],capture_output=True,text=True).stdout
  h=hashlib.sha1(out.encode()).hexdigest()
  prev=state.get(name,{})
  same=prev.get('same',0)+1 if prev.get('h')==h else 0

  # Check exit status
  exited_match = re.search(r'EXITED:(\d+)', out)
  if exited_match and exited_match.group(1) == '0':
    # Gate 1 complete - check for proper handoff
    if 'GATE1_COMPLETE' not in out:
      alerts.append(f'{name} exited without GATE1_COMPLETE marker')
    # Check for failing tests patterns
    if re.search(r'\d+\s+(failed|failing)', out, re.IGNORECASE):
      if 'pre-existing' not in out.lower():
        alerts.append(f'{name} has failing tests (not pre-existing)')
    # Trigger Gate 2 if Gate 1 complete
    if 'GATE1_COMPLETE' in out and 'GATE2_STARTED' not in out:
      subprocess.run(['openclaw','system','event','--text',f'Gate 1 complete: {name} - ready for E2E verification','--mode','now'],check=False)

  if same>=3 and 'EXITED:' not in out:
    subprocess.run(['tmux','kill-session','-t',name],check=False)
    subprocess.run(['bash','-lc',launch],check=False)
    alerts.append(f'restarted stalled: {name}')
    same=0
  state[name]={'h':h,'same':same}
sp.write_text(json.dumps(state,indent=2))
if alerts:
  msg='; '.join(alerts)
  subprocess.run(['openclaw','system','event','--text',f'Ralph health: {msg}','--mode','now'],check=False)
print('ok')
PY
