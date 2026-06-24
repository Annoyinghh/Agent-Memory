'use client';

import React, { useState } from 'react';
import GlassCard from './GlassCard';

export default function TutorialBook() {
  const [activePageId, setActivePageId] = useState('intro');
  const [mcpClientTab, setMcpClientTab] = useState('claude');

  // 用户可以在这个数组中自由添加、修改或删除页面内容。
  const PAGES_DATA = [
    {
      id: 'intro',
      title: '1. 系统简介 (Introduction)',
      content: (
        <div className="font-mono">
          <p style={{ marginBottom: '10px' }}>
            <strong className="text-cyan">这是什么：</strong>给 AI 的「外置记忆」。你把笔记、文档、代码结构存进来；需要时系统自动挑出最相关的那几条，压缩后塞进 AI 上下文——让 AI 记得住、看得全，还省 token。
          </p>
          <p style={{ marginBottom: '8px' }}>
            <strong className="text-cyan">一眼用法（3 步）：</strong>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '12px', paddingLeft: '2px' }}>
            <div>① <strong className="text-white">写入</strong> —— 把要记的东西贴进来，加个来源标签。</div>
            <div>② <strong className="text-white">检索</strong> —— 输入问题，返回最相关的几条记忆。</div>
            <div>③ <strong className="text-white">会话</strong> —— 关联进会话，跨对话把上下文交给 AI。</div>
          </div>
          <div className="sci-note-text" style={{ marginTop: '10px' }}>
            💡 左侧目录可跳转各章节。中央全息人头会响应每次操作；右上角切换器选当前库（<code className="text-cyan">default</code> 单库 / <code className="text-cyan">all</code> 跨库检索）。
          </div>
        </div>
      )
    },
    {
      id: 'quickstart',
      title: '2. 快速上手 (Quick Start)',
      content: (
        <div className="font-mono" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '4px' }}>
          <p style={{ marginBottom: '4px' }}>三分钟跑通，确认系统正常工作：</p>
          <div className="workflow-link-item">
            <span className="bullet">1️⃣</span>
            <div className="wf-body">
              <span className="title text-white">存一条记忆</span>
              <span className="desc">「写入」→ 来源标签填 <code className="text-cyan">demo</code> → 贴一段文字 → 写入</span>
            </div>
          </div>
          <div className="workflow-link-item">
            <span className="bullet">2️⃣</span>
            <div className="wf-body">
              <span className="title text-white">把它找出来</span>
              <span className="desc">「检索」→ 用刚才文字里的关键词提问 → 应返回这条</span>
            </div>
          </div>
          <div className="workflow-link-item">
            <span className="bullet">3️⃣</span>
            <div className="wf-body">
              <span className="title text-white">带进对话</span>
              <span className="desc">检索结果点「+ 会话」关联 → 在「会话」里查看并延续上下文</span>
            </div>
          </div>
          <div className="sci-note-text" style={{ marginTop: '6px' }}>
            💡 每步中央全息人头都会给反馈；右上角切换器确认当前库（默认 <code className="text-cyan">default</code>）。
          </div>
        </div>
      )
    },
    {
      id: 'concepts',
      title: '3. 核心概念 (Concepts)',
      content: (
        <div className="font-mono" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '4px' }}>
          <div className="workflow-link-item">
            <span className="bullet">🗂️</span>
            <div className="wf-body">
              <span className="title text-white">命名空间 (Namespace)</span>
              <span className="desc">记忆的「抽屉」，互相隔离。切换器选 <code className="text-cyan">default</code>（单库）或 <code className="text-cyan">all</code>（跨库检索）</span>
            </div>
          </div>
          <div className="workflow-link-item">
            <span className="bullet">🧠</span>
            <div className="wf-body">
              <span className="title text-white">记忆 (Memory)</span>
              <span className="desc">一条带来源标签的文本块，写入后被向量化，可按语义检索</span>
            </div>
          </div>
          <div className="workflow-link-item">
            <span className="bullet">💬</span>
            <div className="wf-body">
              <span className="title text-white">会话 (Session)</span>
              <span className="desc">把若干记忆关联到一次对话，跨会话延续上下文</span>
            </div>
          </div>
          <div className="workflow-link-item">
            <span className="bullet">🕸️</span>
            <div className="wf-body">
              <span className="title text-white">知识图谱 (Graph)</span>
              <span className="desc">把代码仓库解析成「文件 / 函数 / 类 + 调用 / 引用」关系的可查询图</span>
            </div>
          </div>
          <div className="workflow-link-item">
            <span className="bullet">🗜️</span>
            <div className="wf-body">
              <span className="title text-white">压缩 (Compress)</span>
              <span className="desc">注入前压小记忆内容省 token；带 key，可随时取回原文（可逆）</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'tokens',
      title: '4. 省 token 实测 (Token Savings)',
      content: (
        <div className="font-mono">
          <p style={{ marginBottom: '10px' }}>
            <strong className="text-cyan">这是真的、可量化的省 token。</strong>拿一段真实 JSON（60 条事件日志）走压缩，账本一目了然：
          </p>
          <div style={{ background: 'rgba(8,7,5,0.4)', border: '1px solid rgba(255,187,0,0.12)', borderRadius: '6px', padding: '10px', marginBottom: '12px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>压缩前（完整 JSON）</span><strong className="text-white">1764 token</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>压缩后（表头 + CSV）</span><strong className="text-cyan">798 token</strong>
            </div>
            <div style={{ borderTop: '1px dashed rgba(255,187,0,0.2)', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
              <span>省下</span><strong style={{ color: '#9dff6e' }}>966 token（≈ 55%）</strong>
            </div>
          </div>

          <p style={{ marginBottom: '8px' }}>
            <strong className="text-cyan">落到记忆注入（pack_context）——预算固定，能多塞几条：</strong>
          </p>
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '10px', fontSize: '11px', lineHeight: '1.7', marginBottom: '10px' }}>
            <div>预算 <code className="text-cyan">2000</code> token：</div>
            <div>· 压缩关 → 装得下 ~5 条记忆</div>
            <div>· 压缩开 → 同样 5 条只占 ~800 token，<strong className="text-white">还能再塞几条</strong></div>
            <div>· 每条带 <code className="text-cyan">retrieve=&quot;hr-xxxx&quot;</code></div>
            <div>· 要原文 → <code className="text-cyan">headroom_retrieve(&quot;hr-xxxx&quot;)</code> 立刻取回（0 损失）</div>
          </div>

          <div className="sci-note-text" style={{ marginTop: '6px' }}>
            💡 各类型实测：JSON/结构化 ≈ 省 55–60%、日志 ≈ 省 95%；代码/散文常原样返回（不损坏内容）。低于 50 token 的小块直接跳过。随时自测：<code className="text-cyan">./ops.sh compress:test &quot;你的文本&quot;</code>。
          </div>
        </div>
      )
    },
    {
      id: 'workflows',
      title: '5. 常见工作流 (Workflows)',
      content: (
        <div className="font-mono" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '4px' }}>
          <div className="workflow-link-item">
            <span className="bullet">⚡</span>
            <div className="wf-body">
              <span className="title text-white">存笔记 / 文档</span>
              <span className="desc">「写入」→ 填来源标签 → 贴入文本写入</span>
            </div>
          </div>
          <div className="workflow-link-item">
            <span className="bullet">⚡</span>
            <div className="wf-body">
              <span className="title text-white">找回相关记忆</span>
              <span className="desc">「检索」输入问题 → 最相关的几条返回 → 点「+ 会话」带进对话</span>
            </div>
          </div>
          <div className="workflow-link-item">
            <span className="bullet">⚡</span>
            <div className="wf-body">
              <span className="title text-white">分析代码库</span>
              <span className="desc">「知识图谱」→「提取代码库」→ 填仓库绝对路径 → 建成可查询的图</span>
            </div>
          </div>
          <div className="workflow-link-item">
            <span className="bullet">⚡</span>
            <div className="wf-body">
              <span className="title text-white">省 token</span>
              <span className="desc">检索 / 注入量大时开「压缩」，JSON / 日志可省 60~95%（可逆取回原文）</span>
            </div>
          </div>
          <div className="workflow-link-item">
            <span className="bullet">⚡</span>
            <div className="wf-body">
              <span className="title text-white">跨对话延续</span>
              <span className="desc">「会话」建会话 → 关联记忆 → 下次恢复上下文继续</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'mcp',
      title: '6. MCP 接入指南 (MCP Setup)',
      content: (
        <div className="font-mono" style={{ fontSize: '11px', lineHeight: '1.6' }}>
          <p style={{ marginBottom: '8px' }}>Agent Memory REST 后端服务器在本地持续运行：</p>
          <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
            <li>后端接口基准地址：<code className="text-cyan">http://127.0.0.1:8900</code></li>
            <li>交互式 Swagger 接口文档：<a href="http://127.0.0.1:8900/docs" target="_blank" rel="noreferrer" className="text-cyan" style={{ textDecoration: 'underline' }}>http://127.0.0.1:8900/docs</a></li>
            <li>MCP (Model Context Protocol) 协议接口：脚本文件位于 <code className="text-white">Agent-Memory-Server/server.py</code>。</li>
          </ul>

          <div style={{ borderTop: '1px dashed rgba(255, 187, 0, 0.12)', paddingTop: '10px', marginTop: '10px' }}>
            <strong style={{ color: 'hsl(var(--color-cyan))', display: 'block', marginBottom: '8px' }}>🛠️ 手动注册与多客户端适配</strong>
            <p style={{ color: 'hsl(var(--text-muted))', marginBottom: '10px' }}>
              各 CLI 工具通过 MCP 协议连接 Docker 模式以避免并发数据竞态，请根据您的客户端类型进行注册：
            </p>

            <div className="sub-mode-toggle-bar" style={{ marginBottom: '10px', borderBottom: 'none' }}>
              {['claude', 'codex', 'gemini', 'antigravity'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`sub-mode-tab-btn ${mcpClientTab === tab ? 'active' : ''}`}
                  onClick={() => setMcpClientTab(tab)}
                  style={{ padding: '4px 10px', fontSize: '10px' }}
                >
                  {tab === 'claude' && 'Claude Code'}
                  {tab === 'codex' && 'Codex'}
                  {tab === 'gemini' && 'Gemini CLI'}
                  {tab === 'antigravity' && 'Antigravity'}
                </button>
              ))}
            </div>

            <div style={{ background: 'rgba(8,7,5,0.4)', border: '1px solid rgba(255,187,0,0.08)', borderRadius: '6px', padding: '10px', fontSize: '10px', lineHeight: '1.6' }}>
              {mcpClientTab === 'claude' && (
                <>
                  <div style={{ marginBottom: '6px' }}><strong>MCP 注册命令:</strong></div>
                  <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '6px', borderRadius: '4px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    claude mcp add agent-memory --env PYTHONIOENCODING=utf-8 -- docker run -i --rm -v &lt;DATA&gt;:/app/data agent-memory-server python server.py
                  </pre>
                </>
              )}
              {mcpClientTab === 'codex' && (
                <>
                  <div style={{ marginBottom: '6px' }}><strong>MCP 注册命令:</strong></div>
                  <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '6px', borderRadius: '4px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    codex mcp add agent-memory -- docker run -i --rm -v &lt;DATA&gt;:/app/data agent-memory-server python server.py
                  </pre>
                </>
              )}
              {mcpClientTab === 'gemini' && (
                <>
                  <div style={{ marginBottom: '6px' }}><strong>MCP 注册命令:</strong></div>
                  <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '6px', borderRadius: '4px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    gemini mcp add agent-memory docker run -i --rm -v &lt;DATA&gt;:/app/data agent-memory-server python server.py
                  </pre>
                </>
              )}
              {mcpClientTab === 'antigravity' && (
                <>
                  <div style={{ marginBottom: '6px' }}><strong>MCP 注册命令:</strong> (与 Gemini CLI 格式相同)</div>
                  <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '6px', borderRadius: '4px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    gemini mcp add agent-memory docker run -i --rm -v &lt;DATA&gt;:/app/data agent-memory-server python server.py
                  </pre>
                </>
              )}
            </div>
          </div>

          <div style={{ borderTop: '1px dashed rgba(255, 187, 0, 0.12)', paddingTop: '10px', marginTop: '12px' }}>
            <strong style={{ color: 'hsl(var(--color-cyan))', display: 'block', marginBottom: '8px' }}>🌐 局域网 / 远程接入（MCP-over-HTTP）</strong>
            <p style={{ color: 'hsl(var(--text-muted))', marginBottom: '8px' }}>
              上面的 <code className="text-white">docker run</code>（stdio）只能本机用。要让<strong className="text-white">局域网其他机器</strong>也接入，先起一个长驻 HTTP 服务（端口 <code className="text-cyan">8901</code>）：
            </p>
            <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '6px', borderRadius: '4px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: '8px' }}>
              docker compose up -d mcp
            </pre>
            <p style={{ color: 'hsl(var(--text-muted))', marginBottom: '8px' }}>远端机器一行接入（IP 换成服务器实际地址，跟随上方 Tab 自动切换）：</p>
            <div style={{ background: 'rgba(8,7,5,0.4)', border: '1px solid rgba(255,187,0,0.08)', borderRadius: '6px', padding: '10px', fontSize: '10px', lineHeight: '1.6', marginBottom: '8px' }}>
              {mcpClientTab === 'claude' && (
                <>
                  <div style={{ marginBottom: '6px' }}><strong>Claude Code 接入命令:</strong></div>
                  <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '6px', borderRadius: '4px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    claude mcp add --transport http agent-memory http://192.168.110.109:8901/mcp
                  </pre>
                </>
              )}
              {mcpClientTab === 'codex' && (
                <>
                  <div style={{ marginBottom: '6px' }}><strong>Codex 接入命令:</strong></div>
                  <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '6px', borderRadius: '4px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    codex mcp add --transport http agent-memory http://192.168.110.109:8901/mcp
                  </pre>
                </>
              )}
              {mcpClientTab === 'gemini' && (
                <>
                  <div style={{ marginBottom: '6px' }}><strong>Gemini CLI 接入命令:</strong></div>
                  <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '6px', borderRadius: '4px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    gemini mcp add agent-memory http://192.168.110.109:8901/mcp
                  </pre>
                </>
              )}
              {mcpClientTab === 'antigravity' && (
                <>
                  <div style={{ marginBottom: '6px' }}><strong>Antigravity 接入命令:</strong> (与 Gemini CLI 格式相同)</div>
                  <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '6px', borderRadius: '4px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', fontSize: '9px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    gemini mcp add agent-memory http://192.168.110.109:8901/mcp
                  </pre>
                </>
              )}
            </div>
            <div className="sci-note-text" style={{ marginTop: '4px' }}>
              ⚠️ 默认无鉴权，仅在可信内网用；本机 stdio MCP 与该 HTTP 服务共存、不冲突（读写同一库，已实测并发正常）。
            </div>
          </div>
        </div>
      )
    }
  ];

  const activePage = PAGES_DATA.find(p => p.id === activePageId) || PAGES_DATA[0];

  return (
    <div className="tab-view-content fade-in-view tutorial-tab-layout" style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', height: '100%', paddingBottom: '20px' }}>
      <GlassCard title="AGENT MEMORY 使用手册 // SYSTEM MANUAL" glowColor="cyan" className="op-panel-card" style={{ flexShrink: 0 }}>
        <div className="manual-header-sci">
          <div className="decor-bar"></div>
          <div className="title-text font-mono">[ MANUAL_RELOAD // AGENT_MEM_SYS_V2.6 ]</div>
          <div className="sub-desc">
            按书签查阅系统功能，或在 TutorialBook.js 内部的 PAGES_DATA 配置新的页面内容。
          </div>
        </div>
      </GlassCard>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '20px', flexGrow: 1, minHeight: 0 }}>
        {/* 左侧：目录导航 (Sidebar) */}
        <GlassCard title="目录 (TABLE OF CONTENTS)" glowColor="purple" className="op-panel-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="tutorial-toc-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 5px', overflowY: 'auto' }}>
            {PAGES_DATA.map((page) => (
              <button
                key={page.id}
                onClick={() => setActivePageId(page.id)}
                className={`toc-item-btn ${activePageId === page.id ? 'active' : ''}`}
                style={{
                  textAlign: 'left',
                  background: activePageId === page.id ? 'rgba(0, 242, 254, 0.15)' : 'transparent',
                  border: `1px solid ${activePageId === page.id ? 'rgba(0, 242, 254, 0.4)' : 'transparent'}`,
                  color: activePageId === page.id ? '#00f2fe' : 'hsl(var(--text-muted))',
                  padding: '10px 15px',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  borderLeft: activePageId === page.id ? '3px solid #00f2fe' : '3px solid transparent'
                }}
                onMouseEnter={(e) => {
                  if (activePageId !== page.id) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = '#fff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activePageId !== page.id) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'hsl(var(--text-muted))';
                  }
                }}
              >
                {page.title}
              </button>
            ))}
          </div>
        </GlassCard>

        {/* 右侧：页面内容 (Main Content Area) */}
        <GlassCard title={activePage.title.toUpperCase()} glowColor="cyan" className="op-panel-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="manual-scroll-area scrollbar-thin" style={{ flexGrow: 1, overflowY: 'auto', padding: '15px 20px', paddingRight: '10px', height: '100%', maxHeight: '530px' }}>
            {activePage.content}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
