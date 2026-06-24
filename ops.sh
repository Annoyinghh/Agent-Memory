#!/usr/bin/env bash
# =============================================================================
# Agent-Memory ops — 一行式封装，把常见的 docker/curl 仪式压成一条命令。
#   用法: ./ops.sh <command> [args]      ./ops.sh help 看全部
#   平台: Windows Git Bash (也兼容 Linux/macOS)。需要: docker, curl, python。
# =============================================================================
set -euo pipefail
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8   # 让 host 端 python(-c) 输出 UTF-8,避免 Windows cp936 乱码

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND="${AGENT_MEMORY_API:-http://localhost:8900}"   # 后端 REST
WORKSPACE_CONTAINER="/workspace"                        # 后端容器内的仓库路径 (E:/shipbearERP-master:ro)

die()  { echo "✗ $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "缺少依赖: $1 (请先安装)"; }

# --- REST helpers ------------------------------------------------------------
api_get()  { need curl; curl -sS --max-time "${API_TIMEOUT:-30}" "$BACKEND$1"; }
api_post() { need curl; curl -sS --max-time "${2:-60}" -X POST "$BACKEND$1" -H 'Content-Type: application/json' -d "$3"; }
# 美化 JSON；非 JSON 原样吐出
pp() { python -c "import sys,json
d=sys.stdin.read()
try:
    print(json.dumps(json.loads(d),ensure_ascii=False,indent=2))
except Exception:
    sys.stdout.write(d)" 2>/dev/null || cat; }

# --- docker compose helper (始终在仓库根跑,project name 自然为 agent-memory) -
dc() { ( cd "$SCRIPT_DIR" && docker compose "$@" ); }

# =============================================================================
# 命令实现
# =============================================================================
cmd_health() {
  echo "── /health ──"; api_get /health | pp; echo
  echo "── containers ──"; dc ps 2>/dev/null || true
}

cmd_ps()      { dc ps; }
cmd_up()      { dc up -d "$@"; }
cmd_down()    { dc down; }

cmd_logs()  { # svc [lines]
  local svc="${1:-backend}" n="${2:-120}"
  dc logs --tail="$n" "$svc"
}
cmd_restart() { # [svc]
  dc restart "${1:-backend}"
  echo "restarted; waiting for health…"; sleep 4; api_get /health | pp
}

cmd_namespaces() { api_get /api/namespaces | pp; }

cmd_graph_stats() { # [namespace]
  local ns="${1:-}"
  if [ -n "$ns" ]; then api_get "/api/graph/stats?namespace=$ns" | pp
  else api_get /api/graph/stats | pp; fi
}

cmd_graph_rebuild() { # <namespace>
  local ns="${1:-}"
  [ -n "$ns" ] || die "用法: ./ops.sh graph:rebuild <namespace>   (例: shipbearERP)"
  echo "→ 全量重建 namespace='$ns' (target=$WORKSPACE_CONTAINER, rebuild=true)。大仓库可能要几分钟…"
  api_post /api/graph/extract 600 \
    "{\"namespace\":\"$ns\",\"target_dir\":\"$WORKSPACE_CONTAINER\",\"rebuild\":true}" | pp
  echo
  echo "若上面返回 task_id,用 './ops.sh task <id>' 查进度。"
}

cmd_graph_clear() { # <namespace>   [危险] 清空该 namespace 的整张图谱
  local ns="${1:-}"
  [ -n "$ns" ] || die "用法: ./ops.sh graph:clear <namespace>"
  read -r -p "确认清空 namespace '$ns' 的整张知识图谱? [y/N] " ans
  [ "$ans" = "y" ] || { echo "已取消"; exit 0; }
  api_post /api/graph/clear 60 "{\"namespace\":\"$ns\"}" | pp
}

cmd_compress_stats() { api_get /api/compress/stats | pp; }

cmd_compress_test() { # [text]
  local text="${1:-{\"user\":{\"id\":101,\"name\":\"Alice\",\"roles\":[\"admin\",\"editor\"]},\"items\":[{\"sku\":\"A1\",\"qty\":2},{\"sku\":\"B2\",\"qty\":5}]}}"
  local body
  body="$(python -c 'import json,sys; print(json.dumps({"text":sys.argv[1],"language":None}))' "$text")"
  echo "── 输入 ──"; echo "$text"
  echo "── /api/compress ──"
  echo "$body" | curl -sS --max-time 60 -X POST "$BACKEND/api/compress" -H 'Content-Type: application/json' -d @- | pp
}

cmd_task() { # <task_id>
  local id="${1:-}"; [ -n "$id" ] || die "用法: ./ops.sh task <task_id>"
  api_get "/api/tasks/$id" | pp
}

# --- MCP 配置查看 / 自愈补丁 --------------------------------------------------
cmd_mcp_config() {
  python -c "
import json,os
d=json.load(open(os.path.expanduser('~/.claude.json'),encoding='utf-8'))
hits=[]
def walk(o,path):
    if isinstance(o,dict):
        if 'mcpServers' in o and isinstance(o['mcpServers'],dict) and 'agent-memory' in o['mcpServers']:
            hits.append((path,o['mcpServers']['agent-memory']))
        for k,v in o.items(): walk(v,path+[k])
    elif isinstance(o,list):
        for i,v in enumerate(o): walk(v,path+[i])
walk(d,[])
print('agent-memory 配置条目:',len(hits))
for path,cfg in hits:
    print('=== ','.'.join(map(str,path)) or '<root>','===')
    for a in cfg.get('args',[]): print('   ',a)
    print('   挂了 shipbearERP 仓库:',any('shipbearERP' in a for a in cfg.get('args',[])))
"
}

cmd_mcp_fix() {
  # 幂等:给 agent-memory 的 docker run 加上仓库挂载 + 可写缓存 + headroom env。
  # Claude Code 退出时偶尔会用内存旧版覆盖 ~/.claude.json —— 被覆盖了重跑本命令即可。
  python -c "
import json,os,shutil
p=os.path.expanduser('~/.claude.json')
raw=open(p,encoding='utf-8').read()
MARK='shipbearERP-master:/workspace:ro'
if MARK in raw: print('已经是最新配置,无需修补'); raise SystemExit(0)
old='\"E:/Agent-Memory/Agent-Memory-Server/data:/app/data\"'
new=('\"E:/Agent-Memory/Agent-Memory-Server/data:/app/data\",\n'
     '        \"-v\",\n'
     '        \"E:/shipbearERP-master:/workspace:ro\",\n'
     '        \"-v\",\n'
     '        \"E:/Agent-Memory/.mcp-graphify-cache:/app/.graphify-cache\",\n'
     '        \"-e\",\n'
     '        \"GRAPHIFY_CACHE_DIR=/app/.graphify-cache\",\n'
     '        \"-e\",\n'
     '        \"HEADROOM_TELEMETRY=off\",\n'
     '        \"-e\",\n'
     '        \"HEADROOM_CCR_DIR=/app/data/headroom-ccr\"')
n=raw.count(old)
if n==0: print('✗ 未找到锚点,配置结构可能已变,已放弃(无改动)'); raise SystemExit(1)
patched=raw.replace(old,new); json.loads(patched)
bak=p+'.bak'
if not os.path.exists(bak): shutil.copy2(p,bak)
open(p,'w',encoding='utf-8',newline='\n').write(patched)
print('✓ 已修补',n,'处 agent-memory 配置;备份 ->',bak)
print('  重启 Claude Code 让新挂载生效;被覆盖了就再跑一次 ./ops.sh mcp:fix')
"
}

usage() {
cat <<'EOF'
Agent-Memory ops —— 常用操作一行搞定。

  健康 / 容器
    health              后端 /health + 容器状态
    ps                  docker compose ps
    up   [svc...]       构建并启动 (docker compose up -d)
    down                停止全部 (数据卷保留)
    logs [svc] [n]      看日志 (默认 backend, 120 行)
    restart [svc]       重启服务并等健康

  记忆 / 图谱 (走 REST 8900,后端能看到 /workspace)
    ns                  列出 namespaces
    graph:stats [ns]    图谱统计 (不传 ns 看全局)
    graph:rebuild <ns>  全量重建图谱 (target=/workspace, rebuild=true)
    graph:clear  <ns>   清空该 namespace 整张图谱 [危险,需确认]
    task <id>           查异步任务状态

  压缩 (headroom;镜像未重建时 available=false,属正常)
    compress:stats      压缩器状态
    compress:test [txt] 试压一段文本

  MCP 配置 (本仓库的 agent-memory 服务)
    mcp:config          查看当前 agent-memory 启动参数
    mcp:fix             幂等补仓库挂载 (被 CC 覆盖就重跑)

  环境变量: AGENT_MEMORY_API (默认 http://localhost:8900)
EOF
}

# =============================================================================
# dispatch
# =============================================================================
cmd="${1:-help}"; shift || true
case "$cmd" in
  health)         cmd_health "$@" ;;
  ps)             cmd_ps "$@" ;;
  up)             cmd_up "$@" ;;
  down)           cmd_down "$@" ;;
  logs)           cmd_logs "$@" ;;
  restart)        cmd_restart "$@" ;;
  ns|namespaces)  cmd_namespaces "$@" ;;
  graph:stats)    cmd_graph_stats "$@" ;;
  graph:rebuild)  cmd_graph_rebuild "$@" ;;
  graph:clear)    cmd_graph_clear "$@" ;;
  task)           cmd_task "$@" ;;
  compress:stats) cmd_compress_stats "$@" ;;
  compress:test)  cmd_compress_test "$@" ;;
  mcp:config)     cmd_mcp_config "$@" ;;
  mcp:fix)        cmd_mcp_fix "$@" ;;
  help|-h|--help) usage ;;
  *) echo "未知命令: $cmd"; usage; exit 1 ;;
esac
