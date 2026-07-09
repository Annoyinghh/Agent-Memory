'use client';

/**
 * GalaxyView — CBM 风格代码知识图谱「星系」可视化。
 *
 * 设计原则(对照旧 KnowledgeGraph 的「定位不到/一团乱」):
 *  - 社区 = 星系:每个 community_id 用向日葵螺旋在中心周围落位,盘半径 ∝ √节点数。
 *  - 恒星 = 枢纽:每个社区度数最高的节点放大、加发光、带名字 Sprite 标签。
 *  - 普通节点 = 单个 THREE.Points 云(一次绘制,按社区着色),非几百个 Sphere。
 *  - 边 = 静态 LineSegments(确定性布局 → 几何只建一次,不再每帧 find+更新)。
 *  - 框选修复:加载/重置时算包围球,自动把相机推到「正好框住全部」的距离+居中。
 *  - 公转默认关(旧版默认开,点根本抓不住);只整体慢转一个 group.rotation.y。
 *  - 度数客户端算(O(E)),无需后端改动。
 *
 * 布局完全确定性(seeded 抖动),刷新后同一节点仍在同一坐标 → 「定位得到」。
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import GlassCard from './GlassCard';

// ── 配色 ── 社区调色板(按 id 取模,稳定)
const COMMUNITY_PALETTE = [
  0x00f2fe, 0xff6600, 0xffaa00, 0x8a2be2, 0x4ade80,
  0xff4081, 0x00e676, 0x7c4dff, 0xffeb3b, 0x18ffff,
  0xff5722, 0x3d5afe, 0xe91e63, 0x00bfa5, 0xffd600,
];
const RELATION_PALETTE = {
  contains: 0xff6600, calls: 0x00f2fe, method: 0xffaa00,
  imports: 0x4ade80, imports_from: 0x4ade80, inherits: 0xff4081,
  references: 0xffeb3b, uses: 0x7c4dff, rationale_for: 0xff5722,
  related_to: 0xcccccc,
};
const communityColor = (cid) => COMMUNITY_PALETTE[((cid % COMMUNITY_PALETTE.length) + COMMUNITY_PALETTE.length) % COMMUNITY_PALETTE.length];
const relationColor = (rel) => (RELATION_PALETTE[rel] ?? 0x18ffff);

// ── 工具 ──
// 提取节点可读名(content 形如 "label: foo\ntype: function\n...")
const nodeLabel = (node) => {
  const c = node?.content || '';
  const m = c.match(/^label:\s*(.+)$/m);
  if (m) return m[1].trim();
  return c.split('\n')[0].slice(0, 40) || node?.id?.slice(0, 8) || '?';
};
// 确定性伪随机(seeded)→ 布局可复现,刷新后节点位置不变
const seededRand = (seed) => {
  let t = (seed + 0x6d2b79f5) >>> 0;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const GOLDEN = 2.39996323; // 黄金角(弧度)
const GALAXY_SPACING = 42; // 星系间距
const DISK_MIN = 4, DISK_MAX = 18;

// 圆形辉光贴图(给 Points/恒星)
const makeGlowTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
};
// 文字 Sprite 标签贴图
const makeLabelTexture = (text, color = '#ffe9b0') => {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 6;
  ctx.fillStyle = color;
  // 截断
  let t = text.length > 22 ? text.slice(0, 21) + '…' : text;
  ctx.fillText(t, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
};

export default function GalaxyView() {
  const mountRef = useRef(null);
  const { activeNamespace, refreshData, setLastEvent } = useApp();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [search, setSearch] = useState('');
  const [spinOn, setSpinOn] = useState(false);
  const [highlightedCommunity, setHighlightedCommunity] = useState(null); // cid 或 null
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [nodeDetail, setNodeDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [communities, setCommunities] = useState([]); // [{cid, count, color}]
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });

  // 提取 / 清空(从旧组件精简移植)
  const [showExtract, setShowExtract] = useState(false);
  const [extractPath, setExtractPath] = useState('');
  const [extractNs, setExtractNs] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState('');

  // Three refs
  const sceneRef = useRef(null), cameraRef = useRef(null), controlsRef = useRef(null), rendererRef = useRef(null);
  const rafRef = useRef(null), raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2(-10, -10));
  const galaxyGroupRef = useRef(null);     // 整体旋转的 group
  const pointsRef = useRef(null);          // Points 云(普通节点)
  const hubsRef = useRef([]);              // 恒星 mesh 数组
  const labelsRef = useRef([]);            // 标签 sprite 数组(与 hubs 同序)
  const edgesRef = useRef(null);           // LineSegments
  const starfieldRef = useRef(null);
  const glowTexRef = useRef(null);
  const idToIdxRef = useRef({});           // node.id → 在 nodes 数组中的下标
  const nodesRef = useRef([]);             // 原始 nodes
  const baseColorsRef = useRef(null);      // Float32Array 普通节点基础色(用于搜索/高亮重置)
  const pointSizesRef = useRef(null);
  const hoveredIdxRef = useRef(-1);
  const frameDataRef = useRef({ fitDone: false });
  const camAnimRef = useRef(null);         // {fromPos, toPos, fromTarget, toTarget, t}
  const disposablesRef = useRef([]);       // 卸载时释放

  // ── 拉取数据 + 建图 ──
  const build = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getGalaxyGraph(activeNamespace, 600);
      const nodes = res.nodes || [];
      const edges = res.edges || [];
      nodesRef.current = nodes;
      setStats({ nodes: nodes.length, edges: edges.length });
      layoutAndRender(nodes, edges);
    } catch (e) {
      console.error('[GalaxyView] build failed', e);
      setError('无法载入星系图谱,请检查 API 服务。');
    } finally {
      setLoading(false);
    }
  }, [activeNamespace]);

  // 核心:确定性布局 + 渲染
  const layoutAndRender = (nodes, edges) => {
    const group = galaxyGroupRef.current;
    if (!group) return;
    // 清空旧
    while (group.children.length) {
      const o = group.children[0];
      group.remove(o);
      o.geometry?.dispose?.(); o.material?.dispose?.();
      if (o.material?.map) o.material.map.dispose();
    }
    hubsRef.current = []; labelsRef.current = [];
    pointsRef.current = null; edgesRef.current = null;

    if (!nodes.length) return;

    // 1. 度数(客户端,O(E))
    const degree = {};
    for (let i = 0; i < nodes.length; i++) degree[nodes[i].id] = 0;
    for (const e of edges) {
      if (degree[e.source] !== undefined) degree[e.source]++;
      if (degree[e.target] !== undefined) degree[e.target]++;
    }
    idToIdxRef.current = {};
    nodes.forEach((n, i) => { idToIdxRef.current[n.id] = i; });

    // 2. 按社区分组(null → -1 孤立项)
    const groups = new Map();
    nodes.forEach((n) => {
      const cid = n.community_id != null ? n.community_id : -1;
      if (!groups.has(cid)) groups.set(cid, []);
      groups.get(cid).push(n);
    });
    // 社区按规模降序排(大的靠近/先排),孤立项(-1)最后
    const sortedCids = [...groups.keys()].sort((a, b) => {
      if (a === -1) return 1; if (b === -1) return -1;
      return groups.get(b).length - groups.get(a).length;
    });

    // 社区元信息(给图例)
    const commMeta = [];
    const cidToCenter = new Map();      // cid → THREE.Vector3 中心
    const cidToOrder = new Map();       // cid → sunflower 序号
    sortedCids.forEach((cid, order) => cidToOrder.set(cid, order));

    // 3. 计算每个星系中心(向日葵)
    sortedCids.forEach((cid) => {
      const order = cidToOrder.get(cid);
      if (cid === -1) {
        cidToCenter.set(cid, new THREE.Vector3(0, 0, 0)); // 孤立环中心=原点外圈,稍后单独处理
        commMeta.push({ cid, count: groups.get(cid).length, color: 0x666666 });
        return;
      }
      const angle = order * GOLDEN;
      const radius = GALAXY_SPACING * Math.sqrt(order + 1);
      cidToCenter.set(cid, new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      commMeta.push({ cid, count: groups.get(cid).length, color: communityColor(cid) });
    });
    commMeta.sort((a, b) => b.count - a.count);
    setCommunities(commMeta.filter((c) => c.cid !== -1));

    // 4. 每个节点的最终位置 + hub 判定
    const positions = new Float32Array(nodes.length * 3);
    const colors = new Float32Array(nodes.length * 3);
    const hubIdx = new Set();

    // 孤立项外圈半径:所有星系中最远中心 + margin
    let maxCenterR = 0;
    cidToCenter.forEach((c) => { const r = Math.hypot(c.x, c.z); if (r > maxCenterR) maxCenterR = r; });
    const beltRadius = maxCenterR + 28;

    let isolateIdx = 0;
    nodes.forEach((node, i) => {
      const cid = node.community_id != null ? node.community_id : -1;
      const deg = degree[node.id] || 0;
      const c = cidToCenter.get(cid) || new THREE.Vector3();
      const col = new THREE.Color(cid === -1 ? 0x666666 : communityColor(cid));
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;

      if (cid === -1) {
        // 孤立小行星带:均匀大环 + seeded 抖动
        const rng = seededRand(i * 7 + 13);
        const a = (isolateIdx / Math.max(1, groups.get(-1).length)) * Math.PI * 2 + rng() * 0.3;
        const r = beltRadius + rng() * 14;
        isolateIdx++;
        positions[i * 3] = Math.cos(a) * r;
        positions[i * 3 + 1] = (rng() - 0.5) * 6;
        positions[i * 3 + 2] = Math.sin(a) * r;
        return;
      }

      const members = groups.get(cid);
      const diskR = Math.min(DISK_MAX, Math.max(DISK_MIN, 4 + Math.sqrt(members.length) * 1.4));
      // 该社区内度数最高者 = 恒星(中心);其余向日葵填充
      let maxDeg = -1, maxId = null;
      for (const m of members) { const d = degree[m.id] || 0; if (d > maxDeg) { maxDeg = d; maxId = m.id; } }
      const isHub = node.id === maxId;

      if (isHub) {
        hubIdx.add(i);
        positions[i * 3] = c.x;
        positions[i * 3 + 1] = c.y;
        positions[i * 3 + 2] = c.z;
      } else {
        // 社区内原顺序下标(稳定)→ 向日葵填充星系盘
        const localIdx = members.indexOf(node);
        const fill = localIdx / Math.max(1, members.length);
        const r = diskR * Math.sqrt(fill);
        const theta = localIdx * GOLDEN;
        const rng = seededRand(i * 31 + cid + 7);
        positions[i * 3] = c.x + Math.cos(theta) * r;
        positions[i * 3 + 1] = (rng() - 0.5) * diskR * 0.25;
        positions[i * 3 + 2] = c.z + Math.sin(theta) * r;
      }
    });

    // 5. 普通节点 Points 云
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const pMat = new THREE.PointsMaterial({
      size: 1.1, sizeAttenuation: true, vertexColors: true,
      map: glowTexRef.current, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(pGeo, pMat);
    group.add(points);
    pointsRef.current = points;
    baseColorsRef.current = colors;

    // 6. 恒星 mesh + 标签
    const starGeo = new THREE.SphereGeometry(1, 16, 16); // 共享,缩放靠 mesh.scale
    hubsRef.current = [];
    nodes.forEach((node, i) => {
      if (!hubIdx.has(i)) return;
      const cid = node.community_id != null ? node.community_id : -1;
      const col = communityColor(cid);
      const deg = degree[node.id] || 1;
      const size = Math.min(3.2, 1.0 + Math.sqrt(deg) * 0.55);
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95 });
      const mesh = new THREE.Mesh(starGeo, mat);
      mesh.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      mesh.scale.setScalar(size);
      mesh.userData = { node, idx: i, isHub: true };
      group.add(mesh);
      hubsRef.current.push(mesh);

      // 标签 Sprite
      const ltex = makeLabelTexture(nodeLabel(node));
      const lmat = new THREE.SpriteMaterial({ map: ltex, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(lmat);
      sprite.position.copy(mesh.position);
      const scl = Math.max(5, size * 3.2);
      sprite.scale.set(scl * 4, scl, 1);
      sprite.userData = { node, idx: i };
      group.add(sprite);
      labelsRef.current.push(sprite);
    });

    // 7. 边 LineSegments(静态:确定性布局 → 一次建好,每帧不动)
    const edgePos = [];
    const edgeCol = [];
    for (const e of edges) {
      const si = idToIdxRef.current[e.source];
      const ti = idToIdxRef.current[e.target];
      if (si === undefined || ti === undefined) continue;
      edgePos.push(
        positions[si * 3], positions[si * 3 + 1], positions[si * 3 + 2],
        positions[ti * 3], positions[ti * 3 + 1], positions[ti * 3 + 2]
      );
      const cc = new THREE.Color(relationColor(e.relation));
      edgeCol.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b);
    }
    if (edgePos.length) {
      const eGeo = new THREE.BufferGeometry();
      eGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
      eGeo.setAttribute('color', new THREE.Float32BufferAttribute(edgeCol, 3));
      const eMat = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const seg = new THREE.LineSegments(eGeo, eMat);
      group.add(seg);
      edgesRef.current = seg;
    }

    // 8. 自动框选(修「定位不到/缩放坏」)——下次 animate tick 执行
    frameDataRef.current.fitDone = false;
  };

  // 计算并施加包围球框选
  const fitView = useCallback((animate = false) => {
    const group = galaxyGroupRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!group || !camera || !controls) return;
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fov = camera.fov * Math.PI / 180;
    const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.5;
    const toPos = new THREE.Vector3(center.x, center.y + dist * 0.35, center.z + dist);
    camera.near = Math.max(0.1, dist / 200);
    camera.far = dist * 200;
    camera.updateProjectionMatrix();
    if (animate) {
      camAnimRef.current = {
        fromPos: camera.position.clone(), toPos,
        fromTarget: controls.target.clone(), toTarget: center.clone(), t: 0,
      };
    } else {
      camera.position.copy(toPos);
      controls.target.copy(center);
      controls.update();
    }
  }, []);

  // ── 初始化 Three 场景(仅一次) ──
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    let width = container.clientWidth || 800;
    let height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030201, 0.0035);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 50000);
    camera.position.set(0, 80, 160);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 2; controls.maxDistance = 20000;
    controlsRef.current = controls;

    // 灯光(恒星用 MeshBasicMaterial 不需要,留一点环境光给可选的 phong)
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // 星空背景
    const glow = makeGlowTexture();
    glowTexRef.current = glow;
    const starCount = 1600;
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const r = 400 + Math.random() * 1600;
      sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      sp[i * 3 + 2] = r * Math.cos(ph);
    }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const sm = new THREE.PointsMaterial({
      size: 1.4, map: glow, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0x886622,
    });
    const starfield = new THREE.Points(sg, sm);
    scene.add(starfield);
    starfieldRef.current = starfield;

    // 旋转容器
    const group = new THREE.Group();
    scene.add(group);
    galaxyGroupRef.current = group;

    raycasterRef.current.params.Points.threshold = 1.4;

    // 交互
    const onMove = (ev) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      // tooltip 跟随
      if (tooltipRef.current) {
        tooltipRef.current.style.left = `${ev.clientX + 14}px`;
        tooltipRef.current.style.top = `${ev.clientY + 14}px`;
      }
    };
    let downPos = null;
    const onDown = (ev) => { downPos = { x: ev.clientX, y: ev.clientY }; };
    const onUp = (ev) => {
      if (!downPos) return;
      const moved = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y);
      downPos = null;
      if (moved > 4) return; // 拖动不算点击
      handleClick();
    };
    const onDbl = () => { fitView(true); setHighlightedCommunity(null); };
    renderer.domElement.addEventListener('mousemove', onMove);
    renderer.domElement.addEventListener('mousedown', onDown);
    renderer.domElement.addEventListener('mouseup', onUp);
    renderer.domElement.addEventListener('dblclick', onDbl);

    // resize
    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    // 动画循环
    const animate = (time) => {
      rafRef.current = requestAnimationFrame(animate);
      const dt = (time - (animate._last || time)) * 0.001;
      animate._last = time;

      // 整体慢转
      if (spinOnRef.current && group) group.rotation.y += dt * 0.04;

      // 首帧自动框选
      if (!frameDataRef.current.fitDone && group && group.children.length) {
        frameDataRef.current.fitDone = true;
        fitView(false);
      }

      // 相机过渡动画
      if (camAnimRef.current) {
        const a = camAnimRef.current;
        a.t = Math.min(1, a.t + dt * 1.6);
        const e = 1 - Math.pow(1 - a.t, 3); // easeOutCubic
        camera.position.lerpVectors(a.fromPos, a.toPos, e);
        controls.target.lerpVectors(a.fromTarget, a.toTarget, e);
        if (a.t >= 1) camAnimRef.current = null;
      }

      controls.update();

      // hover picking(合并 Points + 恒星 mesh)
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      let hitNode = null, hitIdx = -1;
      if (pointsRef.current) {
        const ints = raycasterRef.current.intersectObject(pointsRef.current);
        if (ints.length) { hitIdx = ints[0].index; }
      }
      if (hitIdx < 0 && hubsRef.current.length) {
        const ints = raycasterRef.current.intersectObjects(hubsRef.current);
        if (ints.length) { hitIdx = ints[0].object.userData.idx; }
      }
      if (hitIdx >= 0) {
        hitNode = nodesRef.current[hitIdx];
        renderer.domElement.style.cursor = 'pointer';
      } else {
        renderer.domElement.style.cursor = 'default';
      }
      if (hitNode?.id !== (hoveredNodeRef.current?.id)) {
        hoveredNodeRef.current = hitNode;
        setHoveredNode(hitNode);
      }

      // 搜索/社区高亮不在此热循环里做(避免每帧重传颜色缓冲),
      // 改由下方响应式 effect 在 search/highlightedCommunity 变化时一次性重写。

      renderer.render(scene, camera);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      renderer.domElement.removeEventListener('mousemove', onMove);
      renderer.domElement.removeEventListener('mousedown', onDown);
      renderer.domElement.removeEventListener('mouseup', onUp);
      renderer.domElement.removeEventListener('dblclick', onDbl);
      // 释放
      group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); if (o.material?.map) o.material.map.dispose(); });
      sg.dispose(); sm.dispose(); glow.dispose();
      renderer.dispose();
      try { container.removeChild(renderer.domElement); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同步 ref 的最新值给 animate 闭包
  const spinOnRef = useRef(spinOn); spinOnRef.current = spinOn;
  const searchRef = useRef(search); searchRef.current = search;
  const highlightedCommunityRef = useRef(highlightedCommunity); highlightedCommunityRef.current = highlightedCommunity;
  const hoveredNodeRef = useRef(hoveredNode); hoveredNodeRef.current = hoveredNode;
  const tooltipRef = useRef(null);

  // 点击:选中节点并飞过去;点空白 → 取消
  const handleClick = () => {
    const hn = hoveredNodeRef.current;
    if (hn) {
      setSelectedNode(hn);
      // 飞到节点
      const idx = idToIdxRef.current[hn.id];
      if (idx !== undefined && pointsRef.current) {
        const pos = new THREE.Vector3().fromBufferAttribute(pointsRef.current.geometry.attributes.position, idx);
        // 恒星位置取自 mesh
        const hub = hubsRef.current.find((m) => m.userData.idx === idx);
        const target = hub ? hub.position : pos;
        const camera = cameraRef.current, controls = controlsRef.current;
        if (camera && controls) {
          const offset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(18);
          camAnimRef.current = {
            fromPos: camera.position.clone(), toPos: target.clone().add(offset),
            fromTarget: controls.target.clone(), toTarget: target.clone(), t: 0,
          };
        }
      }
    } else {
      setSelectedNode(null);
    }
  };

  // 数据变化 → 重建
  useEffect(() => { build(); }, [build]);

  // 搜索 / 社区高亮:仅在 search 或 highlightedCommunity 变化时一次性重写颜色
  useEffect(() => {
    const points = pointsRef.current;
    const base = baseColorsRef.current;
    if (!points || !base) return;
    const colAttr = points.geometry.attributes.color;
    const nodes = nodesRef.current;
    const q = search.trim().toLowerCase();
    const hc = highlightedCommunity;
    const active = !!(q || hc !== null);
    for (let i = 0; i < nodes.length; i++) {
      let r = base[i * 3], g = base[i * 3 + 1], b = base[i * 3 + 2];
      if (active) {
        const node = nodes[i];
        const matchQ = !!q && (nodeLabel(node).toLowerCase().includes(q) || (node.content || '').toLowerCase().includes(q));
        const matchC = hc !== null && node.community_id === hc;
        if (!(matchQ || matchC)) { r *= 0.16; g *= 0.16; b *= 0.16; }
        else if (matchQ) { r = Math.min(1, r + 0.4); g = Math.min(1, g + 0.4); b = Math.min(1, b + 0.4); }
      }
      colAttr.array[i * 3] = r; colAttr.array[i * 3 + 1] = g; colAttr.array[i * 3 + 2] = b;
    }
    colAttr.needsUpdate = true;
  }, [search, highlightedCommunity, stats.nodes]);

  // 选中节点 → 拉邻居
  useEffect(() => {
    if (!selectedNode?.id) { setNodeDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    api.getNodeDetail(selectedNode.id).then((d) => { if (!cancelled) setNodeDetail(d); })
      .catch((e) => console.error('[GalaxyView] node detail', e))
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedNode?.id]);

  // 提取代码库(精简移植)
  const pollTask = async (taskId, onMsg, onDone, onFail) => {
    let n = 0;
    const tick = async () => {
      try {
        const s = await api.getTaskStatus(taskId);
        onMsg(s.message || s.stage || '');
        if (s.status === 'completed') return onDone(s.result || {});
        if (s.status === 'failed') return onFail(s.error || '未知错误');
        if (++n < 1200) setTimeout(tick, 1000);
        else onFail('超时');
      } catch (e) { if (++n < 1200) setTimeout(tick, 2000); else onFail('无法获取进度'); }
    };
    tick();
  };
  const handleExtract = async () => {
    if (!extractPath.trim()) return;
    let ns = extractNs.trim() || extractPath.trim().split(/[/\\]/).filter(Boolean).pop() || 'default';
    if (ns === 'all') { alert('命名空间不能用 all'); return; }
    setExtracting(true); setExtractMsg('提交任务...');
    try {
      const r = await api.extractCodebase(extractPath.trim(), ns, { incremental: true });
      await pollTask(r.task_id, setExtractMsg, async (res) => {
        setLastEvent({ type: 'insert', namespace: ns, message: `提取完成:${res.nodes_imported || 0} 节点` });
        await refreshData();
        setShowExtract(false); setExtractPath(''); setExtractNs(''); setExtractMsg('');
      }, (err) => { alert('提取失败:' + err); setExtractMsg(''); });
    } catch (e) { alert('提交失败:' + (e.message || e)); }
    finally { setExtracting(false); }
  };
  const handleClear = async () => {
    if (activeNamespace === 'all') { alert('请先选具体命名空间'); return; }
    if (!confirm(`确定清空「${activeNamespace}」全部图谱?不可逆!`)) return;
    try {
      const r = await api.clearGraph(activeNamespace);
      setLastEvent({ type: 'delete', namespace: activeNamespace, message: `已清空 ${r.deleted_count || 0} 节点` });
      await refreshData(); await build();
    } catch (e) { alert('清空失败:' + (e.message || e)); }
  };
  const handleDeleteNode = async (id) => {
    if (!confirm('删除该节点及其连线?')) return;
    try { await api.deleteById(activeNamespace, id); setSelectedNode(null); await build(); await refreshData(); }
    catch (e) { alert('删除失败'); }
  };

  // 高亮某社区
  const toggleCommunity = (cid) => {
    setHighlightedCommunity((c) => (c === cid ? null : cid));
  };

  return (
    <div className="gxv-layout">
      <div className="gxv-canvas" ref={mountRef}>
        {/* HUD */}
        <div className="gxv-hud font-mono">
          <span>[ {activeNamespace.toUpperCase()} ]</span>
          <span>NODES {stats.nodes}</span>
          <span>EDGES {stats.edges}</span>
          <span>GALAXIES {communities.length}</span>
        </div>

        {/* loading / error */}
        {loading && <div className="gxv-overlay font-mono">[ INDEXING // 正在展开星系... ]</div>}
        {error && <div className="gxv-overlay gxv-error font-mono">{error}</div>}

        {/* tooltip */}
        {hoveredNode && (
          <div className="gxv-tooltip font-mono" ref={tooltipRef}>
            <div className="gxv-tip-head">[{nodeLabel(hoveredNode)}]</div>
            <div className="gxv-tip-meta">
              {hoveredNode.node_type && `${hoveredNode.node_type}`}
              {hoveredNode.community_id != null && ` · CLUSTER_${hoveredNode.community_id}`}
            </div>
          </div>
        )}

        {/* 顶部控制条 */}
        <div className="gxv-toolbar font-mono">
          <button type="button" className="gxv-btn" onClick={() => fitView(true)} title="框选全部(双击空白亦可)">🎯 框选</button>
          <button type="button" className={`gxv-btn ${spinOn ? 'on' : ''}`} onClick={() => setSpinOn((s) => !s)} title="整体公转开关">🪐 {spinOn ? '公转中' : '静止'}</button>
          <button type="button" className="gxv-btn" onClick={build} title="重新载入">🔄 同步</button>
        </div>
      </div>

      {/* 面板开关 */}
      <button type="button" className={`gxv-panel-toggle font-mono ${isPanelOpen ? 'active' : ''}`} onClick={() => setIsPanelOpen((o) => !o)}>
        {isPanelOpen ? '› 收起' : '‹ 控制台'}
      </button>

      {/* 右侧控制台 */}
      {isPanelOpen && (
        <div className="gxv-panel scrollbar-hidden">
          <GlassCard title={<span>🌌 星系控制台 (GALAXY)</span>} glowColor="cyan" className="gxv-card flex-grow-card">
            <div className="gxv-panel-inner font-mono">
              {/* 搜索 */}
              <div className="gxv-sec">
                <label>🔍 搜索星体</label>
                <input className="gxv-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="按名字/内容检索..." />
              </div>

              {/* 社区图例 */}
              <div className="gxv-sec">
                <label>星系图例 (点击高亮)</label>
                <div className="gxv-legend scrollbar-thin">
                  {communities.slice(0, 40).map((c) => (
                    <button type="button" key={c.cid} className={`gxv-chip ${highlightedCommunity === c.cid ? 'active' : ''}`} onClick={() => toggleCommunity(c.cid)}>
                      <span className="gxv-swatch" style={{ background: '#' + c.color.toString(16).padStart(6, '0') }} />
                      <span className="gxv-chip-id">C{c.cid}</span>
                      <span className="gxv-chip-n">{c.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 节点遥测 */}
              <div className="gxv-telemetry scrollbar-thin">
                <div className="gxv-tele-head">[ TELEMETRY // 天体遥测 ]</div>
                {selectedNode ? (
                  <div className="gxv-tele-body font-mono">
                    <div className="gxv-row"><span className="lbl">名称</span><span className="val text-cyan">{nodeLabel(selectedNode)}</span></div>
                    {selectedNode.node_type && <div className="gxv-row"><span className="lbl">类型</span><span className="val">{selectedNode.node_type}</span></div>}
                    {selectedNode.community_id != null && <div className="gxv-row"><span className="lbl">星系</span><span className="val">CLUSTER_{selectedNode.community_id}</span></div>}
                    {selectedNode.source_file && <div className="gxv-row col"><span className="lbl">源文件</span><span className="val gxv-path">{selectedNode.source_file}{selectedNode.source_location ? ` @ ${selectedNode.source_location}` : ''}</span></div>}
                    <div className="gxv-row col"><span className="lbl">质荷</span><pre className="gxv-payload scrollbar-thin">{selectedNode.content}</pre></div>
                    <div className="gxv-actions">
                      <button type="button" className="gxv-btn-mini danger" onClick={() => handleDeleteNode(selectedNode.id)}>☄ 擦除</button>
                    </div>

                    {/* 邻居 */}
                    {detailLoading ? <div className="gxv-muted">拉取引力邻居...</div> :
                      nodeDetail?.edges?.length ? (
                        <div className="gxv-neighbors">
                          <div className="lbl">关联 ({nodeDetail.edges.length})</div>
                          {nodeDetail.edges.map((ed, i) => {
                            const nb = nodesRef.current.find((n) => n.id === ed.id);
                            return (
                              <div key={i} className="gxv-nbr" onClick={() => { const nb2 = nodesRef.current.find((n) => n.id === ed.id); if (nb2) setSelectedNode(nb2); }}>
                                <span style={{ color: ed.direction === 'out' ? '#ffbb00' : '#00f2fe' }}>{ed.direction === 'out' ? '→' : '←'} {ed.relation}</span>
                                <span className="gxv-nbr-name">{nb ? nodeLabel(nb) : ed.id.slice(0, 8)}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                  </div>
                ) : (
                  <div className="gxv-empty font-mono">[ 点击星体载入遥测 · 双击空白框选 ]</div>
                )}
              </div>

              {/* 数据操作 */}
              <div className="gxv-sec gxv-ops">
                {!showExtract ? (
                  <>
                    <button type="button" className="gxv-btn bg-cyan full" onClick={() => setShowExtract(true)}>📂 提取代码库</button>
                    <button type="button" className="gxv-btn danger full" onClick={handleClear}>🧹 清空命名空间</button>
                  </>
                ) : (
                  <div className="gxv-extract">
                    <input className="gxv-input" value={extractPath} onChange={(e) => setExtractPath(e.target.value)} placeholder="代码库绝对路径 E:/my-proj" disabled={extracting} />
                    <input className="gxv-input" value={extractNs} onChange={(e) => setExtractNs(e.target.value)} placeholder="命名空间(留空用文件夹名)" disabled={extracting} />
                    {extractMsg && <div className="gxv-muted">{extractMsg}</div>}
                    <div className="gxv-row-btns">
                      <button type="button" className="gxv-btn bg-cyan" onClick={handleExtract} disabled={extracting || !extractPath.trim()}>{extracting ? '提取中...' : '开始'}</button>
                      <button type="button" className="gxv-btn" onClick={() => { setShowExtract(false); setExtractMsg(''); }} disabled={extracting}>取消</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      <style jsx>{`
        .gxv-layout { position: relative; width: 100%; height: calc(100vh - var(--header-height) - 48px); min-height: 500px; overflow: hidden; }
        .gxv-canvas { position: absolute; inset: 0; background: radial-gradient(circle at 50% 40%, #0a0805 0%, #030201 80%); border-radius: 12px; overflow: hidden; }
        .gxv-hud { position: absolute; top: 0; left: 0; right: 0; display: flex; gap: 18px; padding: 10px 18px; font-size: 10.5px; color: hsl(var(--text-muted)); letter-spacing: .5px; z-index: 10; background: linear-gradient(to bottom, rgba(3,2,1,.85), transparent); }
        .gxv-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: hsl(var(--color-cyan)); font-size: 13px; pointer-events: none; }
        .gxv-error { color: hsl(var(--color-red)); }
        .gxv-tooltip { position: fixed; z-index: 100; background: rgba(8,7,5,.95); border: 1px solid hsl(var(--color-cyan)); box-shadow: 0 0 14px rgba(255,187,0,.25); padding: 6px 10px; border-radius: 6px; max-width: 260px; pointer-events: none; font-size: 11px; }
        .gxv-tip-head { color: hsl(var(--color-cyan)); font-weight: bold; margin-bottom: 2px; }
        .gxv-tip-meta { color: hsl(var(--text-muted)); font-size: 9px; }
        .gxv-toolbar { position: absolute; left: 14px; top: 44px; display: flex; gap: 6px; z-index: 11; }
        .gxv-btn { background: rgba(3,2,1,.85); border: 1px solid rgba(255,187,0,.3); color: hsl(var(--color-cyan)); border-radius: 5px; padding: 5px 10px; font-size: 10.5px; cursor: pointer; transition: all .18s; font-family: var(--font-mono); }
        .gxv-btn:hover { border-color: hsl(var(--color-cyan)); box-shadow: 0 0 10px rgba(0,242,254,.3); }
        .gxv-btn.on { border-color: hsl(var(--color-purple)); color: hsl(var(--color-purple)); box-shadow: 0 0 10px rgba(255,102,0,.3); }
        .gxv-btn.bg-cyan { background: hsl(var(--color-cyan)); color: #030201; border: none; }
        .gxv-btn.bg-cyan:hover { background: #00e0ec; }
        .gxv-btn.full { width: 100%; }
        .gxv-btn.danger { border-color: hsl(var(--color-red)); color: hsl(var(--color-red)); background: rgba(255,59,48,.08); }
        .gxv-panel-toggle { position: absolute; right: 14px; top: 44px; z-index: 1001; background: rgba(3,2,1,.85); border: 1px solid rgba(255,187,0,.4); color: hsl(var(--color-cyan)); border-radius: 6px; padding: 6px 12px; font-size: 11px; cursor: pointer; }
        .gxv-panel { position: absolute; right: 14px; top: 84px; width: 330px; max-height: calc(100% - 100px); z-index: 1000; overflow-y: auto; }
        .gxv-card { background: rgba(6,4,3,.72) !important; border-color: rgba(255,187,0,.12) !important; backdrop-filter: blur(18px) saturate(160%); }
        .gxv-panel-inner { display: flex; flex-direction: column; gap: 12px; }
        .gxv-sec { display: flex; flex-direction: column; gap: 5px; }
        .gxv-sec label { font-size: 9px; color: rgba(255,187,0,.75); font-weight: bold; letter-spacing: .5px; text-transform: uppercase; }
        .gxv-input { background: rgba(12,9,6,.85); border: 1px solid rgba(255,187,0,.25); border-radius: 4px; color: #ffddaa; font-family: var(--font-mono); outline: none; height: 28px; font-size: 11px; padding: 4px 8px; width: 100%; }
        .gxv-input:focus { border-color: hsl(var(--color-cyan)); box-shadow: 0 0 8px rgba(0,242,254,.25); }
        .gxv-legend { display: flex; flex-wrap: wrap; gap: 4px; max-height: 92px; overflow-y: auto; }
        .gxv-chip { display: inline-flex; align-items: center; gap: 4px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,187,0,.15); border-radius: 10px; padding: 2px 7px; font-size: 9px; color: #e5e7eb; cursor: pointer; transition: all .15s; }
        .gxv-chip:hover { border-color: hsl(var(--color-cyan)); }
        .gxv-chip.active { border-color: hsl(var(--color-cyan)); box-shadow: 0 0 8px rgba(0,242,254,.4); }
        .gxv-swatch { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .gxv-chip-id { color: hsl(var(--color-cyan)); }
        .gxv-chip-n { color: hsl(var(--text-muted)); }
        .gxv-telemetry { border: 1px solid rgba(255,187,0,.1); border-radius: 6px; background: rgba(3,2,1,.4); padding: 8px; max-height: 300px; overflow-y: auto; }
        .gxv-tele-head { font-size: 9px; font-weight: bold; color: hsl(var(--color-cyan)); letter-spacing: 1px; margin-bottom: 6px; border-bottom: 1px dashed rgba(255,187,0,.15); padding-bottom: 4px; }
        .gxv-tele-body { display: flex; flex-direction: column; gap: 4px; }
        .gxv-row { display: flex; justify-content: space-between; font-size: 10.5px; padding: 3px 0; border-bottom: 1px dashed rgba(255,255,255,.04); }
        .gxv-row.col { flex-direction: column; gap: 3px; align-items: flex-start; border-bottom: 1px dashed rgba(255,255,255,.04); }
        .gxv-row .lbl { color: hsl(var(--text-muted)); }
        .gxv-path { font-size: 9px; word-break: break-all; color: hsl(var(--text-muted)); }
        .gxv-payload { width: 100%; max-height: 90px; overflow-y: auto; background: rgba(0,0,0,.4); border: 1px solid rgba(255,187,0,.06); border-radius: 5px; padding: 6px; font-size: 9.5px; color: #e5e7eb; white-space: pre-wrap; word-break: break-all; margin: 0; }
        .gxv-actions { display: flex; gap: 6px; margin-top: 6px; }
        .gxv-btn-mini { flex: 1; background: rgba(244,63,94,.06); border: 1px solid rgba(244,63,94,.3); color: hsl(var(--color-red)); border-radius: 4px; padding: 4px; font-size: 9.5px; cursor: pointer; font-family: var(--font-mono); }
        .gxv-neighbors { margin-top: 8px; display: flex; flex-direction: column; gap: 3px; }
        .gxv-neighbors .lbl { font-size: 9px; color: rgba(255,187,0,.75); }
        .gxv-nbr { display: flex; justify-content: space-between; font-size: 9.5px; padding: 3px 6px; background: rgba(255,187,0,.03); border: 1px solid rgba(255,187,0,.08); border-radius: 4px; cursor: pointer; transition: all .15s; color: #e5e7eb; }
        .gxv-nbr:hover { background: rgba(255,187,0,.1); border-color: rgba(255,187,0,.3); }
        .gxv-nbr-name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gxv-empty { display: flex; align-items: center; justify-content: center; text-align: center; min-height: 100px; font-size: 10.5px; color: hsl(var(--text-muted)); }
        .gxv-muted { font-size: 9.5px; color: hsl(var(--text-muted)); }
        .gxv-ops { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; border-top: 1px dashed rgba(255,187,0,.15); }
        .gxv-extract { display: flex; flex-direction: column; gap: 6px; }
        .gxv-row-btns { display: flex; gap: 6px; }
        .gxv-row-btns .gxv-btn { flex: 1; }
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,187,0,.15); }
        .scrollbar-hidden { scrollbar-width: none; }
        .scrollbar-hidden::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
