'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import GlassCard from '@/components/GlassCard';
import DigitalAvatar from '@/components/DigitalAvatar';
import KnowledgeGraph from '@/components/KnowledgeGraph';

export default function SPAHomepage() {
  const { 
    activeNamespace, 
    setActiveNamespace, 
    namespaces, 
    stats, 
    isOnline, 
    lastEvent, 
    setLastEvent, 
    activeTab, 
    setActiveTab, 
    refreshData,
    avatarMuted,
    isGraphAvatarExpanded
  } = useApp();

  // ────────────────────────────────────────────────────────
  // 1. Search Tab State & Logic
  // ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // Search Sub-mode: 'search' (hybrid search) or 'pack' (context packer)
  const [searchSubMode, setSearchSubMode] = useState('search');

  // Inline editing states for search results
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Context Packer states
  const [packQuery, setPackQuery] = useState('');
  const [maxTokens, setMaxTokens] = useState(2000);
  const [packedContext, setPackedContext] = useState('');
  const [packLoading, setPackLoading] = useState(false);
  const [packError, setPackError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Precise Source Search states
  const [sourceQuery, setSourceQuery] = useState('');
  const [maxResults, setMaxResults] = useState(8);
  const [contextLines, setContextLines] = useState(4);
  const [sourceSearchResults, setSourceSearchResults] = useState([]);
  const [sourceSearchLoading, setSourceSearchLoading] = useState(false);
  const [sourceSearchSearched, setSourceSearchSearched] = useState(false);
  const [sourceSearchError, setSourceSearchError] = useState(null);

  // Trigger search if namespace changes during search tab active
  useEffect(() => {
    if (activeTab === 'search' && searchQuery.trim() !== '') {
      performSearch();
    }
  }, [activeNamespace, activeTab]);

  const performSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError(null);
    setSearchSearched(true);

    try {
      const res = await api.search(activeNamespace, searchQuery, topK);
      setSearchResults(res.results || []);
      
      setLastEvent({
        type: 'search',
        message: `检索就绪！在 [ ${activeNamespace === 'all' ? '全部' : activeNamespace} ] 中召回了 ${res.results?.length || 0} 个与“${searchQuery}”匹配的记忆块。`
      });
    } catch (err) {
      console.error(err);
      setSearchError('检索失败，请检查 API 服务器连接状态');
    } finally {
      setSearchLoading(false);
    }
  };

  const handlePackSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!packQuery.trim()) return;

    setPackLoading(true);
    setPackError(null);
    setPackedContext('');
    setCopySuccess(false);

    try {
      const res = await api.pack(activeNamespace, packQuery, maxTokens);
      setPackedContext(res.packed_context || '');
      
      setLastEvent({
        type: 'search',
        message: `上下文组装就绪！已在命名空间 [ ${activeNamespace === 'all' ? '全部' : activeNamespace} ] 下为“${packQuery}”匹配最优知识，并在预算 ${maxTokens} token 内组装。`
      });
    } catch (err) {
      console.error(err);
      setPackError('组装失败，请检查 API 服务器连接状态');
    } finally {
      setPackLoading(false);
    }
  };

  const handleSourceSearchSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!sourceQuery.trim()) return;

    setSourceSearchLoading(true);
    setSourceSearchError(null);
    setSourceSearchSearched(true);
    setSourceSearchResults([]);

    try {
      const res = await api.preciseSourceSearch(activeNamespace, sourceQuery, maxResults, contextLines);
      setSourceSearchResults(res.results || []);
      
      setLastEvent({
        type: 'search',
        message: `源码检索就绪！在 [ ${activeNamespace === 'all' ? '全部' : activeNamespace} ] 关联源码中找到了 ${res.results?.length || 0} 处与“${sourceQuery}”匹配的精准代码片段。`
      });
    } catch (err) {
      console.error(err);
      setSourceSearchError('源码检索失败，请检查 API 服务器连接状态');
    } finally {
      setSourceSearchLoading(false);
    }
  };

  const handleDeleteMemory = async (id, ns) => {
    if (!confirm('确定要彻底从底层抹除这条记忆区块吗？此操作不可逆！')) return;

    try {
      await api.deleteById(ns, id);
      setSearchResults((prev) => prev.filter((item) => item.id !== id));
      
      await refreshData({
        type: 'delete',
        namespace: ns,
        message: `记忆节点擦除完毕。受影响的分块 ID: ${id.substring(0, 8)}...`
      });
    } catch (err) {
      console.error(err);
      alert('擦除失败，请重试');
    }
  };

  const handleSaveEdit = async (id, ns) => {
    if (!editContent.trim()) return;
    setEditLoading(true);
    try {
      await api.update(id, ns, editContent, editSource);
      setSearchResults((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, content: editContent, source: editSource } : item
        )
      );
      setEditingId(null);
      await refreshData({
        type: 'insert',
        namespace: ns,
        message: `修改成功！记忆节点 [ ID: ${id.substring(0, 8)}... ] 已完成底层索引与向量重建。`
      });
    } catch (err) {
      console.error(err);
      alert('修改失败，请重试');
    } finally {
      setEditLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // 2. Ingest Tab State & Logic
  // ────────────────────────────────────────────────────────
  const [insertNs, setInsertNs] = useState('');
  const [isCustomInsertNs, setIsCustomInsertNs] = useState(false);
  const [customInsertNsText, setCustomInsertNsText] = useState('');
  const [insertContent, setInsertContent] = useState('');
  const [insertSource, setInsertSource] = useState('user_ui');
  const [insertLoading, setInsertLoading] = useState(false);
  const [insertSuccess, setInsertSuccess] = useState(false);
  const [insertMerged, setInsertMerged] = useState(false);
  const [dedupThreshold, setDedupThreshold] = useState(0.0);

  const [snapshotNs, setSnapshotNs] = useState('');
  const [isCustomSnapshotNs, setIsCustomSnapshotNs] = useState(false);
  const [customSnapshotNsText, setCustomSnapshotNsText] = useState('');
  const [snapshotSummary, setSnapshotSummary] = useState('');
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotSuccess, setSnapshotSuccess] = useState(false);

  // Set default dropdown namespaces when they load
  useEffect(() => {
    if (namespaces.length > 0) {
      if (!insertNs) setInsertNs(namespaces[0]);
      if (!snapshotNs) setSnapshotNs(namespaces[0]);
    } else {
      setIsCustomInsertNs(true);
      setIsCustomSnapshotNs(true);
    }
  }, [namespaces]);

  const handleInsertSubmit = async (e) => {
    e.preventDefault();
    const finalNs = isCustomInsertNs ? customInsertNsText.trim() : insertNs;
    if (!finalNs) {
      alert('请指定命名空间');
      return;
    }
    if (!insertContent.trim()) return;

    setInsertLoading(true);
    setInsertSuccess(false);
    setInsertMerged(false);

    try {
      const res = await api.insert(finalNs, insertContent, insertSource, dedupThreshold);
      const isMerged = res?.message === 'merged';
      setInsertMerged(isMerged);
      setInsertSuccess(true);
      setInsertContent('');
      if (isCustomInsertNs) {
        setCustomInsertNsText('');
        setIsCustomInsertNs(false);
      }
      
      await refreshData({
        type: 'insert',
        namespace: finalNs,
        source: insertSource,
        message: isMerged 
          ? `录入完成（已去重合并）！新知识与 [ ${finalNs} ] 中现有记忆高度相似，已进行语义合并。`
          : `成功录入！已向命名空间 [ ${finalNs} ] 注入新知识并建立索引。`
      });

      setTimeout(() => {
        setInsertSuccess(false);
        setInsertMerged(false);
      }, 5000);
    } catch (err) {
      console.error(err);
      alert('注入失败，请检查网络');
    } finally {
      setInsertLoading(false);
    }
  };

  const handleSnapshotSubmit = async (e) => {
    e.preventDefault();
    const finalNs = isCustomSnapshotNs ? customSnapshotNsText.trim() : snapshotNs;
    if (!finalNs) {
      alert('请指定命名空间');
      return;
    }
    if (!snapshotSummary.trim()) return;

    setSnapshotLoading(true);
    setSnapshotSuccess(false);

    try {
      await api.createSnapshot(finalNs, snapshotSummary);
      setSnapshotSuccess(true);
      setSnapshotSummary('');
      if (isCustomSnapshotNs) {
        setCustomSnapshotNsText('');
        setIsCustomSnapshotNs(false);
      }

      await refreshData({
        type: 'snapshot',
        namespace: finalNs,
        message: `快照冻结成功！已成功捕获命名空间 [ ${finalNs} ] 的认知快照。`
      });

      setTimeout(() => setSnapshotSuccess(false), 5000);
    } catch (err) {
      console.error(err);
      alert('快照创建失败');
    } finally {
      setSnapshotLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // 3. Layered Memory Architecture (P1) State & Logic
  // ────────────────────────────────────────────────────────
  const [shortTermHistory, setShortTermHistory] = useState([]);
  const [shortTermLoading, setShortTermLoading] = useState(false);
  const [newDialogRole, setNewDialogRole] = useState('user');
  const [newDialogContent, setNewDialogContent] = useState('');
  const [addDialogLoading, setAddDialogLoading] = useState(false);

  const [workingState, setWorkingState] = useState({});
  const [workingLoading, setWorkingLoading] = useState(false);
  const [newWorkingKey, setNewWorkingKey] = useState('');
  const [newWorkingValue, setNewWorkingValue] = useState('');
  const [writeWorkingLoading, setWriteWorkingLoading] = useState(false);
  const [editingWorkingKey, setEditingWorkingKey] = useState(null);
  const [editingWorkingValue, setEditingWorkingValue] = useState('');

  const [consolidationLoading, setConsolidationLoading] = useState(false);
  const [consolidationMessage, setConsolidationMessage] = useState(null);
  const [consolidationId, setConsolidationId] = useState(null);

  // ────────────────────────────────────────────────────────
  // 4. Session Management (P2) State & Logic
  // ────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionMemories, setSessionMemories] = useState([]);
  const [newSessionId, setNewSessionId] = useState('');
  const [createSessionLoading, setCreateSessionLoading] = useState(false);
  const [sessionContext, setSessionContext] = useState('');
  const [sessionContextLoading, setSessionContextLoading] = useState(false);
  const [linkMemoryId, setLinkMemoryId] = useState('');
  const [sessionStatusFilter, setSessionStatusFilter] = useState(null);

  const fetchSessions = async () => {
    if (!activeNamespace || activeNamespace === 'all') return;
    setSessionsLoading(true);
    try {
      const res = await api.listSessions(activeNamespace, sessionStatusFilter);
      setSessions(res.sessions || []);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setSessionsLoading(false);
    }
  };

  const fetchSessionMemories = async (sessionId) => {
    try {
      const res = await api.getSessionMemories(sessionId);
      setSessionMemories(res.memories || []);
    } catch (err) {
      console.error('Failed to fetch session memories:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'sessions') {
      fetchSessions();
    }
  }, [activeTab, activeNamespace, sessionStatusFilter]);

  useEffect(() => {
    if (selectedSession) {
      fetchSessionMemories(selectedSession.id);
    } else {
      setSessionMemories([]);
    }
  }, [selectedSession]);

  const handleCreateSession = async (e) => {
    if (e) e.preventDefault();
    if (activeNamespace === 'all') return;
    setCreateSessionLoading(true);
    try {
      const res = await api.createSession(activeNamespace, newSessionId.trim() || null);
      setNewSessionId('');
      await fetchSessions();
      setSelectedSession(res);
      setLastEvent({ type: 'insert', message: `会话已创建 [${res.id.substring(0, 8)}...]` });
    } catch (err) {
      console.error(err);
      alert('创建会话失败');
    } finally {
      setCreateSessionLoading(false);
    }
  };

  const handleUpdateSessionStatus = async (sessionId, status) => {
    try {
      await api.updateSessionStatus(sessionId, status);
      await fetchSessions();
      if (selectedSession?.id === sessionId) {
        setSelectedSession({ ...selectedSession, status });
      }
      setLastEvent({ type: 'insert', message: `会话状态已更新为 ${status}` });
    } catch (err) {
      console.error(err);
      alert('更新会话状态失败');
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!confirm('确定要删除此会话及其关联吗？')) return;
    try {
      await api.deleteSession(sessionId);
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null);
        setSessionMemories([]);
      }
      await fetchSessions();
      setLastEvent({ type: 'delete', message: '会话已删除' });
    } catch (err) {
      console.error(err);
      alert('删除会话失败');
    }
  };

  const handleGetSessionContext = async (sessionId) => {
    setSessionContextLoading(true);
    setSessionContext('');
    try {
      const res = await api.getSessionContext(sessionId);
      setSessionContext(res.packed_context || '');
    } catch (err) {
      console.error(err);
      alert('获取会话上下文失败');
    } finally {
      setSessionContextLoading(false);
    }
  };

  const handleLinkMemory = async (e) => {
    if (e) e.preventDefault();
    if (!selectedSession || !linkMemoryId.trim()) return;
    try {
      await api.linkMemoryToSession(selectedSession.id, linkMemoryId.trim());
      setLinkMemoryId('');
      await fetchSessionMemories(selectedSession.id);
      setLastEvent({ type: 'insert', message: '记忆已关联到会话' });
    } catch (err) {
      console.error(err);
      alert('关联记忆失败');
    }
  };

  const handleUnlinkMemory = async (memoryId) => {
    if (!selectedSession) return;
    try {
      await api.unlinkMemoryFromSession(selectedSession.id, memoryId);
      await fetchSessionMemories(selectedSession.id);
      setLastEvent({ type: 'delete', message: '已解除记忆与会话的关联' });
    } catch (err) {
      console.error(err);
      alert('解除关联失败');
    }
  };

  // ────────────────────────────────────────────────────────
  // 5. Active Forgetting / Decay (P2) State & Logic
  // ────────────────────────────────────────────────────────
  const [forgetCapacity, setForgetCapacity] = useState(10000);
  const [forgetLoading, setForgettingLoading] = useState(false);
  const [forgetResult, setForgetResult] = useState(null);
  const [protectedNamespaces, setProtectedNamespaces] = useState([]);
  const [protectLoading, setProtectLoading] = useState(false);
  const [protectTargetNs, setProtectTargetNs] = useState('');

  const fetchProtected = async () => {
    try {
      const res = await api.getProtectedNamespaces();
      setProtectedNamespaces(res.protected_namespaces || []);
    } catch (err) {
      console.error('Failed to fetch protected namespaces:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'decay') {
      fetchProtected();
    }
  }, [activeTab]);

  const handleActiveForgetting = async (e) => {
    if (e) e.preventDefault();
    if (activeNamespace === 'all') return;
    setForgettingLoading(true);
    setForgetResult(null);
    try {
      const res = await api.activeForgetting(activeNamespace, forgetCapacity);
      setForgetResult(res);
      await refreshData({
        type: 'delete',
        namespace: activeNamespace,
        message: `主动遗忘执行完毕，共淘汰 ${res.deleted_count} 条低价值记忆。`
      });
    } catch (err) {
      console.error(err);
      alert('主动遗忘执行失败');
    } finally {
      setForgettingLoading(false);
    }
  };

  const handleProtectNamespace = async (e) => {
    if (e) e.preventDefault();
    if (!protectTargetNs.trim()) return;
    setProtectLoading(true);
    try {
      await api.protectNamespace(protectTargetNs.trim());
      setProtectTargetNs('');
      await fetchProtected();
      setLastEvent({ type: 'insert', message: `命名空间 [${protectTargetNs}] 已设为受保护 (只读)` });
    } catch (err) {
      console.error(err);
      alert('保护操作失败');
    } finally {
      setProtectLoading(false);
    }
  };

  const handleUnprotectNamespace = async (ns) => {
    try {
      await api.unprotectNamespace(ns);
      await fetchProtected();
      setLastEvent({ type: 'delete', message: `命名空间 [${ns}] 已解除保护` });
    } catch (err) {
      console.error(err);
      alert('解除保护失败');
    }
  };

  const fetchMemoryLayersData = async () => {
    if (!activeNamespace || activeNamespace === 'all') return;
    setShortTermLoading(true);
    setWorkingLoading(true);
    try {
      const stRes = await api.getShortTermMemory(activeNamespace);
      setShortTermHistory(stRes.history || []);
    } catch (err) {
      console.error('Failed to fetch short term memory:', err);
    } finally {
      setShortTermLoading(false);
    }

    try {
      const wmRes = await api.listWorkingMemory(activeNamespace);
      setWorkingState(wmRes.state || {});
    } catch (err) {
      console.error('Failed to fetch working memory:', err);
    } finally {
      setWorkingLoading(false);
    }
  };

  // Fetch Short-term and Working memory when tab changes to 'memory' or namespace changes
  useEffect(() => {
    if (activeTab === 'memory') {
      if (activeNamespace === 'all' && namespaces.length > 0) {
        const firstRealNs = namespaces.find(n => n !== 'all');
        if (firstRealNs) {
          setActiveNamespace(firstRealNs);
        }
      } else {
        fetchMemoryLayersData();
      }
    }
  }, [activeNamespace, activeTab, namespaces]);

  const handleAddDialog = async (e) => {
    if (e) e.preventDefault();
    if (!newDialogContent.trim() || activeNamespace === 'all') return;
    setAddDialogLoading(true);
    try {
      await api.addShortTermMemory(activeNamespace, newDialogRole, newDialogContent);
      setNewDialogContent('');
      await fetchMemoryLayersData();
      setLastEvent({
        type: 'insert',
        message: `短期对话记忆已注入！当前角色：${newDialogRole === 'user' ? '用户' : 'Agent'}`
      });
    } catch (err) {
      console.error(err);
      alert('注入短期对话记忆失败');
    } finally {
      setAddDialogLoading(false);
    }
  };

  const handleDeleteShortTerm = async (index) => {
    if (activeNamespace === 'all') return;
    try {
      await api.deleteShortTermMemory(activeNamespace, index);
      await fetchMemoryLayersData();
      setLastEvent({
        type: 'delete',
        message: `已删除第 ${index + 1} 条短期对话记忆。`
      });
    } catch (err) {
      console.error(err);
      alert('删除短期对话记忆失败');
    }
  };

  const handleClearShortTerm = async () => {
    console.log('[ClearShortTerm] Invoked. activeNamespace:', activeNamespace);
    if (activeNamespace === 'all') return;
    const confirmed = confirm('确定要清空当前命名空间下的所有短期对话记忆吗？');
    console.log('[ClearShortTerm] User confirmed:', confirmed);
    if (!confirmed) return;
    try {
      console.log('[ClearShortTerm] Calling api.deleteShortTermMemory...');
      const res = await api.deleteShortTermMemory(activeNamespace);
      console.log('[ClearShortTerm] API response:', res);
      await fetchMemoryLayersData();
      setLastEvent({
        type: 'delete',
        message: `短期对话记忆已全部清空。`
      });
    } catch (err) {
      console.error('[ClearShortTerm] Error clearing short term memory:', err);
      alert('清空短期对话记忆失败: ' + err.message);
    }
  };

  const handleWriteWorking = async (e) => {
    if (e) e.preventDefault();
    if (!newWorkingKey.trim() || activeNamespace === 'all') return;
    setWriteWorkingLoading(true);
    try {
      await api.writeWorkingMemory(activeNamespace, newWorkingKey.trim(), newWorkingValue);
      setNewWorkingKey('');
      setNewWorkingValue('');
      await fetchMemoryLayersData();
      setLastEvent({
        type: 'insert',
        message: `工作记忆 [ ${newWorkingKey} ] 已写入/更新。`
      });
    } catch (err) {
      console.error(err);
      alert('写入工作记忆失败');
    } finally {
      setWriteWorkingLoading(false);
    }
  };

  const handleDeleteWorking = async (key) => {
    if (activeNamespace === 'all') return;
    try {
      await api.deleteWorkingMemory(activeNamespace, key);
      await fetchMemoryLayersData();
      setLastEvent({
        type: 'delete',
        message: `工作记忆 [ ${key} ] 已删除。`
      });
    } catch (err) {
      console.error(err);
      alert('删除工作记忆失败');
    }
  };

  const handleClearWorking = async () => {
    if (activeNamespace === 'all') return;
    if (!confirm('确定要清空当前命名空间下的所有工作记忆状态吗？')) return;
    try {
      await api.clearWorkingMemory(activeNamespace);
      await fetchMemoryLayersData();
      setLastEvent({
        type: 'delete',
        message: `工作记忆已清空。`
      });
    } catch (err) {
      console.error(err);
      alert('清空工作记忆失败');
    }
  };

  const handleSaveWorkingEdit = async (key) => {
    if (activeNamespace === 'all') return;
    try {
      await api.writeWorkingMemory(activeNamespace, key, editingWorkingValue);
      setEditingWorkingKey(null);
      await fetchMemoryLayersData();
      setLastEvent({
        type: 'insert',
        message: `工作记忆 [ ${key} ] 状态更新完成。`
      });
    } catch (err) {
      console.error(err);
      alert('更新工作记忆失败');
    }
  };

  const handleConsolidate = async () => {
    if (activeNamespace === 'all') return;
    setConsolidationLoading(true);
    setConsolidationMessage(null);
    setConsolidationId(null);
    try {
      const res = await api.consolidateMemory(activeNamespace);
      setConsolidationId(res.id);
      setConsolidationMessage(res.message);
      
      await refreshData({
        type: 'snapshot',
        namespace: activeNamespace,
        message: res.id 
          ? `记忆整合完毕！短期记忆已被压缩提炼为长期记忆，并录入向量数据库 [ID: ${res.id.substring(0, 8)}...]。`
          : `短期记忆内没有足够的对话需要进行整合。`
      });
      await fetchMemoryLayersData();
    } catch (err) {
      console.error(err);
      setConsolidationMessage('整合失败，请确保后台已配置 LLM API 密钥并且当前有足够的短期记忆。');
    } finally {
      setConsolidationLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // Helper Formatters
  // ────────────────────────────────────────────────────────
  const namespacesList = Object.entries(stats.namespaces || {}).map(([name, count]) => {
    const percentage = stats.total_chunks > 0 ? ((count / stats.total_chunks) * 100).toFixed(1) : 0;
    return { name, count, percentage };
  });

  const formatTime = (timestamp) => {
    if (!timestamp) return '未知时间';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getScoreColor = (score) => {
    if (score >= 1.2) return 'hsl(var(--color-green))';
    if (score >= 0.8) return 'hsl(var(--color-cyan))';
    if (score >= 0.4) return 'hsl(var(--color-purple))';
    return 'hsl(var(--text-muted))';
  };

  return (
    <div className={`cockpit-container ${activeTab === 'graph' ? 'graph-mode' : ''}`}>
      <div className={`cockpit-layout-grid active-tab-${activeTab}`}>
        
        {/* ============================================================ */}
        {/* LEFT COLUMN: System Diagnostics & Stats                       */}
        {/* ============================================================ */}
        <div className="system-left-panel">
          <GlassCard title="链路状态" glowColor="cyan" className="panel-card-sci">
            <div className="sci-card-value">
              <span className={`sci-dot ${isOnline ? 'online' : 'offline'}`} />
              <span className="sci-large-text font-mono text-cyan">
                {isOnline ? 'STABLE' : 'LINK_LOST'}
              </span>
            </div>
            <div className="sci-footer-details font-mono">
              <div>HOST: 127.0.0.1:8900</div>
            </div>
          </GlassCard>

          <GlassCard title="系统节点总览" glowColor="cyan" className="panel-card-sci">
            <div className="sci-card-value font-mono">
              <span className="sci-large-text text-white">{stats.total_chunks}</span>
              <span className="sci-unit">CHUNKS</span>
            </div>
            <div className="sci-footer-details font-mono">
              <div>ENCRYPTION: LOCAL</div>
            </div>
          </GlassCard>

          <GlassCard title="全息链路遥测" glowColor="purple" className="panel-card-sci">
            <div className="telemetry-grid font-mono">
              <div className="telemetry-item">
                <span className="lbl">SYS_VOL:</span>
                <span className="val text-cyan">ONLINE</span>
              </div>
              <div className="telemetry-item">
                <span className="lbl">DB_LOC:</span>
                <span className="val text-white">CHROMA</span>
              </div>
              <div className="telemetry-item">
                <span className="lbl">SYS_LOG:</span>
                <span className="val text-white">READY</span>
              </div>
              <div className="telemetry-item">
                <span className="lbl">SECTORS:</span>
                <span className="val text-purple">{namespaces.length}</span>
              </div>
              <div className="telemetry-item">
                <span className="lbl">MUTED:</span>
                <span className="val text-muted">{avatarMuted ? 'ACTIVE' : 'INACTIVE'}</span>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* ============================================================ */}
        {/* CENTER COLUMN: Large Interactive Holographic Head            */}
        {/* ============================================================ */}
        <div className={`avatar-center-panel ${activeTab === 'graph' ? (isGraphAvatarExpanded ? 'graph-avatar-expanded' : 'graph-avatar-collapsed') : ''}`}>
          <div className="radar-background"></div>
          <div className="avatar-container-inner">
            <DigitalAvatar />
          </div>
        </div>

        {/* ============================================================ */}
        {/* RIGHT COLUMN (40%): Dynamic Operations Panel                 */}
        {/* ============================================================ */}
        <div className="operations-right-panel">
          
          {/* TAB 1: DASHBOARD (STATISTICS) */}
          {activeTab === 'dashboard' && (
            <div className="tab-view-content fade-in-view">
              <GlassCard title="内存容量分布占比 (Storage Distribution)" glowColor="purple" className="op-panel-card">
                {namespacesList.length === 0 ? (
                  <div className="empty-sci-chart font-mono">[ WAITING_FOR_SYNC_DATA ]</div>
                ) : (
                  <div className="hud-chart-wrapper">
                    <div className="hud-radial-viz">
                      <svg width="140" height="140" viewBox="0 0 100 100" className="hud-radial-svg">
                        {/* Background track */}
                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255, 187, 0, 0.03)" strokeWidth="3" />
                        {/* Animated outer dashed ring */}
                        <circle cx="50" cy="50" r="44" fill="transparent" stroke="rgba(0, 242, 254, 0.15)" strokeWidth="1" strokeDasharray="3 6" className="spinning-dashed-ring" />
                        
                        {/* Dynamic segments */}
                        {(() => {
                          let acc = 0;
                          return namespacesList.map((ns, i) => {
                            const p = parseFloat(ns.percentage);
                            const strokeColor = i % 2 === 0 ? 'hsl(var(--color-cyan))' : 'hsl(var(--color-purple))';
                            // Circle length is 2 * Math.PI * 40 = 251.327
                            const strokeLength = (p / 100) * 251.327;
                            const strokeOffset = 251.327 - (acc / 100) * 251.327 + 62.831; // start from top (-90deg offset is 62.831)
                            acc += p;
                            return (
                              <circle
                                key={ns.name}
                                cx="50"
                                cy="50"
                                r="40"
                                fill="transparent"
                                stroke={strokeColor}
                                strokeWidth="4.5"
                                strokeDasharray={p >= 99.9 ? undefined : `${strokeLength} ${251.327 - strokeLength}`}
                                strokeDashoffset={p >= 99.9 ? undefined : strokeOffset}
                                strokeLinecap="round"
                                style={{ 
                                  filter: `drop-shadow(0 0 4px ${strokeColor})`,
                                  transition: 'stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease'
                                }}
                              />
                            );
                          });
                        })()}

                        {/* Center core info */}
                        <circle cx="50" cy="50" r="32" fill="rgba(8, 7, 5, 0.85)" stroke="rgba(255, 187, 0, 0.08)" strokeWidth="1" />
                      </svg>
                      
                      <div className="hud-center-text font-mono">
                        <div className="hud-center-lbl">TOTAL</div>
                        <div className="hud-center-val text-cyan">{stats.total_chunks}</div>
                        <div className="hud-center-unit">SECTORS</div>
                      </div>
                    </div>

                    <div className="hud-data-list">
                      {namespacesList.map((ns, idx) => {
                        const colors = idx % 2 === 0 
                          ? ['hsl(var(--color-cyan))', 'rgba(0, 242, 254, 0.1)'] 
                          : ['hsl(var(--color-purple))', 'rgba(255, 102, 0, 0.1)'];
                        
                        return (
                          <div key={ns.name} className="hud-data-row font-mono">
                            <div className="hud-row-top">
                              <span className="hud-sector-addr" style={{ color: colors[0] }}>[SEC_0x0{idx + 1}]</span>
                              <span className="hud-sector-name text-white" title={ns.name}>{ns.name}</span>
                              <span className="hud-sector-percentage" style={{ color: colors[0] }}>{ns.percentage}%</span>
                            </div>
                            
                            <div className="hud-row-mid">
                              <div className="hud-bar-container">
                                <div 
                                  className="hud-bar-fill"
                                  style={{
                                    width: `${ns.percentage}%`,
                                    background: `linear-gradient(90deg, ${colors[0]}, transparent)`,
                                    boxShadow: `0 0 8px ${colors[0]}`
                                  }}
                                />
                              </div>
                            </div>

                            <div className="hud-row-bottom">
                              <span className="hud-row-metric">ALLOCATED: {ns.count} CHUNKS</span>
                              <span className="hud-row-status" style={{ color: colors[0] }}>● ACTIVE</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </GlassCard>

              <div className="section-header-cockpit font-mono">
                <h3>&gt;&gt; NAMESPACE_PARTITIONS // 命名空间分区</h3>
              </div>

              <div className="namespaces-vertical-list">
                {namespacesList.length === 0 ? (
                  <GlassCard className="empty-ns-card font-mono" glowColor="purple">
                    [ SECURE_SPACE // 暂无可用命名空间。 ]
                  </GlassCard>
                ) : (
                  namespacesList.map((ns, idx) => {
                    const isCurrent = activeNamespace === ns.name;
                    return (
                      <div
                        key={ns.name}
                        className={`cyber-hud-card ${isCurrent ? 'selected' : ''}`}
                      >
                        {/* Corner Brackets */}
                        <div className="hud-corner-bracket tl"></div>
                        <div className="hud-corner-bracket tr"></div>
                        <div className="hud-corner-bracket bl"></div>
                        <div className="hud-corner-bracket br"></div>

                        {/* Telemetry Header */}
                        <div className="hud-card-header">
                          <div className="hud-card-title-row">
                            <span className="hud-tech-addr">0x0{idx + 1} //</span>
                            <span className="hud-tech-title font-mono">{ns.name}</span>
                          </div>
                          <span className="hud-status-badge active-neon">SECURE</span>
                        </div>

                        {/* Card Body */}
                        <div className="hud-card-body">
                          {/* Left: Dot Density visualizer */}
                          <div className="hud-visual-column">
                            <div className="hud-matrix-dots">
                              {Array.from({ length: 9 }).map((_, i) => (
                                <span 
                                  key={i} 
                                  className={`hud-dot ${i < Math.max(1, Math.min(9, Math.ceil(ns.count / 180))) ? 'glow-cyan' : 'dark-dot'}`}
                                />
                              ))}
                            </div>
                            <div className="hud-matrix-percentage font-mono">{parseFloat(ns.percentage).toFixed(1)}%</div>
                          </div>

                          {/* Right: Specs specifications */}
                          <div className="hud-specs-column font-mono">
                            <div className="hud-spec-item">
                              <span className="spec-lbl">CAPACITY DENSITY:</span>
                              <span className="spec-val text-cyan">{ns.count} CHUNKS</span>
                            </div>
                            <div className="hud-spec-item">
                              <span className="spec-lbl">INDEX_ALIGNMENT:</span>
                              <span className="spec-val text-white">OPTIMIZED</span>
                            </div>
                            <div className="hud-spec-item">
                              <span className="spec-lbl">SECTOR_PORT:</span>
                              <span className="spec-val text-muted">8900</span>
                            </div>
                          </div>
                        </div>

                        {/* Footer Scanning readout */}
                        <div className="hud-card-footer">
                          <span className="hud-metric-readout font-mono">NODE_STATUS: ONLINE</span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveNamespace(ns.name);
                              setActiveTab('search');
                            }}
                            className="hud-action-btn font-mono"
                          >
                            MOUNT_SECTOR_LOAD →
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SEARCH (QUERY ENGINE) */}
          {activeTab === 'search' && (
            <div className="tab-view-content fade-in-view">
              
              {/* Sub-mode Toggles */}
              <div className="sub-mode-toggle-bar font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setSearchSubMode('search');
                    setSearchError(null);
                  }}
                  className={`sub-mode-tab-btn ${searchSubMode === 'search' ? 'active' : ''}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" />
                    <circle cx="12" cy="12" r="4" stroke="currentColor" />
                    <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="1" />
                    <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1" />
                  </svg>
                  HYBRID_SEARCH // 混合检索
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchSubMode('pack');
                    setSearchError(null);
                  }}
                  className={`sub-mode-tab-btn ${searchSubMode === 'pack' ? 'active' : ''}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12,2 22,8.5 22,17.5 12,22 2,17.5 2,8.5" stroke="currentColor" />
                    <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" />
                    <line x1="12" y1="12" x2="22" y2="8.5" stroke="currentColor" />
                    <line x1="12" y1="12" x2="2" y2="8.5" stroke="currentColor" />
                  </svg>
                  CONTEXT_PACKER // 上下文打包
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchSubMode('source');
                    setSourceSearchError(null);
                  }}
                  className={`sub-mode-tab-btn ${searchSubMode === 'source' ? 'active' : ''}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" fill="none" />
                    <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" />
                    <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" />
                  </svg>
                  PRECISE_SOURCE_SEARCH // 源码检索
                </button>
              </div>

              {searchSubMode === 'search' && (
                <div className="search-tab-layout">
                  <div className="search-left-form">
                    <GlassCard title="检索控制台 (Query Console)" glowColor="cyan" className="op-panel-card">
                    <form onSubmit={performSearch} className="sci-form">
                      <div className="form-group-sci">
                        <label htmlFor="search-q-input">检索内容 (Query Keywords)</label>
                        <input
                          id="search-q-input"
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="输入查询语句或关键词..."
                          className="sci-control-input"
                          required
                        />
                      </div>

                      <div className="form-group-sci">
                        <label htmlFor="search-ns-select">命名空间筛选 (Namespace)</label>
                        <select
                          id="search-ns-select"
                          value={activeNamespace}
                          onChange={(e) => setActiveNamespace(e.target.value)}
                          className="sci-control-select"
                        >
                          <option value="all">全部命名空间 (All)</option>
                          {namespaces.map((ns) => (
                            <option key={ns} value={ns}>{ns}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group-sci">
                        <div className="slider-label-row">
                          <label htmlFor="topk-slider">返回条数上限 (Top K)</label>
                          <span className="slider-val text-cyan font-mono">{topK}</span>
                        </div>
                        <input
                          id="topk-slider"
                          type="range"
                          min="1"
                          max="15"
                          value={topK}
                          onChange={(e) => setTopK(parseInt(e.target.value))}
                          className="sci-slider"
                        />
                      </div>

                      <button type="submit" className="sci-submit-btn bg-cyan" disabled={searchLoading}>
                        {searchLoading ? '召回中...' : '开始混合检索'}
                      </button>
                    </form>
                  </GlassCard>
                </div>
                <div className="search-right-results">
                  <div className="search-results-wrapper font-mono">
                    {searchLoading ? (
                      <div className="search-status-banner">[ HYBRID_MATCH // 检索矩阵激活中... ]</div>
                    ) : searchError ? (
                      <div className="search-error-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'hsl(var(--color-red))' }}>
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
                        </svg>
                        <span>发生错误: {searchError}</span>
                      </div>
                    ) : !searchSearched ? (
                      <div className="search-empty-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-svg-glow" style={{ animation: 'pulse 2s infinite' }}>
                          <circle cx="11" cy="11" r="6" stroke="hsl(var(--color-cyan))" />
                          <line x1="16" y1="16" x2="22" y2="22" stroke="hsl(var(--color-purple))" strokeWidth="3" />
                          <path d="M8 11h6M11 8v6" stroke="hsl(var(--color-cyan))" strokeWidth="1" />
                        </svg>
                        <span>READY // 待命。请输入关键词以搜索。</span>
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="search-empty-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'hsl(var(--color-purple))' }}>
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <path d="M3.27 6.96L12 12.01l8.73-5.05" />
                          <line x1="12" y1="22.08" x2="12" y2="12" />
                          <circle cx="12" cy="12" r="3" strokeDasharray="3 3" />
                        </svg>
                        <span>EMPTY_RECORD // 无匹配数据分块。</span>
                      </div>
                    ) : (
                      <div className="search-results-list">
                        <div className="results-count-title">召回匹配完成: {searchResults.length} 个区块</div>
                        
                        {searchResults.map((item) => {
                          const isEditing = editingId === item.id;
                          return (
                            <GlassCard 
                              key={item.id} 
                              className="result-item-card" 
                              glowColor={item.source === 'snapshot' ? 'purple' : 'cyan'}
                            >
                              <div className="result-item-top">
                                <span className="badge-ns">{item.namespace}</span>
                                <span className="badge-score" style={{ color: getScoreColor(item.score) }}>
                                  S: {item.score.toFixed(3)}
                                </span>
                              </div>
                              
                              {isEditing ? (
                                <div className="sci-form" style={{ gap: '10px', margin: '8px 0' }}>
                                  <textarea
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    className="sci-control-textarea"
                                    rows="4"
                                    style={{ width: '100%', fontSize: '11.5px' }}
                                    required
                                  />
                                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '10px', color: 'hsl(var(--text-muted))' }}>来源:</span>
                                    <input
                                      type="text"
                                      value={editSource}
                                      onChange={(e) => setEditSource(e.target.value)}
                                      className="sci-control-input"
                                      style={{ padding: '4px 8px', fontSize: '11px', flex: 1 }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="result-item-body">
                                  <pre className="result-code">{item.content}</pre>
                                </div>
                              )}

                              <div className="result-item-footer">
                                {isEditing ? (
                                  <span className="source-lbl" style={{ color: 'hsl(var(--color-cyan))' }}>[ 编辑模式 ]</span>
                                ) : (
                                  <span className="source-lbl">Src: {item.source}</span>
                                )}
                                
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                  {isEditing ? (
                                    <>
                                      <button 
                                        type="button"
                                        className="result-edit-btn"
                                        onClick={() => handleSaveEdit(item.id, item.namespace)}
                                        disabled={editLoading}
                                        style={{ borderColor: 'hsl(var(--color-green))', color: 'hsl(var(--color-green))' }}
                                      >
                                        {editLoading ? '保存中' : '保存'}
                                      </button>
                                      <button 
                                        type="button"
                                        className="result-delete-btn"
                                        onClick={() => setEditingId(null)}
                                        disabled={editLoading}
                                      >
                                        取消
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button 
                                        type="button"
                                        className="result-edit-btn"
                                        onClick={() => {
                                          setEditingId(item.id);
                                          setEditContent(item.content);
                                          setEditSource(item.source);
                                        }}
                                      >
                                        编辑
                                      </button>
                                      <button 
                                        type="button"
                                        className="result-delete-btn"
                                        onClick={() => handleDeleteMemory(item.id, item.namespace)}
                                      >
                                        遗忘
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </GlassCard>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              )}

              {searchSubMode === 'pack' && (
                <div className="search-tab-layout">
                  <div className="search-left-form">
                    <GlassCard title="上下文打包器 (Context Packer)" glowColor="purple" className="op-panel-card">
                    <form onSubmit={handlePackSubmit} className="sci-form">
                      <div className="form-group-sci">
                        <label htmlFor="pack-q-input">组装检索背景 (Query Details)</label>
                        <input
                          id="pack-q-input"
                          type="text"
                          value={packQuery}
                          onChange={(e) => setPackQuery(e.target.value)}
                          placeholder="例如：系统是如何进行混合检索和去重的..."
                          className="sci-control-input"
                          required
                        />
                      </div>

                      <div className="form-group-sci">
                        <label htmlFor="pack-ns-select">命名空间范围 (Namespace)</label>
                        <select
                          id="pack-ns-select"
                          value={activeNamespace}
                          onChange={(e) => setActiveNamespace(e.target.value)}
                          className="sci-control-select"
                        >
                          <option value="all">全部命名空间 (All)</option>
                          {namespaces.map((ns) => (
                            <option key={ns} value={ns}>{ns}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group-sci">
                        <div className="slider-label-row">
                          <label htmlFor="maxtokens-slider">Token 预算上限 (Max Tokens)</label>
                          <span className="slider-val text-cyan font-mono">{maxTokens}</span>
                        </div>
                        <input
                          id="maxtokens-slider"
                          type="range"
                          min="500"
                          max="8000"
                          step="100"
                          value={maxTokens}
                          onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                          className="sci-slider"
                        />
                      </div>

                      <button type="submit" className="sci-submit-btn bg-purple" disabled={packLoading}>
                        {packLoading ? '打包中...' : '生成上下文 Prompt'}
                      </button>
                    </form>
                  </GlassCard>
                </div>
                <div className="search-right-results">
                  <div className="search-results-wrapper font-mono">
                    {packLoading ? (
                      <div className="search-status-banner">[ PACKING_MATRIX // 正在计算召回相关度并填充 Token 预算... ]</div>
                    ) : packError ? (
                      <div className="search-error-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'hsl(var(--color-red))' }}>
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
                        </svg>
                        <span>发生错误: {packError}</span>
                      </div>
                    ) : !packedContext ? (
                      <div className="search-empty-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-svg-glow" style={{ animation: 'spin 12s linear infinite' }}>
                          <polygon points="12,2 22,8.5 22,17.5 12,22 2,17.5 2,8.5" stroke="hsl(var(--color-purple))" />
                          <line x1="12" y1="2" x2="12" y2="22" stroke="hsl(var(--color-cyan))" />
                          <line x1="12" y1="12" x2="22" y2="8.5" stroke="hsl(var(--color-cyan))" />
                          <line x1="12" y1="12" x2="2" y2="8.5" stroke="hsl(var(--color-cyan))" />
                        </svg>
                        <span>READY // 待命。输入检索背景生成拼接的 Prompt。</span>
                      </div>
                    ) : (
                      <GlassCard title="生成结果 (Packed Prompt Snippet)" glowColor="purple" className="result-item-card">
                        <div className="result-item-body" style={{ maxHeight: '400px' }}>
                          <pre className="result-code" style={{ whiteSpace: 'pre-wrap' }}>{packedContext}</pre>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                          <button
                            type="button"
                            className="copy-prompt-btn"
                            onClick={() => {
                              navigator.clipboard.writeText(packedContext);
                              setCopySuccess(true);
                              setTimeout(() => setCopySuccess(false), 3000);
                            }}
                          >
                            {copySuccess ? '已复制到剪贴板！' : '复制 Prompt'}
                          </button>
                        </div>
                      </GlassCard>
                    )}
                  </div>
                </div>
              </div>
              )}

              {searchSubMode === 'source' && (
                <div className="search-tab-layout">
                  <div className="search-left-form">
                    <GlassCard title="源码精准检索 (Source Search Console)" glowColor="purple" className="op-panel-card">
                      <form onSubmit={handleSourceSearchSubmit} className="sci-form">
                        <div className="form-group-sci">
                          <label htmlFor="source-q-input">源码检索内容 (Exact Keyword / Phrase)</label>
                          <input
                            id="source-q-input"
                            type="text"
                            value={sourceQuery}
                            onChange={(e) => setSourceQuery(e.target.value)}
                            placeholder="输入要查找的常量、函数名等精确词汇..."
                            className="sci-control-input"
                            required
                          />
                        </div>

                        <div className="form-group-sci">
                          <label htmlFor="source-ns-select">命名空间范围 (Namespace)</label>
                          <select
                            id="source-ns-select"
                            value={activeNamespace}
                            onChange={(e) => setActiveNamespace(e.target.value)}
                            className="sci-control-select"
                          >
                            <option value="all">全部命名空间 (All)</option>
                            {namespaces.map((ns) => (
                              <option key={ns} value={ns}>{ns}</option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group-sci">
                          <div className="slider-label-row">
                            <label htmlFor="maxresults-slider">返回条数上限 (Max Results)</label>
                            <span className="slider-val text-cyan font-mono">{maxResults}</span>
                          </div>
                          <input
                            id="maxresults-slider"
                            type="range"
                            min="1"
                            max="30"
                            value={maxResults}
                            onChange={(e) => setMaxResults(parseInt(e.target.value))}
                            className="sci-slider"
                          />
                        </div>

                        <div className="form-group-sci">
                          <div className="slider-label-row">
                            <label htmlFor="contextlines-slider">前后上下文行数 (Context Lines)</label>
                            <span className="slider-val text-purple font-mono">{contextLines}</span>
                          </div>
                          <input
                            id="contextlines-slider"
                            type="range"
                            min="0"
                            max="10"
                            value={contextLines}
                            onChange={(e) => setContextLines(parseInt(e.target.value))}
                            className="sci-slider"
                          />
                        </div>

                        <button type="submit" className="sci-submit-btn bg-purple" disabled={sourceSearchLoading}>
                          {sourceSearchLoading ? '检索中...' : '开始精准检索'}
                        </button>
                      </form>
                    </GlassCard>
                  </div>
                  <div className="search-right-results">
                    <div className="search-results-wrapper font-mono">
                      {sourceSearchLoading ? (
                        <div className="search-status-banner">[ SOURCE_SCAN // 检索源文件特征矩阵中... ]</div>
                      ) : sourceSearchError ? (
                        <div className="search-error-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'hsl(var(--color-red))' }}>
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
                          </svg>
                          <span>发生错误: {sourceSearchError}</span>
                        </div>
                      ) : !sourceSearchSearched ? (
                        <div className="search-empty-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-svg-glow" style={{ animation: 'pulse 2s infinite' }}>
                            <rect x="2" y="3" width="20" height="14" rx="2" stroke="hsl(var(--color-cyan))" fill="none" />
                            <line x1="8" y1="21" x2="16" y2="21" stroke="hsl(var(--color-purple))" strokeWidth="3" />
                            <line x1="12" y1="17" x2="12" y2="21" stroke="hsl(var(--color-purple))" strokeWidth="3" />
                          </svg>
                          <span>READY // 待命。请输入要检索的代码、常数或函数名。</span>
                        </div>
                      ) : sourceSearchResults.length === 0 ? (
                        <div className="search-empty-banner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'hsl(var(--color-purple))' }}>
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" fill="none" />
                            <path d="M3.27 6.96L12 12.01l8.73-5.05" />
                            <line x1="12" y1="22.08" x2="12" y2="12" />
                            <circle cx="12" cy="12" r="3" strokeDasharray="3 3" />
                          </svg>
                          <span>EMPTY_RECORD // 未在关联源码中检索到匹配的内容。</span>
                        </div>
                      ) : (
                        <div className="search-results-list">
                          <div className="results-count-title">精准检索完成: 在源文件中匹配到 {sourceSearchResults.length} 处</div>
                          {sourceSearchResults.map((item, idx) => (
                            <GlassCard key={idx} title={`匹配点 #${idx + 1}`} glowColor="purple" className="result-item-card">
                              <div className="result-item-header" style={{ marginBottom: '6px' }}>
                                <span className="source-lbl" style={{ color: 'hsl(var(--color-cyan))', fontSize: '11px', overflowWrap: 'anywhere' }}>
                                  📂 {item.source_file} : Line {item.line}
                                </span>
                              </div>
                              <div className="result-item-body">
                                <pre className="result-code" style={{ whiteSpace: 'pre-wrap', fontSize: '11px' }}>{item.snippet}</pre>
                              </div>
                              <div className="result-item-footer" style={{ marginTop: '8px' }}>
                                <span className="source-lbl" style={{ fontSize: '10px', color: 'hsl(var(--text-muted))' }}>
                                  匹配词: {item.matched_terms.join(', ')}
                                </span>
                                <button
                                  type="button"
                                  className="copy-prompt-btn"
                                  style={{ padding: '2px 8px', fontSize: '10px' }}
                                  onClick={() => {
                                    navigator.clipboard.writeText(item.snippet);
                                    alert('已复制匹配的代码片段！');
                                  }}
                                >
                                  复制片段
                                </button>
                              </div>
                            </GlassCard>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'ingest' && (
            <div className="tab-view-content fade-in-view ingest-tab-layout">
              {/* Form 1: Memory Ingestion */}
              <div className="ingest-column">
                <GlassCard title="手动知识注入 (Insert)" glowColor="cyan" className="op-panel-card">
                  <form onSubmit={handleInsertSubmit} className="sci-form">
                  <div className="form-group-sci">
                    <label>命名空间分区 (Namespace)</label>
                    {!isCustomInsertNs ? (
                      <select
                        value={insertNs}
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setIsCustomInsertNs(true);
                            setInsertNs('');
                          } else {
                            setInsertNs(e.target.value);
                          }
                        }}
                        className="sci-control-select"
                      >
                        {namespaces.map((ns) => (
                          <option key={ns} value={ns}>{ns}</option>
                        ))}
                        <option value="__new__">[+] 新建命名空间</option>
                      </select>
                    ) : (
                      <div className="custom-input-group">
                        <input
                          type="text"
                          value={customInsertNsText}
                          onChange={(e) => setCustomInsertNsText(e.target.value)}
                          placeholder="输入新命名空间..."
                          className="sci-control-input"
                          required
                        />
                        {namespaces.length > 0 && (
                          <button type="button" onClick={() => setIsCustomInsertNs(false)} className="sci-cancel-btn">
                            返回
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="form-group-sci">
                    <label htmlFor="ingest-src">数据来源 (Source)</label>
                    <input
                      id="ingest-src"
                      type="text"
                      value={insertSource}
                      onChange={(e) => setInsertSource(e.target.value)}
                      className="sci-control-input"
                      required
                    />
                  </div>

                  <div className="form-group-sci">
                    <label htmlFor="ingest-content">知识内容 (Content)</label>
                    <textarea
                      id="ingest-content"
                      value={insertContent}
                      onChange={(e) => setInsertContent(e.target.value)}
                      className="sci-control-textarea"
                      rows="4"
                      required
                    />
                  </div>

                  <div className="form-group-sci">
                    <div className="slider-label-row">
                      <label htmlFor="dedup-slider">语义去重阈值 (Deduplication Threshold)</label>
                      <span className="slider-val text-cyan font-mono">{dedupThreshold.toFixed(2)}</span>
                    </div>
                    <input
                      id="dedup-slider"
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.05"
                      value={dedupThreshold}
                      onChange={(e) => setDedupThreshold(parseFloat(e.target.value))}
                      className="sci-slider"
                    />
                    <div className="input-helper-text font-mono" style={{ fontSize: '10px', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                      {dedupThreshold === 0 ? '0.00 (禁用自动语义去重)' : `${dedupThreshold.toFixed(2)} (相似度超过该阈值时自动合并)`}
                    </div>
                  </div>

                  <button type="submit" className="sci-submit-btn bg-cyan" disabled={insertLoading}>
                    {insertLoading ? '正在注入...' : '注入记忆碎片'}
                  </button>

                  {insertSuccess && (
                    <div className={`sci-success-banner ${insertMerged ? 'purple-color' : ''}`}>
                      {insertMerged 
                        ? '[ DEDUPLICATED // 检测到相似记忆，已执行合并去重 ]' 
                        : '[ SECURE_LOAD // 知识碎片载入与索引构建完成 ]'}
                    </div>
                  )}
                </form>
              </GlassCard>
            </div>

            {/* Form 2: State Snapshot */}
            <div className="ingest-column">
              <GlassCard title="全息认知状态快照 (Snapshot)" glowColor="purple" className="op-panel-card">
                <form onSubmit={handleSnapshotSubmit} className="sci-form">
                  <div className="form-group-sci">
                    <label>命名空间分区 (Namespace)</label>
                    {!isCustomSnapshotNs ? (
                      <select
                        value={snapshotNs}
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setIsCustomSnapshotNs(true);
                            setSnapshotNs('');
                          } else {
                            setSnapshotNs(e.target.value);
                          }
                        }}
                        className="sci-control-select"
                      >
                        {namespaces.map((ns) => (
                          <option key={ns} value={ns}>{ns}</option>
                        ))}
                        <option value="__new__">[+] 新建命名空间</option>
                      </select>
                    ) : (
                      <div className="custom-input-group">
                        <input
                          type="text"
                          value={customSnapshotNsText}
                          onChange={(e) => setCustomSnapshotNsText(e.target.value)}
                          placeholder="输入新命名空间..."
                          className="sci-control-input"
                          required
                        />
                        {namespaces.length > 0 && (
                          <button type="button" onClick={() => setIsCustomSnapshotNs(false)} className="sci-cancel-btn">
                            返回
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="form-group-sci">
                    <label htmlFor="snap-desc">核心阶段认知边界摘要 (Summary / Context)</label>
                    <textarea
                      id="snap-desc"
                      value={snapshotSummary}
                      onChange={(e) => setSnapshotSummary(e.target.value)}
                      className="sci-control-textarea"
                      rows="5"
                      required
                    />
                  </div>

                  <button type="submit" className="sci-submit-btn bg-purple" disabled={snapshotLoading}>
                    {snapshotLoading ? '正在冻结...' : '冷冻当前的认知快照'}
                  </button>

                  {snapshotSuccess && <div className="sci-success-banner purple-color">[ SECURE_FREEZE // 认知快照冻结完成 ]</div>}
                </form>
              </GlassCard>
            </div>
          </div>
        )}

        {/* TAB 4: MEMORY_LAYERS (分层记忆) */}
        {activeTab === 'memory' && (
          <div className="tab-view-content fade-in-view memory-tab-layout">
            {activeNamespace === 'all' ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', width: '100%' }}>
                <GlassCard title="系统提示 // SYSTEM NOTICE" glowColor="purple" className="op-panel-card" style={{ maxWidth: '600px', width: '100%' }}>
                  <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'hsl(var(--color-purple))', margin: '0 auto 16px', display: 'block' }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
                    </svg>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>请选择特定的命名空间</div>
                    <div style={{ fontSize: '12px', color: 'hsl(var(--text-muted))', lineHeight: '1.6' }}>
                      分层记忆体系（短期滑动窗口、工作记忆与睡眠巩固）需要指定特定的命名空间进行分区隔离。
                      请在左侧或导航面板中选择具体的命名空间。
                    </div>
                  </div>
                </GlassCard>
              </div>
            ) : (
              <div className="memory-grid-container">
                {/* Left Column: Short-Term Memory Dialog Simulation & Telemetry */}
                <div className="memory-col-left">
                  <GlassCard title="短期记忆滑动窗口 (Short-Term Dialog Window)" glowColor="cyan" className="op-panel-card">
                    <div className="short-term-panel">
                      {/* Simulation Dialog Injector Form */}
                      <form onSubmit={handleAddDialog} className="sci-form" style={{ borderBottom: '1px dashed rgba(0, 242, 254, 0.15)', paddingBottom: '16px', marginBottom: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) auto', gap: '10px', alignItems: 'flex-end' }}>
                          <div className="form-group-sci" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '10px' }}>模拟对话角色</label>
                            <select
                              value={newDialogRole}
                              onChange={(e) => setNewDialogRole(e.target.value)}
                              className="sci-control-select"
                              style={{ padding: '6px 10px', fontSize: '11.5px', height: '34px' }}
                            >
                              <option value="user">User (用户)</option>
                              <option value="assistant">Assistant (智能体)</option>
                            </select>
                          </div>
                          <div className="form-group-sci" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '10px' }}>输入模拟对话内容</label>
                            <input
                              type="text"
                              value={newDialogContent}
                              onChange={(e) => setNewDialogContent(e.target.value)}
                              placeholder="键入一轮模拟的对话内容进行注入测试..."
                              className="sci-control-input"
                              style={{ padding: '6px 10px', fontSize: '11.5px', height: '34px' }}
                              required
                            />
                          </div>
                          <button type="submit" className="sci-submit-btn bg-cyan" disabled={addDialogLoading} style={{ padding: '0 16px', height: '34px', fontSize: '11px', whiteSpace: 'nowrap', flexShrink: 0, minWidth: '80px' }}>
                            {addDialogLoading ? '注入中...' : '注入对话'}
                          </button>
                        </div>
                      </form>

                      {/* Rolling window log list */}
                      <div className="chat-log-list font-mono">
                        {shortTermLoading ? (
                          <div className="search-status-banner" style={{ padding: '20px' }}>[ TELEMETRY_LOADING // 短期记忆读取中... ]</div>
                        ) : shortTermHistory.length === 0 ? (
                          <div className="search-empty-banner" style={{ padding: '30px', borderWidth: 0 }}>
                            <div style={{ fontSize: '11px', color: 'hsl(var(--text-muted))' }}>
                              [ NO_ST_HISTORY // 当前命名空间下无活跃的对话历史。 ]
                            </div>
                            <div style={{ fontSize: '10px', color: 'hsl(var(--text-dark))', marginTop: '6px' }}>
                              请使用上方表单模拟对话，或通过外部 MCP 调用。
                            </div>
                          </div>
                        ) : (
                          <div className="chat-bubbles-container">
                            <div style={{ fontSize: '10px', color: 'hsl(var(--text-muted))', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.03)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>SLIDING_WINDOW_HISTORY:</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span className="text-cyan">{shortTermHistory.length} TURNS</span>
                                <button type="button" onClick={handleClearShortTerm} className="clear-all-wm-btn" style={{ padding: '1px 6px', fontSize: '9px', justifySelf: 'auto' }}>清空全部</button>
                              </div>
                            </div>
                            {shortTermHistory.map((msg, index) => {
                              const isUser = msg.role === 'user';
                              return (
                                <div key={index} className={`chat-bubble-row ${isUser ? 'user-align' : 'agent-align'}`}>
                                  <div className={`chat-bubble ${isUser ? 'user-bubble' : 'agent-bubble'}`} style={{ paddingRight: '28px' }}>
                                    <div className="bubble-role">
                                      {isUser ? '● USER' : '♦ ASSISTANT'}
                                    </div>
                                    <div className="bubble-content">{msg.content}</div>
                                    <button 
                                      type="button" 
                                      onClick={() => handleDeleteShortTerm(index)} 
                                      className="bubble-delete-btn" 
                                      title="删除此条对话"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                </div>

                {/* Right Column: Working Memory Scratchpad & Memory Consolidation */}
                <div className="memory-col-right">
                  {/* Working Memory Scratchpad */}
                  <GlassCard title="工作记忆状态面板 (Working Memory Scratchpad)" glowColor="purple" className="op-panel-card" style={{ marginBottom: '0px' }}>
                    <div className="working-mem-panel">
                      {/* Quick Set Form */}
                      <form onSubmit={handleWriteWorking} className="sci-form" style={{ marginBottom: '16px', borderBottom: '1px dashed rgba(138, 43, 226, 0.15)', paddingBottom: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: '10px', alignItems: 'flex-end' }}>
                          <div className="form-group-sci" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '10px' }}>状态键 (Key)</label>
                            <input
                              type="text"
                              value={newWorkingKey}
                              onChange={(e) => setNewWorkingKey(e.target.value)}
                              placeholder="例如: current_goal"
                              className="sci-control-input"
                              style={{ padding: '6px 10px', fontSize: '11.5px', height: '34px' }}
                              required
                            />
                          </div>
                          <div className="form-group-sci" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '10px' }}>状态值 (Value)</label>
                            <input
                              type="text"
                              value={newWorkingValue}
                              onChange={(e) => setNewWorkingValue(e.target.value)}
                              placeholder="当前上下文状态值..."
                              className="sci-control-input"
                              style={{ padding: '6px 10px', fontSize: '11.5px', height: '34px' }}
                              required
                            />
                          </div>
                          <button type="submit" className="sci-submit-btn bg-purple" disabled={writeWorkingLoading} style={{ padding: '0 16px', height: '34px', fontSize: '11px', whiteSpace: 'nowrap', flexShrink: 0, minWidth: '80px' }}>
                            {writeWorkingLoading ? '写入中...' : '写入状态'}
                          </button>
                        </div>
                      </form>

                      {/* Working State List */}
                      <div className="working-state-list font-mono" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {workingLoading ? (
                          <div className="search-status-banner" style={{ padding: '15px' }}>[ TELEMETRY_LOADING // 工作状态获取中... ]</div>
                        ) : Object.keys(workingState).length === 0 ? (
                          <div className="search-empty-banner" style={{ padding: '20px', borderWidth: 0 }}>
                            <div style={{ fontSize: '11px', color: 'hsl(var(--text-muted))' }}>
                              [ EMPTY_SCRATCHPAD // 当前无活跃的工作状态。 ]
                            </div>
                          </div>
                        ) : (
                          <div className="working-table">
                            <div className="working-table-header">
                              <span>KEY (状态键)</span>
                              <span>VALUE (状态内容)</span>
                              <button type="button" onClick={handleClearWorking} className="clear-all-wm-btn">清空所有</button>
                            </div>
                            {Object.entries(workingState).map(([key, val]) => {
                              const isEditing = editingWorkingKey === key;
                              return (
                                <div key={key} className="working-table-row">
                                  <span className="wm-row-key text-purple" title={key}>{key}</span>
                                  {isEditing ? (
                                    <div style={{ display: 'flex', gap: '8px', flex: 1, gridColumn: 'span 2', padding: '0' }}>
                                      <input
                                        type="text"
                                        value={editingWorkingValue}
                                        onChange={(e) => setEditingWorkingValue(e.target.value)}
                                        className="sci-control-input"
                                        style={{ padding: '4px 8px', fontSize: '11px', flex: 1 }}
                                      />
                                      <button type="button" className="wm-save-btn" onClick={() => handleSaveWorkingEdit(key)}>保存</button>
                                      <button type="button" className="wm-cancel-btn" onClick={() => setEditingWorkingKey(null)}>取消</button>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="wm-row-val" title={val}>{val}</span>
                                      <div className="wm-row-actions">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingWorkingKey(key);
                                            setEditingWorkingValue(val);
                                          }}
                                          className="wm-edit-btn-inline"
                                        >
                                          修改
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteWorking(key)}
                                          className="wm-del-btn-inline"
                                        >
                                          删除
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </GlassCard>

                  {/* Memory Consolidation Trigger */}
                  <GlassCard title="记忆整合与睡眠巩固 (Memory Consolidation)" glowColor="purple" className="op-panel-card" style={{ marginTop: '20px' }}>
                    <div className="consolidation-panel font-mono">
                      <div className="consolidation-desc">
                        <p style={{ fontSize: '11px', color: 'hsl(var(--text-muted))', lineHeight: '1.6', margin: '0 0 12px 0' }}>
                          [ 睡眠巩固机制 ] 将最近的高频短期对话记忆（滑动窗口）提取核心内容，调用大模型自动进行高纯度摘要并持久化为长期记忆。此过程模拟人类的睡眠巩固，有助于整理对话碎片、避免遗忘。
                        </p>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <button
                          type="button"
                          onClick={handleConsolidate}
                          disabled={consolidationLoading || shortTermHistory.length === 0}
                          className="sci-submit-btn bg-purple"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', height: '36px' }}
                        >
                          {consolidationLoading ? (
                            <>
                              <svg width="16" height="16" viewBox="0 0 40 40" className="spinning-ring" style={{ color: 'white' }}>
                                <circle cx="20" cy="20" r="16" fill="transparent" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                                <circle cx="20" cy="20" r="16" fill="transparent" stroke="white" strokeWidth="4" strokeDasharray="30,80" />
                              </svg>
                              <span>正在压缩巩固短期记忆中...</span>
                            </>
                          ) : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                              </svg>
                              <span>触发整合提炼 (Consolidate Memory)</span>
                            </>
                          )}
                        </button>

                        {shortTermHistory.length === 0 && (
                          <span style={{ fontSize: '10px', color: 'hsl(var(--color-purple))', textAlign: 'center' }}>
                            ⚠️ 需当前命名空间下有短期对话对话历史方可进行整合。
                          </span>
                        )}

                        {consolidationMessage && (
                          <div className="sci-success-banner purple-color" style={{ marginTop: '6px', textAlign: 'left', padding: '10px' }}>
                            <div>[ STATUS: {consolidationMessage} ]</div>
                            {consolidationId && <div style={{ marginTop: '4px', fontSize: '10px', color: 'white' }}>长期记忆 ID: {consolidationId}</div>}
                          </div>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: SESSIONS (会话管理) */}
        {activeTab === 'sessions' && (
          <div className="tab-view-content fade-in-view ingest-tab-layout">
            {activeNamespace === 'all' ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', width: '100%' }}>
                <GlassCard title="系统提示 // SYSTEM NOTICE" glowColor="purple" className="op-panel-card" style={{ maxWidth: '600px', width: '100%' }}>
                  <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'hsl(var(--color-purple))', margin: '0 auto 16px', display: 'block' }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
                    </svg>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>请选择特定的命名空间</div>
                    <div style={{ fontSize: '12px', color: 'hsl(var(--text-muted))', lineHeight: '1.6' }}>
                      会话管理需要指定特定的命名空间进行分区隔离。请在左侧或导航面板中选择具体的命名空间。
                    </div>
                  </div>
                </GlassCard>
              </div>
            ) : (
              <>
                <div className="ingest-column">
                  <GlassCard title="创建会话 (Create Session)" glowColor="cyan" className="op-panel-card">
                    <form onSubmit={handleCreateSession} className="sci-form">
                      <div className="form-group-sci">
                        <label>命名空间 (Namespace)</label>
                        <input type="text" value={activeNamespace} className="sci-control-input" disabled style={{ opacity: 0.6 }} />
                      </div>
                      <div className="form-group-sci">
                        <label>会话 ID (可选，留空自动生成)</label>
                        <input type="text" value={newSessionId} onChange={(e) => setNewSessionId(e.target.value)} placeholder="自定义会话 ID..." className="sci-control-input" />
                      </div>
                      <button type="submit" className="sci-submit-btn bg-cyan" disabled={createSessionLoading}>
                        {createSessionLoading ? '创建中...' : '创建新会话'}
                      </button>
                    </form>
                  </GlassCard>

                  <GlassCard title="会话列表 (Session List)" glowColor="purple" className="op-panel-card">
                    <div style={{ marginBottom: '12px' }}>
                      <select
                        value={sessionStatusFilter || ''}
                        onChange={(e) => setSessionStatusFilter(e.target.value || null)}
                        className="sci-control-select"
                      >
                        <option value="">全部状态</option>
                        <option value="active">活跃 (Active)</option>
                        <option value="archived">已归档 (Archived)</option>
                        <option value="closed">已关闭 (Closed)</option>
                      </select>
                    </div>
                    {sessionsLoading ? (
                      <div className="search-status-banner font-mono" style={{ padding: '20px' }}>[ LOADING_SESSIONS // 会话数据加载中... ]</div>
                    ) : sessions.length === 0 ? (
                      <div className="search-empty-banner font-mono" style={{ padding: '20px' }}>[ NO_SESSIONS // 当前命名空间下暂无会话记录 ]</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                        {sessions.map((s) => (
                          <div
                            key={s.id}
                            onClick={() => setSelectedSession(s)}
                            style={{
                              padding: '10px 12px',
                              border: `1px solid ${selectedSession?.id === s.id ? 'hsl(var(--color-cyan))' : 'rgba(255,255,255,0.06)'}`,
                              borderRadius: '6px',
                              cursor: 'pointer',
                              background: selectedSession?.id === s.id ? 'rgba(0,242,254,0.06)' : 'rgba(0,0,0,0.2)',
                              transition: 'all 0.2s ease',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ color: 'hsl(var(--color-cyan))', fontSize: '10px' }}>{s.id.substring(0, 12)}...</span>
                              <span style={{
                                padding: '1px 8px',
                                borderRadius: '3px',
                                fontSize: '9px',
                                fontWeight: 'bold',
                                background: s.status === 'active' ? 'rgba(74,222,128,0.1)' : s.status === 'archived' ? 'rgba(255,187,0,0.1)' : 'rgba(244,63,94,0.1)',
                                color: s.status === 'active' ? 'hsl(var(--color-green))' : s.status === 'archived' ? 'hsl(var(--color-cyan))' : 'hsl(var(--color-red))',
                              }}>
                                {s.status.toUpperCase()}
                              </span>
                            </div>
                            <div style={{ color: 'hsl(var(--text-muted))', fontSize: '9px' }}>
                              创建: {new Date(s.created_at * 1000).toLocaleString('zh-CN')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </GlassCard>
                </div>

                <div className="ingest-column">
                  {selectedSession ? (
                    <>
                      <GlassCard title={`会话详情 // ${selectedSession.id.substring(0, 12)}...`} glowColor="cyan" className="op-panel-card">
                        <div className="sci-form" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                            <div style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
                              <span style={{ color: 'hsl(var(--text-muted))' }}>状态:</span>
                              <span style={{ marginLeft: '6px', color: selectedSession.status === 'active' ? 'hsl(var(--color-green))' : 'hsl(var(--text-primary))' }}>{selectedSession.status}</span>
                            </div>
                            <div style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
                              <span style={{ color: 'hsl(var(--text-muted))' }}>命名空间:</span>
                              <span style={{ marginLeft: '6px' }}>{selectedSession.namespace}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {selectedSession.status === 'active' && (
                              <button type="button" onClick={() => handleUpdateSessionStatus(selectedSession.id, 'archived')} className="sci-submit-btn" style={{ background: 'rgba(255,187,0,0.15)', color: 'hsl(var(--color-cyan))', height: '28px', fontSize: '10px' }}>
                                归档
                              </button>
                            )}
                            {(selectedSession.status === 'active' || selectedSession.status === 'archived') && (
                              <button type="button" onClick={() => handleUpdateSessionStatus(selectedSession.id, 'closed')} className="sci-submit-btn" style={{ background: 'rgba(244,63,94,0.1)', color: 'hsl(var(--color-red))', height: '28px', fontSize: '10px' }}>
                                关闭
                              </button>
                            )}
                            {selectedSession.status === 'closed' && (
                              <button type="button" onClick={() => handleUpdateSessionStatus(selectedSession.id, 'active')} className="sci-submit-btn bg-cyan" style={{ height: '28px', fontSize: '10px' }}>
                                重新激活
                              </button>
                            )}
                            <button type="button" onClick={() => handleGetSessionContext(selectedSession.id)} className="sci-submit-btn bg-cyan" disabled={sessionContextLoading} style={{ height: '28px', fontSize: '10px' }}>
                              {sessionContextLoading ? '加载中...' : '恢复上下文'}
                            </button>
                            <button type="button" onClick={() => handleDeleteSession(selectedSession.id)} className="sci-submit-btn" style={{ background: 'rgba(244,63,94,0.15)', color: 'hsl(var(--color-red))', height: '28px', fontSize: '10px' }}>
                              删除
                            </button>
                          </div>
                          {sessionContext && (
                            <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,242,254,0.1)', borderRadius: '6px', padding: '10px', fontSize: '10.5px', fontFamily: 'var(--font-mono)', maxHeight: '150px', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: '1.5', color: '#e5e7eb' }}>
                              {sessionContext}
                            </div>
                          )}
                        </div>
                      </GlassCard>

                      <GlassCard title="关联记忆 (Linked Memories)" glowColor="purple" className="op-panel-card">
                        <form onSubmit={handleLinkMemory} className="sci-form" style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" value={linkMemoryId} onChange={(e) => setLinkMemoryId(e.target.value)} placeholder="输入记忆 ID 以关联..." className="sci-control-input" style={{ height: '30px', fontSize: '11px' }} required />
                            <button type="submit" className="sci-submit-btn bg-cyan" style={{ height: '30px', fontSize: '10px', whiteSpace: 'nowrap', minWidth: '60px' }}>
                              关联
                            </button>
                          </div>
                        </form>
                        {sessionMemories.length === 0 ? (
                          <div className="search-empty-banner font-mono" style={{ padding: '15px', fontSize: '10px' }}>[ NO_LINKED // 暂无关联记忆 ]</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                            {sessionMemories.map((m) => (
                              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                  <div style={{ color: 'hsl(var(--color-cyan))', fontSize: '9px', marginBottom: '2px' }}>{m.id?.substring(0, 12)}...</div>
                                  <div style={{ color: 'hsl(var(--text-muted))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.content?.substring(0, 60)}</div>
                                </div>
                                <button type="button" onClick={() => handleUnlinkMemory(m.id)} style={{ background: 'transparent', border: '1px solid rgba(244,63,94,0.3)', color: 'hsl(var(--color-red))', borderRadius: '3px', padding: '2px 8px', fontSize: '9px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                                  解除
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </GlassCard>
                    </>
                  ) : (
                    <GlassCard title="会话详情 (Session Detail)" glowColor="purple" className="op-panel-card">
                      <div className="search-empty-banner font-mono" style={{ padding: '30px' }}>[ SELECT_SESSION // 请从左侧列表中选择一个会话 ]</div>
                    </GlassCard>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 6: DECAY / FORGET (遗忘衰减) */}
        {activeTab === 'decay' && (
          <div className="tab-view-content fade-in-view ingest-tab-layout">
            {activeNamespace === 'all' ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', width: '100%' }}>
                <GlassCard title="系统提示 // SYSTEM NOTICE" glowColor="purple" className="op-panel-card" style={{ maxWidth: '600px', width: '100%' }}>
                  <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'hsl(var(--color-purple))', margin: '0 auto 16px', display: 'block' }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
                    </svg>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>请选择特定的命名空间</div>
                    <div style={{ fontSize: '12px', color: 'hsl(var(--text-muted))', lineHeight: '1.6' }}>
                      主动遗忘和命名空间保护需要指定特定的命名空间。请在左侧或导航面板中选择具体的命名空间。
                    </div>
                  </div>
                </GlassCard>
              </div>
            ) : (
              <>
                <div className="ingest-column">
                  <GlassCard title="主动遗忘 (Active Forgetting)" glowColor="cyan" className="op-panel-card">
                    <div style={{ padding: '10px 0', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'hsl(var(--text-muted))', lineHeight: '1.6', borderBottom: '1px dashed rgba(0,242,254,0.15)', marginBottom: '14px' }}>
                      按容量上限淘汰低分、未置顶的记忆。系统将按照重要性评分排序，保留高分和置顶记忆，淘汰超出容量的低分记忆。
                    </div>
                    <form onSubmit={handleActiveForgetting} className="sci-form">
                      <div className="form-group-sci">
                        <label>目标命名空间</label>
                        <input type="text" value={activeNamespace} className="sci-control-input" disabled style={{ opacity: 0.6 }} />
                      </div>
                      <div className="form-group-sci">
                        <div className="slider-label-row">
                          <label>容量上限 (Max Capacity)</label>
                          <span className="slider-val text-cyan font-mono">{forgetCapacity.toLocaleString()}</span>
                        </div>
                        <input
                          type="range"
                          min="100"
                          max="50000"
                          step="100"
                          value={forgetCapacity}
                          onChange={(e) => setForgetCapacity(parseInt(e.target.value))}
                          className="sci-slider"
                        />
                        <div className="input-helper-text font-mono" style={{ fontSize: '10px', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                          超过此数量的低分记忆将被淘汰
                        </div>
                      </div>
                      <button type="submit" className="sci-submit-btn" disabled={forgetLoading} style={{ background: 'rgba(244,63,94,0.15)', color: 'hsl(var(--color-red))' }}>
                        {forgetLoading ? '执行中...' : '执行主动遗忘'}
                      </button>
                      {forgetResult && (
                        <div className="sci-success-banner" style={{ background: forgetResult.deleted_count > 0 ? 'rgba(244,63,94,0.08)' : 'rgba(74,222,128,0.08)', color: forgetResult.deleted_count > 0 ? 'hsl(var(--color-red))' : 'hsl(var(--color-green))' }}>
                          [ FORGET_DONE // 淘汰了 {forgetResult.deleted_count} 条低分记忆，命名空间: {forgetResult.namespace} ]
                        </div>
                      )}
                    </form>
                  </GlassCard>

                  <GlassCard title="当前命名空间状态" glowColor="purple" className="op-panel-card">
                    <div className="sci-form font-mono" style={{ fontSize: '11px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', textAlign: 'center' }}>
                          <div style={{ color: 'hsl(var(--text-muted))', fontSize: '9px' }}>总记忆数</div>
                          <div style={{ color: 'hsl(var(--color-cyan))', fontSize: '18px', fontWeight: 'bold' }}>{stats.total_chunks}</div>
                        </div>
                        <div style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', textAlign: 'center' }}>
                          <div style={{ color: 'hsl(var(--text-muted))', fontSize: '9px' }}>容量上限</div>
                          <div style={{ color: 'hsl(var(--color-purple))', fontSize: '18px', fontWeight: 'bold' }}>{forgetCapacity.toLocaleString()}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', color: stats.total_chunks > forgetCapacity ? 'hsl(var(--color-red))' : 'hsl(var(--color-green))', textAlign: 'center' }}>
                        {stats.total_chunks > forgetCapacity
                          ? `[ WARNING // 超出容量 ${stats.total_chunks - forgetCapacity} 条，建议执行遗忘 ]`
                          : `[ OK // 容量充足，无需遗忘 ]`}
                      </div>
                    </div>
                  </GlassCard>
                </div>

                <div className="ingest-column">
                  <GlassCard title="命名空间保护 (Namespace Protection)" glowColor="cyan" className="op-panel-card">
                    <div style={{ padding: '10px 0', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'hsl(var(--text-muted))', lineHeight: '1.6', borderBottom: '1px dashed rgba(0,242,254,0.15)', marginBottom: '14px' }}>
                      受保护的命名空间变为只读，禁止写入和删除操作。适用于保护重要数据不被误操作。
                    </div>
                    <form onSubmit={handleProtectNamespace} className="sci-form" style={{ marginBottom: '14px' }}>
                      <div className="form-group-sci">
                        <label>保护命名空间</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <select
                            value={protectTargetNs}
                            onChange={(e) => setProtectTargetNs(e.target.value)}
                            className="sci-control-select"
                            style={{ flex: 1 }}
                          >
                            <option value="">-- 选择命名空间 --</option>
                            {namespaces.map((ns) => (
                              <option key={ns} value={ns}>{ns}</option>
                            ))}
                          </select>
                          <button type="submit" className="sci-submit-btn bg-cyan" disabled={protectLoading || !protectTargetNs} style={{ height: '34px', fontSize: '10px', whiteSpace: 'nowrap' }}>
                            {protectLoading ? '...' : '锁定'}
                          </button>
                        </div>
                      </div>
                    </form>
                    {protectedNamespaces.length === 0 ? (
                      <div className="search-empty-banner font-mono" style={{ padding: '15px', fontSize: '10px' }}>[ NO_PROTECTED // 暂无受保护的命名空间 ]</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '10px', color: 'hsl(var(--text-muted))', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                          受保护的命名空间 ({protectedNamespaces.length}):
                        </div>
                        {protectedNamespaces.map((ns) => (
                          <div key={ns} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,187,0,0.05)', border: '1px solid rgba(255,187,0,0.15)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                            <span>
                              <span style={{ color: 'hsl(var(--color-cyan))' }}>🔒</span>
                              <span style={{ marginLeft: '6px' }}>{ns}</span>
                            </span>
                            <button type="button" onClick={() => handleUnprotectNamespace(ns)} style={{ background: 'transparent', border: '1px solid rgba(244,63,94,0.3)', color: 'hsl(var(--color-red))', borderRadius: '3px', padding: '2px 8px', fontSize: '9px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                              解锁
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </GlassCard>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 7: KNOWLEDGE_GALAXY (星系图谱) */}
        {activeTab === 'graph' && (
          <div className="tab-view-content fade-in-view" style={{ width: '100%', height: '100%' }}>
            <KnowledgeGraph />
          </div>
        )}

        {/* TAB 8: TUTORIAL (使用教程) */}
        {activeTab === 'tutorial' && (
          <div className="tab-view-content fade-in-view tutorial-tab-layout" style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', paddingBottom: '30px' }}>
            <GlassCard title="AGENT MEMORY 使用手册 // SYSTEM MANUAL" glowColor="cyan" className="op-panel-card">
              <div className="manual-header-sci">
                <div className="decor-bar"></div>
                <div className="title-text font-mono">[ MANUAL_RELOAD // AGENT_MEM_SYS_V2.6 ]</div>
                <div className="sub-desc">
                  本手册提供 Agent Memory 系统的核心架构、操作指南以及常见工作流介绍，助您快速管理外部 AI 记忆上下文。
                </div>
              </div>
            </GlassCard>

            {/* Function Overview Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '20px' }}>
              {/* Left side: Navigation / Table of Contents */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <GlassCard title="系统界面总览 (INTERFACE OVERVIEW)" glowColor="purple" className="op-panel-card">
                  <div style={{ padding: '6px' }} className="font-mono">
                    <table className="sci-mini-table">
                      <thead>
                        <tr>
                          <th>标签页</th>
                          <th>核心用途</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="text-cyan">🔍 检索</td>
                          <td>搜语义 / 打包上下文</td>
                        </tr>
                        <tr>
                          <td className="text-cyan">➕ 写入</td>
                          <td>手动添加长期记忆</td>
                        </tr>
                        <tr>
                          <td className="text-cyan">🧠 记忆层级</td>
                          <td>短期 / 工作 / 长期管理</td>
                        </tr>
                        <tr>
                          <td className="text-cyan">🗂️ 会话</td>
                          <td>创建、关联、归档会话</td>
                        </tr>
                        <tr>
                          <td className="text-cyan">🗑️ 遗忘</td>
                          <td>主动清理与命名空间保护</td>
                        </tr>
                        <tr>
                          <td className="text-cyan">🌌 知识图谱</td>
                          <td>代码 AST 可视化与关系导航</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="sci-note-text" style={{ marginTop: '14px' }}>
                      💡 中央全息人头会响应每个操作给出反馈。右上切换器决定当前库（默认 default，all 跨库检索）。
                    </div>
                  </div>
                </GlassCard>

                <GlassCard title="快速工作流索引 (QUICK WORKFLOWS)" glowColor="cyan" className="op-panel-card">
                  <div className="font-mono" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '4px' }}>
                    <div className="workflow-link-item">
                      <span className="bullet">⚡</span>
                      <div className="wf-body">
                        <span className="title text-white">会议纪要导入</span>
                        <span className="desc">切到「写入」→ 填入来源标签 → 贴入文本并写入</span>
                      </div>
                    </div>
                    <div className="workflow-link-item">
                      <span className="bullet">⚡</span>
                      <div className="wf-body">
                        <span className="title text-white">新项目调研会话</span>
                        <span className="desc">「会话」建新会话 → 「检索」结果点「+ 会话」关联</span>
                      </div>
                    </div>
                    <div className="workflow-link-item">
                      <span className="bullet">⚡</span>
                      <div className="wf-body">
                        <span className="title text-white">代码库分析</span>
                        <span className="desc">「知识图谱」→ 「提取代码库」→ 填入绝对路径</span>
                      </div>
                    </div>
                    <div className="workflow-link-item">
                      <span className="bullet">⚡</span>
                      <div className="wf-body">
                        <span className="title text-white">记忆库防爆裁剪</span>
                        <span className="desc">「遗忘」设保护库 → 执行最大容量裁剪</span>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* Right side: Detailed Feature Manual */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <GlassCard title="核心功能详解 (DETAILED OPERATIONS)" glowColor="cyan" className="op-panel-card">
                  <div className="manual-scroll-area scrollbar-thin" style={{ maxHeight: '530px', overflowY: 'auto', paddingRight: '6px' }}>
                    
                    {/* Section 1 */}
                    <div className="manual-section">
                      <h3 className="text-cyan font-mono">1. 知识检索 (Search System)</h3>
                      <p className="font-mono">提供两种高阶检索与打包子模式：</p>
                      <ul className="font-mono">
                        <li><strong>语义检索 (Semantic)</strong>：输入中文/英文查询，滑块设定召回数 Top-K。召回结果可即时编辑、删除，或复制单条 LLM 格式化提示词。</li>
                        <li><strong>上下文打包 (Pack)</strong>：输入搜索词并设置最大 Token 预算（例如 2000）。系统按关联度智能去重排序，自动裁切拼装出最匹配的上下文，一键复制即可粘贴使用。</li>
                      </ul>
                    </div>

                    {/* Section 2 */}
                    <div className="manual-section">
                      <h3 className="text-cyan font-mono">2. 数据写入 (Ingest System)</h3>
                      <p className="font-mono">将任意原始文本转换为长期记忆：</p>
                      <ul className="font-mono">
                        <li><strong>命名空间</strong>：目标存放库（自动读取当前选择）。</li>
                        <li><strong>来源标签 (Source)</strong>：如 <code>meeting-2026-06</code>，用于后续追踪与按源批量清理。</li>
                        <li><strong>去重阈值</strong>：0~1 浮点数。若写入内容与已有记忆的相似度高于此阈值，系统会自动合并或覆盖，防止存储冗余（设为 0 关闭去重）。</li>
                      </ul>
                    </div>

                    {/* Section 3 */}
                    <div className="manual-section">
                      <h3 className="text-cyan font-mono">3. 记忆层级 (Memory Layers)</h3>
                      <p className="font-mono">模拟人类大脑的短期、工作和长期记忆层：</p>
                      <ul className="font-mono">
                        <li><strong>短期记忆 (Dialog Buffer)</strong>：自动缓存最近一两轮对话。可手动精炼，提炼出关键点写入长期记忆中。</li>
                        <li><strong>工作记忆 (Scratchpad)</strong>：以键值对 (KeyValue) 方式保存系统/用户定义的变量（如 <code>current_project = shipbear</code>）。浏览器关闭后依然留存，除非手动清空。</li>
                        <li><strong>长期记忆 (Long-term DB)</strong>：固化后的向量与 FTS5 记录。支持 📌 钉住操作，被钉住的记忆将永不被遗忘或裁剪机制删除。</li>
                      </ul>
                    </div>

                    {/* Section 4 */}
                    <div className="manual-section">
                      <h3 className="text-cyan font-mono">4. 会话管理 (Sessions)</h3>
                      <p className="font-mono">多源记忆逻辑归集与现场重置方案：</p>
                      <ul className="font-mono">
                        <li>新建会话并命名。在「检索」页中搜索到关键事实时，点击 <code>+ 会话</code> 将其塞入会话包。</li>
                        <li>切回会话管理页，点击 <code>恢复上下文</code> 即可一次性打包会话内的全部关联事实，恢复原项目工作区环境。</li>
                        <li>支持 active / archived / closed 状态转换，防止垃圾会话干扰。</li>
                      </ul>
                    </div>

                    {/* Section 5 */}
                    <div className="manual-section">
                      <h3 className="text-cyan font-mono">5. 主动遗忘与裁剪 (Decay & Protected)</h3>
                      <p className="font-mono">通过自动能量衰减模型与白名单防灾：</p>
                      <ul className="font-mono">
                        <li><strong>容量裁剪 (Decay)</strong>：设定最大 Chunk 数量上限（如 10000），系统按「访问最少 + 时间最旧」规则物理清理未置顶的超额节点。</li>
                        <li><strong>命名空间保护 (Protected)</strong>：将重要库（如 <code>core-persona</code> / <code>critical-rules</code>）设为 Protected。保护库对所有删除、清空、裁剪操作免疫，绝对安全。</li>
                      </ul>
                    </div>

                    {/* Section 6 */}
                    <div className="manual-section" style={{ borderBottom: 'none' }}>
                      <h3 className="text-cyan font-mono">6. 知识图谱 (Galaxy Graph)</h3>
                      <p className="font-mono">基于 AST 语法树的代码全局结构可视化：</p>
                      <ul className="font-mono">
                        <li><strong>代码提取</strong>：点击 <code>📂 提取代码库</code> 填入本地代码库绝对路径，Graphify 将利用 Tree-Sitter 语法解析符号、依赖、函数并直接导入图谱。</li>
                        <li><strong>离线导入</strong>：点击 <code>📥 导入 graph.json</code> 填入离线 JSON 文件路径，快速复原 AST 节点。</li>
                        <li><strong>拓扑寻路</strong>：在两颗星体之间查询最短调用路径（Max Depth: 5），路径以亮绿色线条发光高亮展示。</li>
                        <li><strong>社区划分</strong>：同种颜色的星体簇代表通过 Louvain 网络社团算法自动聚类的逻辑相关代码块。</li>
                        <li><strong>关系颜色对照</strong>：<br/>
                          <span style={{ color: '#00f2fe' }}>■ calls (青色)</span> | {' '}
                          <span style={{ color: '#ffbb00' }}>■ contains (橙色)</span> | {' '}
                          <span style={{ color: '#10b981' }}>■ imports (绿色)</span> | {' '}
                          <span style={{ color: '#a855f7' }}>■ inherits (紫色)</span> | {' '}
                          <span style={{ color: '#9ca3af' }}>■ references (灰色)</span>
                        </li>
                      </ul>
                    </div>

                  </div>
                </GlassCard>

                <GlassCard title="系统接口与外部连接 (API & MCP CONNECT)" glowColor="purple" className="op-panel-card">
                  <div className="font-mono" style={{ padding: '6px', fontSize: '11px', lineHeight: '1.6' }}>
                    <p>Agent Memory REST 后端服务器在本地持续运行：</p>
                    <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <li>后端接口基准地址：<code className="text-cyan">http://127.0.0.1:8900</code></li>
                      <li>交互式 Swagger 接口文档：<a href="http://127.0.0.1:8900/docs" target="_blank" rel="noreferrer" className="text-cyan" style={{ textDecoration: 'underline' }}>http://127.0.0.1:8900/docs</a></li>
                      <li>MCP (Model Context Protocol) 协议接口：脚本文件位于 <code className="text-white">Agent-Memory-Server/server.py</code>，已注册供 Antigravity IDE 和 Claude Code 命令行工具使用。</li>
                      <li>
                        <strong>如何在 Claude Code (CLI) / Antigravity IDE 里面直接调用：</strong>
                        <div style={{ background: 'rgba(0,0,0,0.35)', padding: '10px', borderRadius: '8px', marginTop: '6px', borderLeft: '3px solid hsl(var(--color-cyan))', border: '1px solid rgba(255, 187, 0, 0.15)', lineHeight: '1.7' }}>
                          重启 <code>claude</code> CLI 后，直接用普通人类语言对它下达指令即可触发对应的 MCP 工具，例如：<br/>
                          - <strong>添加长期记忆：</strong> <code>记住我在这个项目的开发偏好：所有后端 API 的超时时间都是 15s</code><br/>
                          - <strong>跨会话查询：</strong> <code>帮我查一下之前记录的后端 API 偏好有哪些</code><br/>
                          - <strong>精确源码检索：</strong> <code>在项目源码里检索 'dedup_threshold' 的定义和使用处</code> (此操作会触发 <code>precise_source_search</code> 工具，在已导入图谱节点关联的所有源文件内进行精准上下文定位)<br/>
                          - <strong>清空命名空间图谱：</strong> <code>清空命名空间 'myproject' 的全部数据</code> (触发 <code>clear_namespace</code>，瞬间清除该分区的节点与关联链路)<br/>
                          - <strong>同步重建代码库：</strong> <code>重新同步 'E:/my-project' 到命名空间 'myproject'</code> (触发 <code>sync_codebase</code>，执行先清空再重新提取。大库可能耗时过长，建议直接在前端罗盘控制台勾选“同步重建”运行)<br/>
                          - <strong>读写工作记忆：</strong> <code>把临时变量 current_branch 记录为 feature/auth</code><br/>
                          - <strong>分析星系图谱：</strong> <code>查看当前记忆图谱的统计信息</code>
                        </div>
                      </li>
                    </ul>
                  </div>
                </GlassCard>
              </div>
            </div>
          </div>
        )}

        </div>
      </div>

      <style jsx>{`
        .cockpit-container {
          max-width: 1400px;
          margin: 0 auto;
          position: relative;
        }

        .cockpit-container.graph-mode {
          max-width: none;
          width: 100%;
          margin: 0;
          padding: 0;
        }

        .cockpit-layout-grid {
          position: relative;
          z-index: 10;
          height: calc(100vh - var(--header-height) - 60px);
          width: 100%;
        }

        .system-left-panel, .avatar-center-panel, .operations-right-panel {
          position: absolute;
          top: 0;
          bottom: 0;
          transition: all 0.5s cubic-bezier(0.25, 1, 0.3, 1);
        }

        /* Default (Dashboard Tab) */
        .system-left-panel {
          left: 0;
          width: 320px;
          opacity: 1;
          visibility: visible;
        }

        .avatar-center-panel {
          left: 344px;
          width: calc(100% - 320px - 450px - 48px);
          opacity: 1;
          visibility: visible;
        }

        .operations-right-panel {
          right: 0;
          width: 450px;
          opacity: 1;
          visibility: visible;
        }

        /* Search / Ingest / Memory / Sessions / Decay / Tutorial Tabs Layout Swap */
        .cockpit-layout-grid.active-tab-search .system-left-panel,
        .cockpit-layout-grid.active-tab-ingest .system-left-panel,
        .cockpit-layout-grid.active-tab-memory .system-left-panel,
        .cockpit-layout-grid.active-tab-sessions .system-left-panel,
        .cockpit-layout-grid.active-tab-decay .system-left-panel,
        .cockpit-layout-grid.active-tab-tutorial .system-left-panel {
          left: -340px;
          opacity: 0;
          visibility: hidden;
        }

        .cockpit-layout-grid.active-tab-search .avatar-center-panel,
        .cockpit-layout-grid.active-tab-ingest .avatar-center-panel,
        .cockpit-layout-grid.active-tab-memory .avatar-center-panel,
        .cockpit-layout-grid.active-tab-sessions .avatar-center-panel,
        .cockpit-layout-grid.active-tab-decay .avatar-center-panel,
        .cockpit-layout-grid.active-tab-tutorial .avatar-center-panel {
          left: 0;
          width: 320px;
        }

        .cockpit-layout-grid.active-tab-search .operations-right-panel,
        .cockpit-layout-grid.active-tab-ingest .operations-right-panel,
        .cockpit-layout-grid.active-tab-memory .operations-right-panel,
        .cockpit-layout-grid.active-tab-sessions .operations-right-panel,
        .cockpit-layout-grid.active-tab-decay .operations-right-panel,
        .cockpit-layout-grid.active-tab-tutorial .operations-right-panel {
          left: 344px;
          width: calc(100% - 320px - 24px);
        }

        /* Graph Tab Layout Overrides (Only Graph tab is modified!) */
        .cockpit-layout-grid.active-tab-graph .system-left-panel {
          left: -340px;
          opacity: 0;
          visibility: hidden;
        }

        .cockpit-layout-grid.active-tab-graph .avatar-center-panel {
          position: absolute;
          left: 20px;
          bottom: 20px;
          top: auto;
          z-index: 10;
          pointer-events: none;
          transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .cockpit-layout-grid.active-tab-graph .avatar-center-panel.graph-avatar-collapsed {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 1px solid hsl(var(--color-cyan));
          background: rgba(8, 7, 5, 0.9);
          box-shadow: 0 0 10px rgba(0, 242, 254, 0.25);
          overflow: hidden;
          pointer-events: auto;
          cursor: pointer;
        }

        .cockpit-layout-grid.active-tab-graph .avatar-center-panel.graph-avatar-expanded {
          width: 75px;
          height: 75px;
          border-radius: 8px;
          border: 1.5px solid hsl(var(--color-cyan));
          background: rgba(8, 7, 5, 0.85);
          box-shadow: 0 0 15px rgba(0, 242, 254, 0.35);
          overflow: hidden;
          pointer-events: auto;
          cursor: pointer;
        }

        .cockpit-layout-grid.active-tab-graph .operations-right-panel {
          left: 0;
          right: 0;
          width: 100%;
          height: calc(100vh - var(--header-height) - 60px);
          padding-right: 0;
          overflow: hidden;
        }

        /* Left column panel */
        .system-left-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
          overflow-y: auto;
          padding-right: 4px;
          pointer-events: auto;
        }

        /* Center Column styles */
        .avatar-center-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          pointer-events: auto;
          overflow: hidden;
        }

        .avatar-container-inner {
          width: 100%;
          height: 100%;
          z-index: 2;
          position: relative;
        }

        /* Telemetry Grid inside left panel */
        .telemetry-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 4px 0;
        }

        .telemetry-item {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          border-bottom: 1px dashed rgba(255, 187, 0, 0.05);
          padding-bottom: 6px;
        }

        .telemetry-item:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .telemetry-item .lbl {
          color: hsl(var(--text-muted));
        }

        .telemetry-item .val {
          font-weight: bold;
        }

        .panel-card-sci {
          background: rgba(8, 7, 5, 0.6);
        }

        .sci-card-value {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 10px 0;
        }

        .sci-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .sci-dot.online { background-color: hsl(var(--color-green)); box-shadow: 0 0 10px hsl(var(--color-green)); }
        .sci-dot.offline { background-color: hsl(var(--color-red)); box-shadow: 0 0 10px hsl(var(--color-red)); }

        .sci-large-text {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.5px;
        }

        .sci-unit {
          font-size: 11px;
          color: hsl(var(--text-muted));
          margin-left: 6px;
          font-weight: 600;
        }

        .sci-footer-details {
          font-size: 10px;
          color: hsl(var(--text-muted));
          border-top: 1px solid rgba(255, 255, 255, 0.03);
          padding-top: 6px;
          margin-top: 6px;
        }

        /* Operations Right panel styles */
        .operations-right-panel {
          height: calc(100vh - var(--header-height) - 60px);
          overflow-y: auto;
          padding-right: 8px;
          pointer-events: auto;
        }

        .op-panel-card {
          background: rgba(6, 4, 3, 0.82);
          border-color: rgba(255, 187, 0, 0.12);
        }

        .fade-in-view {
          animation: view-fade 0.35s cubic-bezier(0.1, 0.8, 0.2, 1);
        }

        @keyframes view-fade {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }

        /* Redesigned Storage HUD Visualizer */
        .hud-chart-wrapper {
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 30px;
          align-items: center;
        }

        .hud-radial-viz {
          width: 140px;
          height: 140px;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hud-radial-svg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .spinning-dashed-ring {
          transform-origin: center;
          animation: spin-dashed 40s linear infinite;
        }

        @keyframes spin-dashed {
          100% { transform: rotate(360deg); }
        }

        .hud-center-text {
          text-align: center;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .hud-center-lbl {
          font-size: 8px;
          color: hsl(var(--text-muted));
          letter-spacing: 1.5px;
          line-height: 1;
        }

        .hud-center-val {
          font-size: 20px;
          font-weight: 800;
          line-height: 1.2;
          text-shadow: 0 0 10px rgba(0, 242, 254, 0.5);
          letter-spacing: -0.5px;
        }

        .hud-center-unit {
          font-size: 8px;
          color: hsl(var(--text-muted));
          letter-spacing: 1px;
          line-height: 1;
        }

        .hud-data-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .hud-data-row {
          background: rgba(8, 7, 5, 0.45);
          border: 1px solid rgba(255, 187, 0, 0.04);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .hud-data-row:hover {
          background: rgba(8, 7, 5, 0.75);
          border-color: rgba(255, 187, 0, 0.15);
          transform: translateX(4px);
        }

        .hud-row-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }

        .hud-sector-addr {
          font-size: 10px;
          font-weight: bold;
          opacity: 0.85;
        }

        .hud-sector-name {
          font-weight: bold;
          letter-spacing: 0.5px;
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .hud-sector-percentage {
          font-weight: 800;
        }

        .hud-row-mid {
          width: 100%;
        }

        .hud-bar-container {
          height: 6px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 3px;
          overflow: hidden;
          position: relative;
        }

        .hud-bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.8s cubic-bezier(0.1, 0.8, 0.2, 1);
        }

        .hud-row-bottom {
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: hsl(var(--text-muted));
        }

        .hud-row-metric {
          letter-spacing: 0.5px;
        }

        .hud-row-status {
          font-weight: bold;
          letter-spacing: 1px;
        }

        .empty-sci-chart {
          padding: 20px 0;
          text-align: center;
          font-size: 11px;
          color: hsl(var(--text-dark));
        }

        .section-header-cockpit {
          margin-top: 20px;
          border-bottom: 1px solid rgba(0, 242, 254, 0.12);
          padding-bottom: 6px;
        }

        .section-header-cockpit h3 {
          font-size: 11px;
          letter-spacing: 1px;
          color: hsl(var(--color-cyan));
        }

        .namespaces-vertical-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 14px;
        }

        .ns-card-sci {
          background: rgba(6, 9, 18, 0.5);
          border-color: rgba(0, 242, 254, 0.08);
          padding: 16px;
        }

        .ns-sci-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .ns-sci-icon { font-size: 13px; }
        .ns-sci-name { font-size: 12px; font-weight: 700; color: hsl(var(--text-primary)); }

        .ns-sci-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
        }

        .ns-stat-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
        }
        .ns-stat-row .lbl { color: hsl(var(--text-muted)); }
        .ns-stat-row .val { font-weight: 700; }

        .ns-sci-footer {
          display: flex;
          justify-content: flex-end;
        }

        .ns-sci-action {
          font-size: 10px;
          color: hsl(var(--color-cyan));
          text-decoration: none;
          padding: 4px 10px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .ns-sci-action:hover {
          background: rgba(0, 242, 254, 0.06);
          box-shadow: 0 0 8px rgba(0, 242, 254, 0.15);
        }

        /* Sci Forms styling */
        .sci-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-group-sci {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group-sci label {
          font-size: 11px;
          color: hsl(var(--text-muted));
          font-weight: 500;
        }

        .sci-control-input, .sci-control-select, .sci-control-textarea {
          background: rgba(3, 5, 10, 0.7);
          border: 1px solid rgba(0, 242, 254, 0.15);
          border-radius: 6px;
          padding: 8px 12px;
          color: hsl(var(--text-primary));
          font-family: var(--font-outfit);
          font-size: 12px;
          outline: none;
          transition: all 0.2s ease;
          width: 100%;
        }

        .sci-control-textarea {
          font-family: var(--font-mono);
          resize: vertical;
        }

        .sci-control-input:focus, .sci-control-select:focus, .sci-control-textarea:focus {
          border-color: hsl(var(--color-cyan));
          box-shadow: 0 0 10px rgba(0, 242, 254, 0.1);
        }

        .custom-input-group {
          display: flex;
          gap: 8px;
        }

        .sci-cancel-btn {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: hsl(var(--text-muted));
          border-radius: 6px;
          padding: 0 12px;
          font-size: 11px;
          cursor: pointer;
        }

        .sci-slider {
          width: 100%;
          accent-color: hsl(var(--color-cyan));
          cursor: pointer;
        }

        .sci-submit-btn {
          border: none;
          border-radius: 6px;
          padding: 10px;
          font-family: var(--font-outfit);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          color: hsl(var(--bg-primary));
        }

        .sci-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .bg-cyan {
          background: hsl(var(--color-cyan));
          box-shadow: 0 3px 10px rgba(0, 242, 254, 0.15);
        }
        .bg-cyan:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 5px 15px rgba(0, 242, 254, 0.3);
        }

        .bg-purple {
          background: hsl(var(--color-purple));
          color: white;
          box-shadow: 0 3px 10px rgba(138, 43, 226, 0.15);
        }
        .bg-purple:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 5px 15px rgba(138, 43, 226, 0.3);
        }

        .sci-success-banner {
          font-size: 11px;
          color: hsl(var(--color-cyan));
          text-align: center;
          padding: 6px;
          background: rgba(0, 242, 254, 0.02);
          border-radius: 4px;
          margin-top: 8px;
        }
        .sci-success-banner.purple-color {
          color: #d1a4ff;
          background: rgba(138, 43, 226, 0.02);
        }

        /* Search Results inside Right Panel */
        .search-results-wrapper {
          margin-top: 20px;
        }

        .search-status-banner, .search-error-banner, .search-empty-banner {
          font-size: 12px;
          text-align: center;
          padding: 24px;
          color: hsl(var(--text-muted));
          border: 1px dashed rgba(255, 255, 255, 0.05);
          border-radius: 8px;
        }
        
        .search-error-banner {
          color: #ff5f56;
          border-color: rgba(255, 95, 86, 0.2);
        }

        .search-results-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .results-count-title {
          font-size: 11px;
          color: hsl(var(--text-muted));
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          padding-bottom: 6px;
        }

        .result-item-card {
          background: rgba(3, 5, 10, 0.7);
          border-color: rgba(255, 255, 255, 0.04);
          padding: 12px;
        }

        .result-item-top {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 10px;
        }

        .badge-ns {
          background: rgba(0, 242, 254, 0.08);
          border: 1px solid rgba(0, 242, 254, 0.2);
          color: hsl(var(--color-cyan));
          padding: 1px 6px;
          border-radius: 3px;
        }

        .badge-score {
          font-weight: 700;
        }

        .result-item-body {
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.02);
          border-radius: 4px;
          padding: 10px;
          max-height: 380px;
          overflow: auto;
          margin-bottom: 8px;
        }

        .result-code {
          font-size: 11.5px;
          color: #e2e8f0;
          white-space: pre-wrap;
          word-break: break-all;
          overflow-wrap: break-word;
          line-height: 1.4;
        }

        .result-item-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.02);
          padding-top: 6px;
        }

        .source-lbl {
          color: hsl(var(--text-muted));
          max-width: 250px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .result-delete-btn {
          background: transparent;
          border: 1px solid rgba(255, 95, 86, 0.2);
          color: rgba(255, 95, 86, 0.7);
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
          font-family: var(--font-outfit);
          font-size: 10px;
          transition: all 0.2s ease;
        }
        .result-delete-btn:hover {
          background: rgba(255, 95, 86, 0.06);
          border-color: rgba(255, 95, 86, 0.4);
          color: #ff5f56;
        }

        /* Neon Glow animations & hover focus laser sweeps */
        @keyframes neon-border-cycle {
          0% {
            border-color: rgba(0, 242, 254, 0.12);
            box-shadow: 0 0 10px rgba(0, 242, 254, 0.03);
          }
          50% {
            border-color: rgba(138, 43, 226, 0.22);
            box-shadow: 0 0 16px rgba(138, 43, 226, 0.1);
          }
          100% {
            border-color: rgba(0, 242, 254, 0.12);
            box-shadow: 0 0 10px rgba(0, 242, 254, 0.03);
          }
        }

        @keyframes neon-text-cycle {
          0% {
            color: hsl(var(--color-cyan));
            text-shadow: 0 0 6px rgba(0, 242, 254, 0.5), 0 0 12px rgba(0, 242, 254, 0.2);
          }
          50% {
            color: hsl(var(--color-purple));
            text-shadow: 0 0 6px rgba(138, 43, 226, 0.6), 0 0 12px rgba(138, 43, 226, 0.3);
          }
          100% {
            color: hsl(var(--color-cyan));
            text-shadow: 0 0 6px rgba(0, 242, 254, 0.5), 0 0 12px rgba(0, 242, 254, 0.2);
          }
        }

        .section-header-cockpit h3 {
          font-size: 11.5px;
          letter-spacing: 1.2px;
          animation: neon-text-cycle 6s ease-in-out infinite;
          margin-top: 24px;
        }

        .ns-card-sci, .result-item-card {
          animation: neon-border-cycle 8s ease-in-out infinite;
          transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .ns-card-sci:hover, .result-item-card:hover {
          transform: translateY(-2px);
          border-color: hsl(var(--color-cyan)) !important;
          box-shadow: 0 5px 22px rgba(0, 242, 254, 0.16) !important;
        }

        /* Sci-Fi button layout (laser sweep + corner brackets) */
        .sci-submit-btn, .ns-sci-action, .sub-mode-tab-btn, .copy-prompt-btn, .result-edit-btn, .result-delete-btn {
          position: relative;
          overflow: hidden;
        }

        /* Glowing focus brackets that contract slightly on hover */
        .sci-submit-btn::before, .ns-sci-action::before, .sub-mode-tab-btn::before, .copy-prompt-btn::before, .result-edit-btn::before {
          content: '';
          position: absolute;
          top: -2px; left: -2px; right: -2px; bottom: -2px;
          border: 1px solid transparent;
          border-radius: 6px;
          pointer-events: none;
          transition: all 0.25s cubic-bezier(0.25, 1, 0.5, 1);
          opacity: 0;
          transform: scale(1.06);
        }

        .sci-submit-btn:hover::before, .ns-sci-action:hover::before, .sub-mode-tab-btn:hover::before, .copy-prompt-btn:hover::before, .result-edit-btn:hover::before {
          opacity: 0.9;
          transform: scale(1.0);
          border-color: hsl(var(--color-cyan));
          box-shadow: 0 0 6px rgba(0, 242, 254, 0.4);
        }

        /* Scanning laser line sweep on hover */
        .sci-submit-btn::after, .ns-sci-action::after, .sub-mode-tab-btn::after, .copy-prompt-btn::after, .result-edit-btn::after {
          content: '';
          position: absolute;
          top: -50%;
          left: -60%;
          width: 25%;
          height: 200%;
          background: linear-gradient(to right, transparent, rgba(0, 242, 254, 0.25), transparent);
          transform: rotate(25deg);
          pointer-events: none;
          opacity: 0;
          transition: none;
        }

        .sci-submit-btn:hover::after, .ns-sci-action:hover::after, .sub-mode-tab-btn:hover::after, .copy-prompt-btn:hover::after, .result-edit-btn:hover::after {
          opacity: 1;
          left: 140%;
          transition: left 0.55s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .sub-mode-toggle-bar {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
          border-bottom: 1px solid rgba(255, 187, 0, 0.08);
          padding-bottom: 8px;
        }
        .sub-mode-tab-btn {
          background: transparent;
          border: 1px solid rgba(255, 187, 0, 0.15);
          color: hsl(var(--text-muted));
          border-radius: 6px;
          padding: 6px 16px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .sub-mode-tab-btn:hover {
          color: hsl(var(--text-primary));
          border-color: rgba(0, 242, 254, 0.3);
        }
        .sub-mode-tab-btn.active {
          background: rgba(0, 242, 254, 0.05);
          border-color: hsl(var(--color-cyan)) !important;
          color: hsl(var(--color-cyan));
          box-shadow: 0 0 10px rgba(0, 242, 254, 0.1);
        }
        .copy-prompt-btn {
          background: rgba(0, 242, 254, 0.1);
          border: 1px solid rgba(0, 242, 254, 0.3);
          color: hsl(var(--color-cyan));
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 10px;
        }
        .copy-prompt-btn:hover {
          background: rgba(0, 242, 254, 0.2);
          box-shadow: 0 0 12px rgba(0, 242, 254, 0.3);
        }
        .result-edit-btn {
          background: transparent;
          border: 1px solid rgba(0, 242, 254, 0.2);
          color: rgba(0, 242, 254, 0.7);
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
          font-family: var(--font-outfit);
          font-size: 10px;
          transition: all 0.2s ease;
          margin-right: 6px;
        }
        .result-edit-btn:hover {
          background: rgba(0, 242, 254, 0.06);
          border-color: rgba(0, 242, 254, 0.4);
          color: hsl(var(--color-cyan));
        }

        /* Cyber HUD Cards styles (transparent when unselected) */
        .cyber-hud-card {
          position: relative;
          background: rgba(6, 4, 3, 0.03); /* Transparent background */
          border: 1px solid rgba(255, 187, 0, 0.05);
          border-radius: 4px;
          padding: 16px;
          opacity: 0.42; /* Dimmed and transparent by default */
          transition: all 0.35s cubic-bezier(0.25, 1, 0.5, 1);
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: inset 0 0 10px rgba(255, 187, 0, 0.01);
          overflow: hidden;
        }

        .cyber-hud-card:hover, .cyber-hud-card.selected {
          opacity: 1.0; /* Full opacity on hover or selection */
          background: rgba(8, 7, 5, 0.85); /* Backing panel becomes visible */
          border-color: hsl(var(--color-cyan));
          box-shadow: 
            0 8px 30px rgba(0, 242, 254, 0.14), 
            inset 0 0 12px rgba(0, 242, 254, 0.05);
          transform: translateY(-2px);
        }

        .cyber-hud-card.selected {
          border-color: hsl(var(--color-purple));
          box-shadow: 
            0 8px 30px rgba(255, 102, 0, 0.14), 
            inset 0 0 12px rgba(255, 102, 0, 0.05);
        }

        /* L-brackets on cyber hud cards (only glowing on hover/selected) */
        .hud-corner-bracket {
          position: absolute;
          width: 7px;
          height: 7px;
          border: 1.5px solid hsl(var(--color-cyan));
          pointer-events: none;
          opacity: 0;
          transform: scale(1.15);
          transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .cyber-hud-card:hover .hud-corner-bracket, .cyber-hud-card.selected .hud-corner-bracket {
          opacity: 0.85;
          transform: scale(1.0);
        }

        .cyber-hud-card.selected .hud-corner-bracket {
          border-color: hsl(var(--color-purple));
        }

        .hud-corner-bracket.tl { top: 4px; left: 4px; border-right: none; border-bottom: none; }
        .hud-corner-bracket.tr { top: 4px; right: 4px; border-left: none; border-bottom: none; }
        .hud-corner-bracket.bl { bottom: 4px; left: 4px; border-right: none; border-top: none; }
        .hud-corner-bracket.br { bottom: 4px; right: 4px; border-left: none; border-top: none; }

        /* Telemetry card components */
        .hud-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px dashed rgba(255, 187, 0, 0.08);
          padding-bottom: 6px;
        }

        .hud-card-title-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .hud-tech-addr {
          font-size: 9px;
          color: hsl(var(--color-cyan));
          font-weight: bold;
          letter-spacing: 0.5px;
        }

        .hud-tech-title {
          font-size: 13px;
          font-weight: bold;
          color: #fff;
          letter-spacing: 0.5px;
        }

        .hud-status-badge {
          font-size: 8px;
          padding: 1px 5px;
          border-radius: 2px;
          font-weight: bold;
          letter-spacing: 0.5px;
        }

        .hud-status-badge.active-neon {
          background: rgba(0, 242, 254, 0.06);
          border: 1px solid rgba(0, 242, 254, 0.2);
          color: hsl(var(--color-cyan));
          text-shadow: 0 0 5px rgba(0, 242, 254, 0.4);
        }

        .cyber-hud-card.selected .hud-status-badge.active-neon {
          background: rgba(255, 102, 0, 0.06);
          border-color: rgba(255, 102, 0, 0.2);
          color: hsl(var(--color-purple));
          text-shadow: 0 0 5px rgba(255, 102, 0, 0.4);
        }

        .hud-card-body {
          display: grid;
          grid-template-columns: 75px 1fr;
          gap: 14px;
          align-items: center;
        }

        .hud-visual-column {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-right: 1px solid rgba(255, 187, 0, 0.08);
          padding-right: 12px;
          gap: 4px;
        }

        .hud-matrix-dots {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 3px;
        }

        .hud-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.03);
          transition: all 0.3s ease;
        }

        .hud-dot.glow-cyan {
          background: hsl(var(--color-cyan));
          box-shadow: 0 0 5px hsl(var(--color-cyan));
        }

        .cyber-hud-card.selected .hud-dot.glow-cyan {
          background: hsl(var(--color-purple));
          box-shadow: 0 0 5px hsl(var(--color-purple));
        }

        .hud-dot.dark-dot {
          background: rgba(255, 255, 255, 0.01);
        }

        .hud-matrix-percentage {
          font-size: 11px;
          font-weight: bold;
          color: #e2e8f0;
        }

        .hud-specs-column {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .hud-spec-item {
          display: flex;
          justify-content: space-between;
          font-size: 9.5px;
        }

        .hud-spec-item .spec-lbl {
          color: hsl(var(--text-muted));
        }

        .hud-spec-item .spec-val {
          font-weight: bold;
        }

        .hud-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid rgba(255, 255, 255, 0.02);
          padding-top: 8px;
        }

        .hud-metric-readout {
          font-size: 8px;
          color: hsl(var(--text-muted));
        }

        .hud-action-btn {
          background: transparent;
          border: 1px solid rgba(0, 242, 254, 0.15);
          color: hsl(var(--color-cyan));
          font-size: 9px;
          padding: 3px 8px;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .hud-action-btn:hover {
          background: rgba(0, 242, 254, 0.08);
          border-color: hsl(var(--color-cyan));
          box-shadow: 0 0 8px rgba(0, 242, 254, 0.25);
        }

        .cyber-hud-card.selected .hud-action-btn {
          border-color: rgba(255, 102, 0, 0.2);
          color: hsl(var(--color-purple));
        }

        .cyber-hud-card.selected .hud-action-btn:hover {
          background: rgba(255, 102, 0, 0.08);
          border-color: hsl(var(--color-purple));
          box-shadow: 0 0 8px rgba(255, 102, 0, 0.25);
        }

        @media (max-width: 1024px) {
          .cockpit-layout-grid {
            position: relative;
            display: flex;
            flex-direction: column;
            height: auto;
          }
          .system-left-panel, .avatar-center-panel, .operations-right-panel {
            position: relative;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
          }
          .operations-right-panel {
            position: relative;
            top: 0;
            height: auto;
          }
          .hologram-overlay-wing {
            display: none;
          }
        }

        /* Dynamic Tab Layout Sub-Grids */
        .search-tab-layout {
          display: grid;
          grid-template-columns: 400px minmax(0, 1fr);
          gap: 24px;
          align-items: start;
          height: 100%;
        }

        .search-left-form {
          position: sticky;
          top: 0;
        }

        .search-right-results {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .ingest-tab-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 24px;
          align-items: start;
        }

        /* Memory Layers Tab styling */
        .memory-tab-layout {
          height: 100%;
        }

        .memory-grid-container {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
          gap: 24px;
          align-items: start;
        }

        .memory-col-left, .memory-col-right {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* Short Term memory layout */
        .short-term-panel {
          display: flex;
          flex-direction: column;
        }

        .chat-log-list {
          display: flex;
          flex-direction: column;
          background: rgba(3, 5, 10, 0.45);
          border: 1px solid rgba(0, 242, 254, 0.08);
          border-radius: 8px;
          padding: 16px;
        }

        .chat-bubbles-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 480px;
          overflow-y: auto;
          padding-right: 6px;
        }

        .chat-bubble-row {
          display: flex;
          width: 100%;
        }

        .chat-bubble-row.user-align {
          justify-content: flex-end;
        }

        .chat-bubble-row.agent-align {
          justify-content: flex-start;
        }

        .chat-bubble {
          max-width: 85%;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 11.5px;
          line-height: 1.5;
          position: relative;
        }

        .bubble-delete-btn {
          position: absolute;
          top: 6px;
          right: 8px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.3);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          line-height: 1;
          padding: 2px;
          opacity: 0.6;
        }

        .bubble-delete-btn:hover {
          color: #ff5f56;
          opacity: 1;
          text-shadow: 0 0 5px rgba(255, 95, 86, 0.5);
        }

        .user-bubble {
          background: rgba(0, 242, 254, 0.04);
          border: 1px solid rgba(0, 242, 254, 0.2);
          color: #e2e8f0;
          border-top-right-radius: 1px;
          box-shadow: 0 0 10px rgba(0, 242, 254, 0.03);
        }

        .agent-bubble {
          background: rgba(138, 43, 226, 0.04);
          border: 1px solid rgba(138, 43, 226, 0.2);
          color: #f8fafc;
          border-top-left-radius: 1px;
          box-shadow: 0 0 10px rgba(138, 43, 226, 0.03);
        }

        .bubble-role {
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
          opacity: 0.8;
        }

        .user-bubble .bubble-role {
          color: hsl(var(--color-cyan));
        }

        .agent-bubble .bubble-role {
          color: #d1a4ff;
        }

        .bubble-content {
          white-space: pre-wrap;
          word-break: break-all;
        }

        /* Working Memory Panel */
        .working-mem-panel {
          display: flex;
          flex-direction: column;
        }

        .working-table {
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(138, 43, 226, 0.1);
          border-radius: 6px;
          background: rgba(3, 5, 10, 0.45);
          overflow: hidden;
        }

        .working-table-header {
          display: grid;
          grid-template-columns: 100px 1fr 100px;
          gap: 12px;
          background: rgba(138, 43, 226, 0.06);
          border-bottom: 1px solid rgba(138, 43, 226, 0.15);
          padding: 8px 12px;
          font-size: 10px;
          font-weight: 800;
          color: #d1a4ff;
          letter-spacing: 0.5px;
          align-items: center;
        }

        .clear-all-wm-btn {
          background: transparent;
          border: 1px solid rgba(255, 95, 86, 0.25);
          color: #ff5f56;
          border-radius: 3px;
          font-size: 9px;
          padding: 2px 6px;
          cursor: pointer;
          font-family: var(--font-mono);
          transition: all 0.2s ease;
          justify-self: end;
        }

        .clear-all-wm-btn:hover {
          background: rgba(255, 95, 86, 0.08);
          border-color: #ff5f56;
        }

        .working-table-row {
          display: grid;
          grid-template-columns: 100px 1fr 100px;
          gap: 12px;
          padding: 8px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.02);
          font-size: 11px;
          align-items: center;
        }

        .working-table-row:last-child {
          border-bottom: none;
        }

        .wm-row-key {
          font-weight: bold;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .wm-row-val {
          color: #e2e8f0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .wm-row-actions {
          display: flex;
          gap: 6px;
          justify-content: flex-end;
        }

        .wm-edit-btn-inline, .wm-del-btn-inline {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: hsl(var(--text-muted));
          border-radius: 3px;
          font-size: 9px;
          padding: 2px 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: var(--font-mono);
        }

        .wm-edit-btn-inline:hover {
          border-color: rgba(138, 43, 226, 0.35);
          color: #d1a4ff;
          background: rgba(138, 43, 226, 0.04);
        }

        .wm-del-btn-inline:hover {
          border-color: rgba(255, 95, 86, 0.35);
          color: #ff5f56;
          background: rgba(255, 95, 86, 0.04);
        }

        .wm-save-btn, .wm-cancel-btn {
          border: none;
          font-size: 9px;
          padding: 2px 6px;
          border-radius: 3px;
          cursor: pointer;
          font-family: var(--font-mono);
        }

        .wm-save-btn {
          background: hsl(var(--color-green));
          color: hsl(var(--bg-primary));
        }

        .wm-cancel-btn {
          background: rgba(255, 255, 255, 0.08);
          color: hsl(var(--text-muted));
        }

        /* Consolidation Panel */
        .consolidation-panel {
          display: flex;
          flex-direction: column;
        }

        /* Tutorial / User Manual styling */
        .manual-header-sci {
          position: relative;
          padding: 8px 0;
          font-family: var(--font-mono);
        }
        
        .manual-header-sci .decor-bar {
          height: 2px;
          background: linear-gradient(90deg, hsl(var(--color-cyan)), transparent);
          margin-bottom: 12px;
        }

        .manual-header-sci .title-text {
          font-size: 14px;
          color: hsl(var(--color-cyan));
          font-weight: bold;
          margin-bottom: 8px;
        }

        .manual-header-sci .sub-desc {
          font-size: 11px;
          color: hsl(var(--text-muted));
          line-height: 1.6;
        }

        .sci-mini-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          text-align: left;
        }

        .sci-mini-table th, .sci-mini-table td {
          padding: 8px 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }

        .sci-mini-table th {
          color: hsl(var(--text-muted));
          font-weight: bold;
          font-size: 9px;
          text-transform: uppercase;
        }

        .sci-mini-table td {
          color: hsl(var(--text-primary));
        }

        .sci-note-text {
          font-size: 10px;
          color: hsl(var(--color-purple));
          line-height: 1.5;
          padding: 8px;
          background: rgba(168, 85, 247, 0.05);
          border-left: 2px solid hsl(var(--color-purple));
          border-radius: 2px;
        }

        .workflow-link-item {
          display: flex;
          gap: 10px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 187, 0, 0.08);
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .workflow-link-item:hover {
          border-color: hsl(var(--color-cyan));
          background: rgba(0, 242, 254, 0.03);
        }

        .workflow-link-item .bullet {
          color: hsl(var(--color-cyan));
          font-size: 12px;
        }

        .workflow-link-item .wf-body {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .workflow-link-item .wf-body .title {
          font-size: 11px;
          font-weight: bold;
        }

        .workflow-link-item .wf-body .desc {
          font-size: 9px;
          color: hsl(var(--text-muted));
        }

        .manual-section {
          padding: 10px 0 16px;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.06);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .manual-section h3 {
          font-size: 12px;
          font-weight: bold;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .manual-section p {
          font-size: 11px;
          color: hsl(var(--text-primary));
          margin: 0;
          line-height: 1.5;
        }

        .manual-section ul {
          margin: 0;
          padding-left: 18px;
          font-size: 11px;
          color: hsl(var(--text-muted));
          display: flex;
          flex-direction: column;
          gap: 6px;
          line-height: 1.5;
        }

        .manual-section ul li strong {
          color: hsl(var(--text-primary));
        }
      `}</style>
    </div>
  );
}
