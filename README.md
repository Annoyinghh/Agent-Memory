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

连接后 AI 可调用三个工具：

| 工具 | 说明 |
|------|------|
| `insert_memory(namespace, content, source)` | 写入一条记忆 |
| `hybrid_search(namespace, query, top_k)` | 混合检索 |
| `freeze_snapshot(namespace, summary)` | 创建高优先级快照 |

## REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/memory/insert` | 插入记忆 |
| POST | `/api/memory/search` | 混合检索 |
| GET | `/api/memory/search?namespace=&query=&top_k=` | GET 方式检索 |
| POST | `/api/memory/snapshot` | 创建快照 |
| DELETE | `/api/memory/delete` | 删除记忆（按 ID 或 source 前缀） |
| GET | `/api/namespaces` | 列出所有命名空间 |
| GET | `/api/stats` | 统计信息 |

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

## 检索算法

混合检索按以下步骤计算最终得分：

1. **FTS5 精确匹配**：关键词命中得基础分 1.0
2. **ChromaDB 向量搜索**：语义相似度 0.0 ~ 1.0
3. **双重命中加成**：同时被两种方式检索到，分数相加
4. **快照加权**：`source=snapshot` 的记忆 ×1.5
5. **时间衰减**：30 天半衰期，`score *= 0.5^(age/2592000)`

## 项目结构

```
Agent-Memory/
├── start.bat                    # 一键启动脚本
├── Agent-Memory-Server/         # Python 后端
│   ├── memory_engine.py         # 核心引擎（双存储 + 混合检索）
│   ├── api.py                   # FastAPI REST 服务
│   ├── server.py                # MCP Server
│   ├── chunker.py               # 文本分块器
│   ├── ingest.py                # 批量文件导入
│   ├── requirements.txt         # Python 依赖
│   └── data/                    # 运行时数据目录
│       ├── chroma_db/           # 向量数据库
│       └── memory_metadata.db   # SQLite 元数据
└── Agent-memory-ui/             # Next.js 前端
    ├── src/app/page.js          # 主页面
    ├── src/lib/api.js           # API 客户端
    ├── src/context/AppContext.js # 全局状态
    └── src/components/          # UI 组件
```

## 技术栈

- **后端**：Python / FastAPI / MCP / ChromaDB / SQLite FTS5
- **前端**：Next.js 16 / React 19 / Three.js / Tailwind CSS

## 开发路线图

### P0 — 基础能力补全

| 功能 | 说明 | 状态 |
|------|------|------|
| 记忆更新 (Memory Update) | 按 doc_id 更新已有记忆的 content 和 source，当前只有 insert/delete | 待开发 |
| 记忆去重 (Deduplication) | 写入时检测语义相似度，超过阈值自动合并或标记重复 | 待开发 |
| 上下文打包器 (Context Packer) | 在 token 预算内，按重要性排序组装最优上下文，输出格式化 prompt 片段供 LLM 直接消费 | 待开发 |

### P1 — 分层记忆架构

| 功能 | 说明 | 状态 |
|------|------|------|
| 短期记忆 (Short-term Memory) | 最近 N 轮对话的滑动窗口，易失性，不写 ChromaDB | 待开发 |
| 工作记忆 (Working Memory) | 当前任务的上下文状态（Scratchpad），任务完成后可提炼为长期记忆 | 待开发 |
| 记忆整合 (Memory Consolidation) | 将高频访问的短期记忆自动摘要为精简的长期记忆，类似"睡眠巩固" | 待开发 |

### P2 — 智能化管理

| 功能 | 说明 | 状态 |
|------|------|------|
| 重要性评分 (Importance Scoring) | 基于访问频率、用户标记、来源权重计算综合重要性 | 待开发 |
| 主动遗忘 (Active Forgetting) | 定期清理低分、过时、冗余记忆，支持 namespace 容量上限 | 待开发 |
| 会话管理 (Session Management) | 记忆归属会话、跨会话记忆迁移、会话恢复时自动加载上下文 | 待开发 |

### P3 — 高级特性

| 功能 | 说明 | 状态 |
|------|------|------|
| 记忆关系图谱 (Memory Relations) | 记忆间的引用、因果、时序关系，支持 multi-hop 推理 | 待开发 |
| 多用户隔离 (Multi-tenant) | 不同用户/Agent 的记忆完全隔离，支持权限控制 | 待开发 |
| 备份与恢复 (Backup / Restore) | 导出/导入整个 namespace 的记忆数据 | 待开发 |
