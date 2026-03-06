#!/bin/bash
# OpenClaw usage monitor
# Parses agent session JSONL files for real-time cost tracking across all providers

AGENTS_DIR="/Users/alfred/.openclaw/agents"

get_claude_usage() {
  codexbar usage --provider claude --json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for p in data:
        u = p.get('usage', {})
        pri = u.get('primary', {})
        sec = u.get('secondary', {})
        login = u.get('loginMethod', '?')
        print(f'Claude ({login}): primary {pri.get(\"usedPercent\", \"?\")}% (resets {pri.get(\"resetDescription\", \"?\")}), weekly {sec.get(\"usedPercent\", \"?\")}% (resets {sec.get(\"resetDescription\", \"?\")})')
except Exception as e:
    print(f'Claude: error reading usage ({e})')
" 2>/dev/null
}

get_session_usage() {
  local today=$(date +%Y-%m-%d)

  python3 -c "
import json, os, glob
from datetime import datetime
from collections import defaultdict

agents_dir = '$AGENTS_DIR'
today = '$today'

# Pricing per 1M tokens (USD)
pricing = {
    'gpt-5-mini': (1.25, 5.00),
    'gpt-5.4': (5.00, 15.00),
    'gpt-5.4-pro': (10.00, 30.00),
    'gpt-4.1': (2.00, 8.00),
    'o4-mini': (1.10, 4.40),
    'gpt-5.3-codex': (0.0, 0.0),
    'gpt-5.3-codex-spark': (0.0, 0.0),
    'glm-5': (0.0, 0.0),
    'glm-4.7': (0.0, 0.0),
    'glm-4.7-flash': (0.0, 0.0),
    'glm-4.7-flashx': (0.0, 0.0),
}

# Track usage per model and per agent
model_usage = defaultdict(lambda: {'input': 0, 'output': 0, 'cache_read': 0, 'cache_write': 0, 'requests': 0})
agent_usage = defaultdict(lambda: defaultdict(lambda: {'input': 0, 'output': 0, 'requests': 0}))

# Scan all agent session files
for session_path in glob.glob(os.path.join(agents_dir, '*/sessions/*.jsonl')):
    parts = session_path.split('/')
    # Extract agent dir name (e.g. mc-1a5775a5-... or lead-83acf7e1-...)
    agent_dir_name = parts[-3] if len(parts) >= 3 else 'unknown'
    try:
        file_size = os.path.getsize(session_path)
        with open(session_path, 'r') as f:
            if file_size > 512000:
                f.seek(file_size - 512000)
                f.readline()  # skip partial line

            for line in f:
                try:
                    d = json.loads(line.strip())
                    if d.get('type') != 'message':
                        continue

                    msg = d.get('message', {})
                    if msg.get('role') != 'assistant':
                        continue

                    # Timestamp is epoch ms in message
                    ts = msg.get('timestamp', 0)
                    if ts > 0:
                        dt = datetime.fromtimestamp(ts / 1000)
                        if dt.strftime('%Y-%m-%d') != today:
                            continue
                    else:
                        continue

                    usage = msg.get('usage', {})
                    model = msg.get('model', 'unknown')
                    provider = msg.get('provider', 'unknown')

                    inp = usage.get('input', 0)
                    out = usage.get('output', 0)
                    cache_read = usage.get('cacheRead', 0)
                    cache_write = usage.get('cacheWrite', 0)
                    if inp > 0 or out > 0:
                        model_key = f'{provider}/{model}'
                        model_usage[model_key]['input'] += inp
                        model_usage[model_key]['output'] += out
                        model_usage[model_key]['cache_read'] += cache_read
                        model_usage[model_key]['cache_write'] += cache_write
                        model_usage[model_key]['requests'] += 1
                        agent_usage[agent_dir_name][model_key]['input'] += inp
                        agent_usage[agent_dir_name][model_key]['output'] += out
                        agent_usage[agent_dir_name][model_key]['requests'] += 1

                except:
                    continue
    except:
        continue

print(f'=== Token Usage Today ({today}) ===')
print()

total_cost = 0
total_input = 0
total_output = 0
total_reqs = 0

if not model_usage:
    print('No usage recorded today.')
else:
    print(f'{\"Provider/Model\":<35} {\"Input\":>10} {\"Output\":>10} {\"Cache\":>10} {\"Reqs\":>5} {\"Cost (USD)\":>12}')
    print('-' * 87)
    for model_key, u in sorted(model_usage.items()):
        # Extract just model name for pricing lookup
        model_name = model_key.split('/')[-1] if '/' in model_key else model_key
        inp_price, out_price = pricing.get(model_name, (3.0, 10.0))

        # Calculate cost: use our pricing table (gateway reported costs can be wrong for free tiers)
        cost = (u['input'] / 1_000_000 * inp_price) + (u['output'] / 1_000_000 * out_price)

        total_cost += cost
        total_input += u['input']
        total_output += u['output']
        total_reqs += u['requests']
        cache_total = u['cache_read'] + u['cache_write']
        print(f'{model_key:<35} {u[\"input\"]:>10,} {u[\"output\"]:>10,} {cache_total:>10,} {u[\"requests\"]:>5} {\"\$\" + f\"{cost:.4f}\":>12}')

    print('-' * 87)
    print(f'{\"TOTAL\":<35} {total_input:>10,} {total_output:>10,} {\"\":>10} {total_reqs:>5} {\"\$\" + f\"{total_cost:.4f}\":>12}')

# Agent name mapping
agent_names = {
    'mc-1a5775a5-ff58-486f-93fd-84858e7e7028': 'Ralph',
    'mc-5579ee70-3037-4cdc-a600-af260384825b': 'Gate',
    'mc-gateway-c982f65e-a69c-4210-a339-0283f7669faa': 'Architect-GW',
    'mc-b50eb724-7d06-49f1-b06c-ebc59adae9e1': 'Watchdog',
    'mc-1bc9826b-9459-437e-a5ca-894c3094a7ca': 'Architect-2',
    'mc-084f70cd-8514-4439-8f9c-da8b76a3d4db': 'Frontend',
    'lead-83acf7e1-a849-461c-afc6-4b917ad49eca': 'Lead',
}

if agent_usage:
    print()
    print('--- Per Agent ---')
    for agent_dir, models in sorted(agent_usage.items()):
        name = agent_names.get(agent_dir, agent_dir[:25])
        agent_total_in = sum(m['input'] for m in models.values())
        agent_total_out = sum(m['output'] for m in models.values())
        agent_reqs = sum(m['requests'] for m in models.values())
        agent_cost = 0
        # Use our pricing table
        for mk, m in models.items():
            mn = mk.split('/')[-1]
            ip, op = pricing.get(mn, (3.0, 10.0))
            agent_cost += (m['input'] / 1_000_000 * ip) + (m['output'] / 1_000_000 * op)
        models_used = ', '.join(mk.split('/')[-1] for mk in models.keys())
        print(f'  {name:<22} {agent_total_in + agent_total_out:>10,} tok  {agent_reqs:>4} reqs  \${agent_cost:.4f}  [{models_used}]')
" 2>/dev/null
}

# Main output
echo "========================================"
echo "  Usage Report — $(date '+%Y-%m-%d %H:%M')"
echo "========================================"
echo ""
get_claude_usage
echo ""
get_session_usage
echo ""
echo "========================================"
