# Agent Memory System

为 AI Agent 提供持久化记忆的混合检索系统。支持语义向量搜索 + 关键词精确匹配，通过 REST API 和 MCP 协议接入任意 AI 工具。

## 架构

```
┌─────────────────────────────────────────────────┐
│                  AI Client                       │
│         (Claude / ChatGPT / 自定义 Agent)         │
└────────────┬───────────────────┬────────────────┘
             │ MCP (stdio)       │ REST API
             ▼                   ▼
┌─────────────────┐   ┌─────────────────┐
│   server.py     │   │    api.py        │
│   MCP Server    │   │   FastAPI :8900  │
└────────┬────────┘   └────────┬────────┘
         │                     │
         ▼                     ▼
┌──────────────────────────────────────┐
│          memory_engine.py            │
│         MemoryEngine (核心引擎)       │
├──────────────┬───────────────────────┤
│   ChromaDB   │    SQLite + FTS5      │
│  (向量检索)   │   (关键词 + 元数据)    │
└──────────────┴───────────────────────┘
```

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+
- Conda 环境 `agent-memory`（或自行修改 `start.bat` 中的 Python 路径）

### 安装依赖

```bash
# 后端
cd Agent-Memory-Server
pip install -r requirements.txt

# 前端
cd ../Agent-memory-ui
npm install
```

### 启动

**全部服务（API + UI）：**

```bash
start.bat
```

启动后：
- REST API 文档：http://127.0.0.1:8900/docs
- Dashboard UI：http://localhost:3000

**仅 MCP Server：**

```bash
cd Agent-Memory-Server
python server.py
```

## Docker 部署（推荐：容器化编排）

整个系统（后端 API + 前端 + MCP）可用 `docker compose` 一键管理，无需本机 conda 环境。两个镜像：

| 镜像 | 内容 | 大小 |
|---|---|---|
| `agent-memory-server` | FastAPI + ChromaDB + litellm + 本地 graphify 包（API 与 MCP 共用同一镜像） | ~1.1 GB |
| `agent-memory-ui` | Next.js 16 standalone 生产构建 | ~280 MB |

数据卷 `Agent-Memory-Server/data`（SQLite + ChromaDB）以 bind mount 挂载，**保留你已有的数据库**，容器重建/重启不丢。

### 启动 / 停止

```bash
docker compose up -d --build    # 构建并后台启动
docker compose ps               # 查看健康状态
docker compose logs -f backend  # 跟随后端日志
docker compose down             # 停止并移除容器（数据卷保留在宿主）
```

启动后：
- Dashboard UI：http://localhost:3000（局域网用 `http://<本机IP>:3000`）
- REST API 文档：http://localhost:8900/docs

### 架构要点

- **单一数据所有者**：只有 `backend` 容器写 `data/` 卷，根除历史上跨进程 ChromaDB 句柄失效（`Error finding id`）问题。
- **前端反向代理**：浏览器只访问前端一个端口（3000）。Next.js `rewrites` 把所有 `/api/*` 转发到容器内网的 `backend:8900`，所以**本机 IP 变了无需重建前端**。前端 `src/lib/api.js` 用相对路径（`BASE_URL=''`）。
- **健康检查**：`GET /health` 供 compose healthcheck；前端 `depends_on: backend (service_healthy)`。

### 配置（`.env`）

复制 `.env.example` 为 `.env` 按需调整（全部可选）：

```bash
PROTECTED_NAMESPACES=test        # 不可清空的 namespace
LLM_MODEL=                       # consolidate_memory 用的 LLM（留空=禁用）
OPENAI_API_KEY=                  # 配合 LLM_MODEL=gpt-4o-mini 等
ANTHROPIC_API_KEY=               # 配合 LLM_MODEL=claude-opus-4-8 等
```

> 注意：`NEXT_PUBLIC_API_URL` 不再需要——前端走反向代理，不烘焙后端地址。

### MCP Server 也跑在容器里（消除 stale-handle）

各 CLI 把 MCP 命令指向容器，复用 `agent-memory-server` 镜像 + 同一数据卷。每次调用 = 一次性容器，与 `backend` 共享数据但进程隔离。以 Claude Code 为例（`~/.claude.json` 的 `mcpServers`）：

```json
"agent-memory": {
  "command": "docker",
  "args": [
    "run", "-i", "--rm",
    "-v", "E:/Agent-Memory/Agent-Memory-Server/data:/app/data",
    "-e", "PYTHONIOENCODING=utf-8",
    "agent-memory-server", "python", "server.py"
  ]
}
```

