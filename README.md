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

## MCP 接入

在 AI 客户端的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "C:\\Users\\Administrator\\.conda\\envs\\agent-memory\\python.exe",
      "args": ["E:\\Agent-Memory\\Agent-Memory-Server\\server.py"]
    }
  }
}
```

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
| POST | `/api/graph/extract` | Graphify AST 提取并导入（**后台任务**，返回 `task_id`；带 `rebuild=true` 时先清空再提取） |
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

> ⚠️ **重要**：`import_graph_data` 给每个节点生成新的 uuid，不按文件路径去重。**直接对同一 namespace 再提取一次 = 图谱翻倍（旧节点全部保留 + 新节点叠上去）**，不是更新。
>
> 因此「项目更新了同步一下」的正确做法是：**先清空旧图，再重新提取**（替换而非叠加）。

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

全量 rebuild 仍会对**所有文件重新向量化**（耗时主因）。真正的「只同步改动文件」（按 mtime 增量比对）尚未实现；对「项目改完同步一下」的场景，全量 rebuild 已够用且正确。

## 设计要点与常见问题

| 要点 | 说明 |
|------|------|
| **数据库路径锚定** | `MemoryEngine` 把默认 `data/` 解析为**脚本所在目录**下的绝对路径，确保 REST / MCP / CLI 三个入口读写**同一份**数据库，不受 cwd 影响。不会再生成空的 `./data`。 |
| **大规模导入用后台任务** | `extract` / `import-file` 不再用 SSE（长连接易超时、断线后后台仍传输），改为**后台线程 + `task_id` 轮询**。前端按秒轮询 `/api/tasks/{task_id}`，断线不丢任务。 |
| **Chroma 句柄自愈** | rebuild 由另一个进程清空+重灌磁盘，长期存活的 MCP 进程内存映射的 HNSW 索引可能与磁盘不一致、`collection.query` 抛 "Error finding id"。`hybrid_search` 的查询已加 **失败→重开 client→重试一次** 的自愈逻辑（`_safe_chroma_query`），rebuild 后无需重启即可继续检索。 |
| **同步前先清空** | 重新提取同一 namespace 必须先 `clear`，否则节点翻倍（见上文 Sync 章节）。 |
| **修改 MCP 工具后需重启** | 改了 `server.py` 后，在 Claude Code 执行 `/mcp` 重启 `agent-memory`（或重进），新工具/新路径才在其他终端生效。 |
| **保护命名空间** | 设为只读的 namespace 拒绝写入/删除/清空；同步前确保目标 namespace 未被保护。 |

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
├── start.bat                    # 一键启动脚本（启动 API + UI）
├── stop.bat                     # 一键停止脚本（杀进程树，释放端口与 sqlite 锁）
├── Agent-Memory-Server/         # Python 后端
│   ├── memory_engine.py         # 核心引擎（双存储 + 混合检索 + 图谱 + clear_namespace）
│   ├── api.py                   # FastAPI REST 服务（含后台任务 + rebuild 同步）
│   ├── server.py                # MCP Server（含 project_overview / sync_codebase / clear_namespace）
│   ├── task_manager.py          # 后台任务管理（提取/导入的进度跟踪）
│   ├── graphify_bridge.py       # Graphify 提取桥接器（带进度回调）
│   ├── graph_adapter.py         # 图谱 JSON 导入适配器
│   ├── chunker.py               # 文本分块器
│   ├── ingest.py                # 批量文件导入
│   ├── rebuild_namespace.py     # 命名空间重建 CLI（清空 + 重新提取）
│   ├── requirements.txt         # Python 依赖
│   └── data/                    # 运行时数据目录
│       ├── chroma_db/           # 向量数据库
│       └── memory_metadata.db   # SQLite 元数据
├── Agent-Memory-Graphify/       # Graphify 源码（AST 提取引擎）
└── Agent-memory-ui/             # Next.js 前端
    ├── src/app/page.js          # 主页面
    ├── src/lib/api.js           # API 客户端
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
| 备份与恢复 (Backup / Restore) | 导出/导入整个 namespace 的记忆数据 | 待开发 |