> 卷路径按你的实际仓库位置改（Windows 用正斜杠 `/` 或 `E:/...`）。Codex / Gemini CLI 用各自等价的 MCP 注册命令，镜像与卷参数相同。

### 在其他设备 / 服务器上部署

已容器化，**新机器无需装 conda / Node**，只要有 Docker 即可。

**前置**：Docker（Windows / macOS 装 Docker Desktop；Linux 装 Docker Engine + Compose 插件）、git。

```bash
git clone https://github.com/Annoyinghh/Agent-Memory.git
cd Agent-Memory
cp .env.example .env            # 可选，按需改（LLM key 等）
docker compose up -d --build    # 首次构建：拉基础镜像 + chromadb + ~30 个 tree-sitter wheel
```

构建首次较久（后端镜像约 1.1 GB），完成后：
- 本机访问：http://localhost:3000
- 局域网其他设备：`http://<这台机器的IP>:3000`

> 端口默认对 LAN 开放。要纯本机自用，把 `docker-compose.yml` 里 `"3000:3000"` / `"8900:8900"` 改成 `"127.0.0.1:3000:3000"` / `"127.0.0.1:8900:8900"` 再 `up`。

**跨系统卷路径（配 MCP 时必改）**：`docker-compose.yml` 用相对路径 `./Agent-Memory-Server/data`，**在仓库根目录跑 compose 无需改**；但上面 MCP 配置用的是绝对路径，需按系统调整：

| 系统 | data 卷绝对路径示例 |
|---|---|
| Linux | `/home/<user>/Agent-Memory/Agent-Memory-Server/data:/app/data` |
| macOS | `/Users/<user>/Agent-Memory/Agent-Memory-Server/data:/app/data` |
| Windows | `C:/Users/<user>/Agent-Memory/Agent-Memory-Server/data:/app/data` |

### 数据迁移（把现有库搬到新机器）

**推荐：用备份/恢复**（最干净、无 bind mount 风险）。旧机器上：

```bash
docker exec agent-memory-backend python backup_cli.py backup --namespace <你的ns>
# 文件在旧机器 ./Agent-Memory-Server/data/backups/<ns>_<ts>.json.gz
```

把这个 `.json.gz` 拷到新机器，新机器 `docker compose up -d` 起好后用 REST 恢复（见「备份与恢复」章节），或：

```bash
docker cp <ns>_<ts>.json.gz agent-memory-backend:/app/data/backups/
docker exec agent-memory-backend python backup_cli.py restore --in /app/data/backups/<ns>_<ts>.json.gz
```

**备选：直接拷 `data/` 目录**。数据库在 `Agent-Memory-Server/data/`（SQLite `agent_memory.db` + `chroma_db/`）。新机器 clone 后是空库，把旧机器整个 `data/` 目录拷到新机器的 `Agent-Memory-Server/data/`，再 `docker compose up -d`（容器直接读挂载卷）。**注意：务必在容器停止状态下拷贝/替换 `data/`，运行时动它会导致 SQLite/ChromaDB 句柄竞态、数据损坏。**

### 常见问题

- **全息人头 / 图标消失**：前端 standalone 镜像必须带 `public/`——人头模型 `female_head_final.glb` 和各 SVG 图标都在里面（`DigitalAvatar` 用 `GLTFLoader` 加载 `/female_head_final.glb`）。Dockerfile 已用 `COPY ... /app/public` 处理；若删掉这步，`/female_head_final.glb` 返回 404，人头加载失败消失。Next.js standalone **不会自动拷贝 `public/`**，必须手动 COPY。
- **改了 `.env` 不生效**：`PROTECTED_NAMESPACES` / LLM key 等运行时变量 `docker compose up -d`（重建容器）即可生效。`NEXT_PUBLIC_*` 类（本项目不使用）才需 `--build` 重建镜像。
- **MCP 工具报错找不到**：先确认镜像已构建（`docker images | grep agent-memory-server`），且 MCP 配置里的卷路径是**绝对路径**、指向真实存在的 `data/` 目录。
- **改后端代码不生效 / 镜像还是旧的**：Docker Desktop 的 BuildKit 偶尔会对 `COPY` 层命中缓存、吃不到代码改动。改了 `Agent-Memory-Server/*.py` 后若发现行为没变，用 `docker compose build --no-cache backend` 强制重建。
- **彻底重置数据库**：停掉容器（`docker compose stop backend`）→ 删除 `data/agent_memory.db`、`data/chroma_db/`（保留 `data/backups/`）→ `docker compose up -d backend` 起空库 → 重新 `extract`。**不要在容器运行时从宿主侧删 DB 文件**——Docker Desktop 的 Windows bind mount 会留下"幽灵句柄"，删掉的文件名（如曾被容器打开）会变成 sqlite 打不开的死路径，只能 `wsl --shutdown` 重置 VM 才能恢复。

## MCP & Agent Skills 接入

> **Docker 模式（默认，推荐）**：MCP server 跑在 `agent-memory-server` 容器里，各 CLI 通过 `docker run -i --rm` 拉起，挂载与 backend 相同的 data 卷 → **单一数据所有者**，根除历史上本地 conda 进程与容器并发读写同一份 SQLite/ChromaDB 导致的 stale-handle 数据丢失。
>
> ⚠️ **务必先 `docker compose up -d --build`**（镜像存在后再注册），并**不要**再让任何 CLI 用本地 conda python 跑 `server.py`——多进程争用同一 data 目录是反复出现"数据消失"的根因。

### 1. 自动部署（推荐）
本项目提供一键部署脚本 [install_skills.py](file:///e:/Agent-Memory/install_skills.py)。**先 `docker compose up -d --build` 起好容器**，再在项目根目录运行：

```bash
python install_skills.py            # Docker 模式：给各 CLI 注册 docker 版 MCP + 分发 SKILL.md
python install_skills.py --skip-mcp # 只分发 SKILL.md，不动 MCP 配置
```

脚本会校验 Docker 可用且镜像已构建，然后向 Claude Code / Codex / Gemini(Antigravity) 注册 `docker run -i --rm -v <data>:/app/data agent-memory-server python server.py` 形式的 MCP。

---

### 2. 手动注册 / 跨机器配置

每个 CLI 注册命令的 `command=docker`，`args` 为 `run -i --rm -v <data卷>:/app/data -e PYTHONIOENCODING=utf-8 agent-memory-server python server.py`：

| 客户端 CLI | MCP 注册命令 (示例) | 本地配置文件路径 | Skill 存放路径 |
| :--- | :--- | :--- | :--- |
| **Claude Code** | `claude mcp add agent-memory --env PYTHONIOENCODING=utf-8 -- docker run -i --rm -v <DATA>:/app/data agent-memory-server python server.py` | 全局：`~/.claude.json`<br>项目：`.mcp.json` | 全局：`~/.claude/skills/`<br>项目：`.claude/skills/` |
| **Codex** | `codex mcp add agent-memory -- docker run -i --rm -v <DATA>:/app/data agent-memory-server python server.py` | 全局：`~/.codex/config.toml`<br>项目：`.codex/config.toml` | 全局：`~/.codex/skills/`<br>项目：`.codex/skills/` |
| **Gemini CLI** | `gemini mcp add agent-memory docker run -i --rm -v <DATA>:/app/data agent-memory-server python server.py` | 全局：`~/.gemini/config.json`<br>项目：`.gemini/settings.json` | 全局：`~/.gemini/skills/`<br>项目：`.gemini/skills/` |
| **Antigravity** | *(同 Gemini CLI)* | 全局：`~/.gemini/config.json`<br>项目：`.gemini/settings.json` | 项目：`.agents/skills/` |

> 💡 **`<DATA>`**：data 卷的宿主绝对路径，正斜杠写法。例：`E:/Agent-Memory/Agent-Memory-Server/data`（Windows）/ `/home/user/Agent-Memory/Agent-Memory-Server/data`（Linux）/ `/Users/user/...`（macOS）。
>
> 旧版（已废弃）：`<python_path> <server_path>` 直接用 conda python 跑 server.py。`install_skills.py --local` 仍保留此模式，但与 Docker backend 并存会触发数据竞态，**不要混用**。

---

连接后 AI 可调用以下工具：

| 工具 | 说明 |
|------|------|
| `insert_memory(namespace, content, source, dedup_threshold)` | 写入一条长期记忆（支持语义去重） |
| `update_memory(doc_id, namespace, content, source)` | 更新一条长期记忆 |
| `hybrid_search(namespace, query, top_k)` | 混合检索长期记忆 |
| `pack_context(namespace, query, max_tokens)` | 组装在 token 预算内的最优长期上下文 (XML格式) |
| `add_short_term_memory(namespace, role, content)` | 添加一条短期对话记忆（滑动窗口） |
| `get_short_term_memory(namespace)` | 获取当前 namespace 的短期记忆 |
| `write_working_memory(namespace, key, value)` | 写入或更新工作记忆 (Scratchpad) |
| `read_working_memory(namespace, key)` | 读取指定的工作记忆 |
| `list_working_memory(namespace)` | 列出所有的工作记忆状态 |
| `delete_working_memory(namespace, key)` | 删除指定的工作记忆 |
| `clear_working_memory(namespace)` | 清空所有的工作记忆 |
| `consolidate_memory(namespace)` | 调用大模型，将短期记忆总结提炼，转化为长期记忆 |
| `freeze_snapshot(namespace, summary)` | 创建高优先级快照 |
| `create_session(namespace, session_id?)` | 创建会话 |
| `list_sessions(namespace, status?)` | 列出会话 |
| `get_session_context(session_id, max_tokens)` | 恢复会话上下文（XML 格式打包） |
| `close_session(session_id)` | 关闭会话 |
| `link_memory_to_session(session_id, memory_id)` | 关联记忆到会话 |
| `unlink_memory_from_session(session_id, memory_id)` | 解除记忆与会话的关联 |
| `add_memory_edge(from_id, to_id, relation_type, confidence)` | 添加图谱边 |
| `get_neighbors(node_id, relation_type?, direction?, limit?)` | 查询相邻节点 |
| `get_node_detail(node_id)` | 获取节点详情 |
| `find_path(from_id, to_id, max_depth)` | 最短路径查找 |
| `graph_stats(namespace?)` | 图谱统计 |
| `project_overview()` | **一次性识别项目**：列出所有 namespace 的节点/边数、类型、token 估算与样本（调用其他工具前先用它定位，避免去翻数据库文件） |
| `precise_source_search(namespace, query, max_results?, context_lines?)` | 在已导入的源码中精确搜索关键词/常量/API 片段（摘要不够细时用） |
| `clear_namespace(namespace)` | 清空整个 namespace 的图谱（节点+边+向量）。重新提取前调用，避免重复堆积 |
| `sync_codebase(target_dir, namespace)` | **同步更新代码库**：先清空再重新提取（同步执行，慢；超大库建议改用 REST 后台任务） |
| `import_graph(namespace, nodes_json, edges_json)` | 批量导入图谱 |

## REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/memory/insert` | 插入长期记忆（支持语义去重） |
| POST | `/api/memory/update` | 更新长期记忆 |
| POST | `/api/memory/search` | 混合检索长期记忆 |
| POST | `/api/memory/pack` | 组装在 token 预算内的最优上下文 (XML格式) |
| GET | `/api/memory/search?namespace=&query=&top_k=` | GET 方式检索 |
| POST | `/api/memory/short_term` | 添加短期对话记忆 |
| GET | `/api/memory/short_term?namespace=` | 获取短期记忆列表 |
| DELETE | `/api/memory/short_term?namespace=&index=` | 删除/清空短期记忆 |
| POST | `/api/memory/working` | 写入工作记忆 (Scratchpad) |
| GET | `/api/memory/working?namespace=&key=` | 读取工作记忆 |
| GET | `/api/memory/working/list?namespace=` | 获取工作记忆全量状态 |
| DELETE | `/api/memory/working?namespace=&key=` | 删除工作记忆 |
| DELETE | `/api/memory/working/clear?namespace=` | 清空工作记忆 |
| POST | `/api/memory/consolidate` | 提炼短期记忆至长期记忆 |
| POST | `/api/memory/pin` | 置顶/取消置顶长期记忆 |
| POST | `/api/memory/access` | 记录一次访问（提高权重） |
| POST | `/api/memory/forget` | 主动遗忘：按容量上限淘汰低分记忆 |
| POST | `/api/memory/snapshot` | 创建快照 |
| DELETE | `/api/memory/delete` | 删除长期记忆（按 ID 或 source 前缀） |
| GET | `/api/namespaces` | 列出所有命名空间 |
| GET | `/api/stats` | 统计信息 |
| POST | `/api/sessions` | 创建会话 |
| GET | `/api/sessions?namespace=&status=` | 列出会话 |
| GET | `/api/sessions/{session_id}` | 获取会话详情 |
| PUT | `/api/sessions/{session_id}/status` | 更新会话状态 |
| POST | `/api/sessions/link` | 关联记忆到会话 |
| POST | `/api/sessions/unlink` | 解除记忆与会话关联 |
| GET | `/api/sessions/{session_id}/memories` | 获取会话关联的记忆列表 |
| POST | `/api/sessions/context` | 恢复会话上下文（XML 打包） |
| DELETE | `/api/sessions/{session_id}` | 删除会话 |
| POST | `/api/graph/edge` | 添加图谱边（关系） |
| DELETE | `/api/graph/edge` | 删除图谱边 |
| POST | `/api/graph/neighbors` | 查询节点的相邻节点 |
| GET | `/api/graph/node/{node_id}` | 获取节点详情（含所有边） |
| POST | `/api/graph/path` | 查找两个节点间的最短路径 |
| GET | `/api/graph/stats` | 图谱统计（节点数、边数、关系类型） |
| GET | `/api/graph/data?namespace=` | 获取图谱全量数据（可视化用） |
| POST | `/api/graph/import` | 批量导入图谱数据 |
| POST | `/api/graph/extract` | Graphify AST 提取并导入（**后台任务**，返回 `task_id`；`rebuild=true` 先清空再全量提取；`incremental=true` 只更新变化文件） |
| POST | `/api/graph/clear` | 清空 namespace 的整个图谱（节点+边+向量），用于同步前清理 |
| GET | `/api/tasks/{task_id}` | 查询后台任务进度（提取/导入的状态、stage、百分比、结果） |
| POST | `/api/graph/import-file` | 导入已有 graph.json 文件（后台任务） |
| POST | `/api/namespaces/protect` | 保护命名空间（只读） |
| POST | `/api/namespaces/unprotect` | 解除命名空间保护 |
| GET | `/api/namespaces/protected` | 列出所有受保护的命名空间 |

## 批量导入

```bash
cd Agent-Memory-Server
python ingest.py --dir ./your-docs --namespace myproject --ext .md,.txt,.py
```

| 参数 | 说明 |
|------|------|
| `--dir` | 要扫描的目录 |
| `--namespace` | 存入的命名空间 |
| `--ext` | 文件扩展名，逗号分隔（默认 `.md,.txt,.py`） |

## 知识图谱 (Graphify 集成)

基于 [Graphify](https://github.com/getgrasp/graphify) 的 tree-sitter AST 提取，将代码库转换为可查询的知识图谱。

### 工作原理

```
源代码目录 ──► collect_files() ──► AST 提取 (tree-sitter) ──► nodes + edges
                                                                │
                                                                ▼
                                            memory_engine.import_graph_data()
                                                     │
                                          ┌──────────┴──────────┐
                                          │                     │
                                     ChromaDB (内容向量)   memory_edges (关系表)
```

### 关系类型

| 关系 | 说明 |
|------|------|
| `contains` | A 包含 B（文件包含函数、类包含方法） |
| `calls` | A 调用 B |
| `imports` / `imports_from` | A 导入 B |
| `inherits` | A 继承 B |
| `references` | A 引用 B |
| `method` | A 是 B 的方法 |
| `rationale_for` | 注释/文档归属于节点 |

### 支持的语言 (36+)

Python, JavaScript, TypeScript, Java, Go, Rust, C, C++, C#, Ruby, PHP, Swift, Kotlin, Scala, Bash, SQL, JSON, Lua, Zig, Groovy, Fortran, Elixir, Objective-C, Julia, Verilog, PowerShell, Dart 等。

### CLI 用法

```bash
# 从目录提取并导入
python graphify_bridge.py extract --dir /path/to/code --namespace myproject

# 导入已有 graph.json
python graphify_bridge.py import --graph graph.json --namespace myproject
```

### API 调用

```bash
# 提取目录
curl -X POST http://127.0.0.1:8900/api/graph/extract \
  -H "Content-Type: application/json" \
  -d '{"target_dir": "E:/my-project", "namespace": "myproject"}'

# 导入 graph.json
curl -X POST http://127.0.0.1:8900/api/graph/import-file \
  -H "Content-Type: application/json" \
  -d '{"graph_path": "graph.json", "namespace": "myproject"}'
```

## 代码库同步 (Sync / Rebuild)

> ⚠️ **重要**：`import_graph_data` 默认给每个节点生成新的 uuid，不按文件路径去重。**直接对同一 namespace 再提取一次（`rebuild=false, incremental=false`）= 图谱翻倍**（旧节点全部保留 + 新节点叠上去），不是更新。
>
> 因此「项目更新了同步一下」有两种正确做法：
> - **`rebuild=true`**：清空旧图 → 全量重新提取（替换）。适合大改、想彻底重来。
> - **`incremental=true`**：只更新变化的文件（见下方「方式一·补充」）。适合只改了几个文件，省时。

### 方式一：REST 后台任务（推荐，带进度，不超时）

```bash
# 1. 提交同步任务（rebuild=true 会先清空该 namespace 再重新提取）
curl -X POST http://127.0.0.1:8900/api/graph/extract \
  -H "Content-Type: application/json" \
  -d '{"target_dir": "E:/my-project", "namespace": "myproject", "rebuild": true}'
# => {"task_id": "...", "namespace": "myproject", "message": "同步任务已创建（先清空再重新提取）"}

# 2. 轮询任务进度（前端每秒一次）
curl http://127.0.0.1:8900/api/tasks/<task_id>
# => {"status": "running", "stage": "chroma", "current": 4800, "total": 9530, "percent": 50, ...}
```

进度的 `stage` 依次为：`clear`（清空旧图）→ `collect` → `extract`（AST）→ `parse` → `prepare` → `sqlite` → `chroma`（向量化，最慢）→ `edges` → `community` → `metadata` → `complete`。

### 方式一·补充：增量更新（`incremental=true`，改几个文件时最省时）

`rebuild=true` 是"清空全部 → 全量重嵌"，对大库（数千节点）很慢。**只改了几个文件时用 `incremental=true`**：它按文件内容哈希比对清单（`graph_manifest`），**只对变化的文件重新抽取 + 重新嵌入**，未变文件的向量原样保留。

```bash
# 增量同步：只更新变化的文件（首次/无清单时自动退化为全量并建立清单）
curl -X POST http://127.0.0.1:8900/api/graph/extract \
  -H "Content-Type: application/json" \
  -d '{"target_dir": "E:/my-project", "namespace": "myproject", "incremental": true}'
# => {"message": "增量任务已创建（仅更新变化文件）", ...}
# 若完全无变化: result.skipped_unchanged = true，秒级返回
```

**机制**：
- 全量抽取仍跑（graphify AST 缓存让未变文件≈秒级），保证**跨文件 import 边**正确解析；但只有变化文件的节点会重新 embedding。
- 变化/删除的文件：先按 `source_file` 限定清掉其旧节点，再导入新的。
- 边解析会回查 `graph_nodes.external_id`，所以"变化节点↔未变节点"的边不会丢。
- 增量模式**跳过 Louvain 社区重算**（社区仅用于可视化着色，不影响检索）；需要准确着色时跑一次 `rebuild=true`。
- MCP 工具 `sync_codebase(target_dir, namespace, incremental=true)` 同样支持。

**实测**（shipbearERP 的 clickup 子目录，418 节点）：未变再增量 = 3 秒 / 0 重嵌（基线全量 51 秒）；改一个文件只重嵌该文件节点；删文件则该文件节点清零。跨 namespace 隔离已验证（不影响其他 namespace）。

> `rebuild` 与 `incremental` 互斥，同时传时 `rebuild` 优先（强制全量清空）。

只清空不重新提取（手动分两步）：

```bash
curl -X POST http://127.0.0.1:8900/api/graph/clear \
  -H "Content-Type: application/json" \
  -d '{"namespace": "myproject"}'
# => {"deleted_count": 9530, "message": "cleared namespace 'myproject'"}
```

### 方式二：MCP（在 AI 终端直接同步）

```text
# 一键同步（清空 + 重新提取，同步执行）
sync_codebase(target_dir="E:/my-project", namespace="myproject")

# 或只清空，再用别的方式导入
clear_namespace(namespace="myproject")

# 同步后用 project_overview 确认结果
project_overview()
```

> ⚠️ MCP 的 `sync_codebase` 是**同步阻塞**调用，会重新 AST 解析 + 向量化整棵树，超大库可能超过 MCP 工具调用超时。**超大库请改用方式一的 REST 后台任务**（异步、有进度、不超时）。MCP 工具内部已把提取进度输出重定向到 stderr，不会破坏 stdio 的 JSON-RPC 协议。

### 同步还是慢？

全量 `rebuild` 会对**所有文件重新向量化**（耗时主因）。改了几个文件想快速同步时，用**增量更新**（`incremental=true`，见上方「方式一·补充」）——只对内容变化的文件重新向量化，未变文件保留原向量，通常几秒搞定。需要重排社区着色时再用一次全量 `rebuild`。

## 备份与恢复 (Backup / Restore)

把一个 namespace 的**完整快照**（记忆 + 图谱节点/边 + **原始 ChromaDB 向量** + 提取清单 + sessions + 工作记忆）导出为单个 `.json.gz` 文件，可跨机器迁移或从误删/数据损坏中恢复。

**设计要点**：向量原样导出，恢复时直接灌回、**不重新向量化**——9k 节点的恢复是秒级而非分钟级。恢复采用 **REPLACE 语义**（先清空目标 namespace 再导入），保留原始 id / 时间戳 / 访问计数 / 置顶状态 / 社区归属。备份只读、永远允许（即便受保护 namespace）；**恢复到受保护 namespace 会被拒绝**（先 unprotect）。

### 方式一：CLI（可 cron / 可 docker exec，数据丢失防护的主载体）

```bash
# 备份（默认写到 <data-dir>/backups/<ns>_<时间戳>.json.gz，在持久卷内、宿主可见）
python backup_cli.py backup --namespace myproject
# 指定输出路径
python backup_cli.py backup --namespace myproject --out /backups/myproject.json.gz

# 恢复（默认恢复到备份里的 namespace；--target 恢复到别的 namespace = 复制/迁移）
python backup_cli.py restore --in <data-dir>/backups/myproject_20260622-103000.json.gz
python backup_cli.py restore --in /backups/myproject.json.gz --target myproject_copy

# Docker 里（容器名按实际）：
docker exec agent-memory-backend python backup_cli.py backup --namespace shipbearERP-master
# 文件会落在宿主 ./Agent-Memory-Server/data/backups/
```

**定时自动备份**（Linux cron，每天 3:17 备份关键 namespace）：
```cron
17 3 * * *  docker exec agent-memory-backend python backup_cli.py backup --namespace shipbearERP-master >> /var/log/ambk.log 2>&1
```

### 方式二：REST（前端集成用）

```bash
# 下载备份文件
curl -o myproject.json.gz "http://localhost:8900/api/backup?namespace=myproject"

# 上传恢复（后台任务，返回 task_id；轮询进度见「代码库同步」的轮询方式）
curl -X POST "http://localhost:8900/api/restore?target_namespace=myproject" \
     -F "file=@myproject.json.gz"
# => {"task_id": "...", "namespace": "myproject", "message": "恢复任务已创建（将清空目标 namespace 后导入）"}

# 轮询：GET /api/tasks/{task_id}  （stage: clear → sqlite → chroma → graph → sessions → complete）
```

### 方式三：MCP（在 AI 终端直接操作）

```
backup_namespace(namespace="myproject")                      # → 返回文件路径与统计
restore_namespace(file_path="<data-dir>/backups/myproject_<ts>.json.gz", target_namespace="myproject")
```

> ⚠️ MCP 的 `restore_namespace` 对超大 namespace 可能超 MCP 工具调用超时，**超大库请用方式二的 REST 后台任务**（异步、有进度）。备份是只读、秒级，MCP 直接用即可。

## 设计要点与常见问题

| 要点 | 说明 |
|------|------|
| **数据库路径锚定** | `MemoryEngine` 把默认 `data/` 解析为**脚本所在目录**下的绝对路径，确保 REST / MCP / CLI 三个入口读写**同一份**数据库，不受 cwd 影响。不会再生成空的 `./data`。 |
| **大规模导入用后台任务** | `extract` / `import-file` 不再用 SSE（长连接易超时、断线后后台仍传输），改为**后台线程 + `task_id` 轮询**。前端按秒轮询 `/api/tasks/{task_id}`，断线不丢任务。 |
| **Chroma 句柄自愈** | rebuild 由另一个进程清空+重灌磁盘，长期存活的 MCP 进程内存映射的 HNSW 索引可能与磁盘不一致、`collection.query` 抛 "Error finding id"。`hybrid_search` 的查询已加 **失败→重开 client→重试一次** 的自愈逻辑（`_safe_chroma_query`），rebuild 后无需重启即可继续检索。 |
| **同步前先清空** | 重新提取同一 namespace 必须先 `clear`，否则节点翻倍（见上文 Sync 章节）。 |
| **修改 MCP 工具后需重启** | 改了 `server.py` 后，在 Claude Code 执行 `/mcp` 重启 `agent-memory`（或重进），新工具/新路径才在其他终端生效。 |
| **保护命名空间** | 设为只读的 namespace 拒绝写入/删除/清空；同步前确保目标 namespace 未被保护。 |
| **恢复会先清空目标** | `restore` 采用 REPLACE 语义：导入前先清空目标 namespace 的**全部**数据（含 sessions/工作记忆/清单，比 `clear` 更全）。恢复到受保护 namespace 被拒绝。**先备份再恢复**。备份文件默认落 `<data-dir>/backups/`（持久卷内），建议配 cron 定期备份以防数据丢失。 |

## 检索算法

混合检索按以下步骤计算最终得分：

1. **FTS5 精确匹配**：关键词命中得基础分 1.0
2. **ChromaDB 向量搜索**：语义相似度 0.0 ~ 1.0
3. **双重命中加成**：同时被两种方式检索到，分数相加
4. **快照加权**：`source=snapshot` 的记忆 ×1.5
5. **置顶加权**：`is_pinned` 的记忆 ×2.0
6. **访问频率加权**：`score *= (1.0 + 0.1 * log(1 + access_count))`
7. **时间衰减**：30 天半衰期，`score *= 0.5^(age/2592000)`

## 项目结构

```
Agent-Memory/
├── docker-compose.yml           # 容器编排（backend + frontend, 推荐）
├── .dockerignore                # 构建上下文排除（绝不烤入 data/）
├── .env.example                 # Docker 环境变量模板
├── start.bat                    # 一键启动脚本（启动 API + UI，非容器模式）
├── stop.bat                     # 一键停止脚本（杀进程树，释放端口与 sqlite 锁）
├── Agent-Memory-Server/         # Python 后端
│   ├── Dockerfile               # 后端镜像（Python + graphify, API/MCP 共用）
│   ├── memory_engine.py         # 核心引擎（双存储 + 混合检索 + 图谱 + clear_namespace）
│   ├── api.py                   # FastAPI REST 服务（含后台任务 + rebuild 同步 + /health）
│   ├── server.py                # MCP Server（含 project_overview / sync_codebase / clear_namespace）
│   ├── task_manager.py          # 后台任务管理（提取/导入的进度跟踪）
│   ├── graphify_bridge.py       # Graphify 提取桥接器（带进度回调）
│   ├── graph_adapter.py         # 图谱 JSON 导入适配器
│   ├── chunker.py               # 文本分块器
│   ├── ingest.py                # 批量文件导入
│   ├── rebuild_namespace.py     # 命名空间重建 CLI（清空 + 重新提取）
│   ├── requirements.txt         # Python 依赖
│   └── data/                    # 运行时数据目录（容器内 bind mount 持久化）
│       ├── chroma_db/           # 向量数据库
│       ├── agent_memory.db      # SQLite 元数据 (FTS5 + 图谱 + 清单 + sessions)
│       ├── chroma_db/           # ChromaDB 向量
│       └── backups/             # namespace 备份 (.json.gz，备份/恢复功能产物)
├── Agent-Memory-Graphify/       # Graphify 源码（AST 提取引擎，构建时打包进后端镜像）
└── Agent-memory-ui/             # Next.js 前端
    ├── Dockerfile               # 前端镜像（standalone 多阶段构建）
    ├── next.config.mjs          # output:standalone + /api 反向代理 rewrites
    ├── src/app/page.js          # 主页面
    ├── src/lib/api.js           # API 客户端（相对路径 BASE_URL）
    ├── src/context/AppContext.js # 全局状态
    └── src/components/          # UI 组件
```

## 技术栈

- **后端**：Python / FastAPI / MCP / ChromaDB / SQLite FTS5 / LiteLLM / Graphify (tree-sitter AST)
- **前端**：Next.js 16 / React 19 / Three.js / Tailwind CSS

## 开发路线图

### P0 — 基础能力补全

| 功能 | 说明 | 状态 |
|------|------|------|
| 记忆更新 (Memory Update) | 按 doc_id 更新已有记忆的 content 和 source | 已完成 |
| 记忆去重 (Deduplication) | 写入时检测语义相似度，超过阈值自动合并或标记重复 | 已完成 |
| 上下文打包器 (Context Packer) | 在 token 预算内，按重要性排序组装最优上下文，输出 XML 格式 prompt 片段 | 已完成 |

### P1 — 分层记忆架构

| 功能 | 说明 | 状态 |
|------|------|------|
| 短期记忆 (Short-term Memory) | 最近 N 轮对话的滑动窗口，易失性，不写 ChromaDB | 已完成 |
| 工作记忆 (Working Memory) | 当前任务的上下文状态（Scratchpad），任务完成后可提炼为长期记忆 | 已完成 |
| 记忆整合 (Memory Consolidation) | 调用 LLM 将短期记忆自动摘要为精简的长期记忆，类似"睡眠巩固" | 已完成 |

### P2 — 智能化管理

| 功能 | 说明 | 状态 |
|------|------|------|
| 重要性评分 (Importance Scoring) | 基于访问频率（log 加权）、用户置顶（2x boost）计算综合重要性 | 已完成 |
| 主动遗忘 (Active Forgetting) | 按 namespace 容量上限淘汰低分、未置顶的记忆 | 已完成 |
| 会话管理 (Session Management) | 记忆归属会话、跨会话记忆迁移、会话恢复时自动加载上下文 | 已完成 |

### P3 — 高级特性

| 功能 | 说明 | 状态 |
|------|------|------|
| 知识图谱 (Knowledge Graph) | 基于 Graphify 的 AST 提取，支持节点/边的 CRUD、最短路径、邻居查询、批量导入 | 已完成 |
| 命名空间保护 (Namespace Protection) | 将指定命名空间设为只读，禁止写入/删除操作 | 已完成 |
| 多用户隔离 (Multi-tenant) | 不同用户/Agent 的记忆完全隔离，支持权限控制 | 待开发 |
| 备份与恢复 (Backup / Restore) | 导出/导入整个 namespace 的记忆数据（含 ChromaDB 向量，恢复不重新向量化；REST / MCP / CLI 三入口） | 已完成 |
