'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import GlassCard from './GlassCard';

export default function KnowledgeGraph() {
  const mountRef = useRef(null);
  const tooltipRef = useRef(null);
  
  const { activeNamespace, namespaces, refreshData, setLastEvent } = useApp();
  
  // Graph Data States
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isConsoleOpen, setIsConsoleOpen] = useState(true);
  
  // Selection & HUD States
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [relationFilter, setRelationFilter] = useState('all');
  
  // Layout and Animation Controls
  const [layoutMode, setLayoutMode] = useState('galaxy'); // 'galaxy' (spiral) or 'solar' (concentric orbits)
  const [autoRotate, setAutoRotate] = useState(true);
  const [orbitSpeedFactor, setOrbitSpeedFactor] = useState(1.0);
  
  // Link Node Action States
  const [isLinking, setIsLinking] = useState(false);
  const [targetLinkId, setTargetLinkId] = useState('');
  const [relationType, setRelationType] = useState('related_to');

  // GraphStats state
  const [graphStats, setGraphStats] = useState({ nodes: 0, edges: 0, relation_types: [] });

  // Extract Codebase States
  const [showExtractInput, setShowExtractInput] = useState(false);
  const [extractPath, setExtractPath] = useState('');
  const [extractNamespace, setExtractNamespace] = useState('');
  const [extracting, setExtracting] = useState(false);

  // Import graph.json File States
  const [showImportFileInput, setShowImportFileInput] = useState(false);
  const [importFilePath, setImportFilePath] = useState('');
  const [importNamespace, setImportNamespace] = useState('');
  const [importingFile, setImportingFile] = useState(false);

  // Orbit Control Dial State
  const [showControlDial, setShowControlDial] = useState(false);

  // Node details (neighbors)
  const [nodeDetail, setNodeDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Pathfinder States
  const [pathStartNode, setPathStartNode] = useState(null);
  const [pathEndNode, setPathEndNode] = useState(null);
  const [foundPath, setFoundPath] = useState(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathMaxDepth, setPathMaxDepth] = useState(5);
  
  // Three.js References for clean animation updates
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const animationFrameRef = useRef(null);
  const raycasterRef = useRef(null);
  const mouseRef = useRef(new THREE.Vector2());
  const nodesGroupRef = useRef(null);
  const edgesGroupRef = useRef(null);
  const orbitGroupRef = useRef(null);
  const coreRef = useRef(null);
  
  // Cache node objects to update connection line positions easily
  const nodeMeshesRef = useRef([]);
  const nodeDataRef = useRef([]);
  const idToMeshRef = useRef({});
  const targetCamPosRef = useRef(null);
  const targetLookAtRef = useRef(new THREE.Vector3(0, 0, 0));
  const currentLookAtRef = useRef(new THREE.Vector3(0, 0, 0));

  // Fetch Graph Data
  const fetchGraph = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getGraphData(activeNamespace);
      setGraphData(res);
      nodeDataRef.current = res.nodes || [];
      setSelectedNode(null);
      setHoveredNode(null);
      
      // Fetch detailed stats
      try {
        const stats = await api.graphStats(activeNamespace);
        setGraphStats(stats);
      } catch (err) {
        console.error('[KnowledgeGraph] Fetch stats failed:', err);
      }
    } catch (err) {
      console.error('[KnowledgeGraph] Fetch failed:', err);
      setError('无法载入星系图谱，请检查 API 服务状态。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraph();
  }, [activeNamespace]);

  // Fetch node detail and neighbors when selectedNode changes
  useEffect(() => {
    if (!selectedNode?.id) {
      setNodeDetail(null);
      return;
    }
    const fetchDetail = async () => {
      setDetailLoading(true);
      try {
        const detail = await api.getNodeDetail(selectedNode.id);
        setNodeDetail(detail);
      } catch (err) {
        console.error('[KnowledgeGraph] Failed to fetch node detail:', err);
      } finally {
        setDetailLoading(false);
      }
    };
    fetchDetail();
  }, [selectedNode?.id]);

  // Run Graphify extraction on codebase directory
  const handleExtractCodebase = async () => {
    if (!extractPath.trim()) return;

    // Auto-fill namespace from folder name if empty
    let targetNamespace = extractNamespace.trim();
    if (!targetNamespace) {
      const folderName = extractPath.trim().split(/[/\\]/).filter(Boolean).pop();
      targetNamespace = folderName || 'default';
    }

    // Prevent using reserved 'all' keyword
    if (targetNamespace === 'all') {
      alert('命名空间不能使用保留关键字 "all"，请更换名称。');
      return;
    }

    setExtracting(true);
    try {
      const res = await api.extractCodebase(extractPath.trim(), targetNamespace);
      setLastEvent({
        type: 'insert',
        namespace: targetNamespace,
        message: `代码库提取完成！导入了 ${res.nodes_imported || 0} 个节点，${res.edges_imported || 0} 条引力链路。`
      });
      alert(`提取成功！已导入 ${res.nodes_imported || 0} 个知识节点，${res.edges_imported || 0} 条关系链到命名空间 "${targetNamespace}"。`);
      setShowExtractInput(false);
      setExtractPath('');
      setExtractNamespace('');
      fetchGraph();
    } catch (err) {
      console.error('[KnowledgeGraph] extractCodebase failed:', err);
      alert(`提取失败: ${err.message || err}`);
    } finally {
      setExtracting(false);
    }
  };

  // Import existing graphify graph.json file
  const handleImportGraphFile = async () => {
    if (!importFilePath.trim()) return;

    // Auto-fill namespace from file name if empty
    let targetNamespace = importNamespace.trim();
    if (!targetNamespace) {
      const fileName = importFilePath.trim().split(/[/\\]/).filter(Boolean).pop().replace(/\.json$/i, '');
      targetNamespace = fileName || 'default';
    }

    // Prevent using reserved 'all' keyword
    if (targetNamespace === 'all') {
      alert('命名空间不能使用保留关键字 "all"，请更换名称。');
      return;
    }

    setImportingFile(true);
    try {
      const res = await api.importGraphFile(importFilePath.trim(), targetNamespace);
      setLastEvent({
        type: 'insert',
        namespace: targetNamespace,
        message: `导入 graph.json 完成！导入了 ${res.nodes_imported || 0} 个节点，${res.edges_imported || 0} 条引力链路。`
      });
      alert(`导入成功！已导入 ${res.nodes_imported || 0} 个知识节点，${res.edges_imported || 0} 条关系链到命名空间 "${targetNamespace}"。`);
      setShowImportFileInput(false);
      setImportFilePath('');
      setImportNamespace('');
      fetchGraph();
    } catch (err) {
      console.error('[KnowledgeGraph] importGraphFile failed:', err);
      alert(`导入失败: ${err.message || err}`);
    } finally {
      setImportingFile(false);
    }
  };

  // Shortest Path Finder between two nodes
  const handleFindPath = async () => {
    if (!pathStartNode || !pathEndNode) return;
    setPathLoading(true);
    setFoundPath(null);
    try {
      const res = await api.findPath(pathStartNode.id, pathEndNode.id, pathMaxDepth);
      if (res.found && res.path) {
        setFoundPath(res.path);
        
        // Glide camera to the start node to begin visualization
        const meshA = nodeMeshesRef.current?.find(m => m.userData.id === pathStartNode.id);
        if (meshA) {
          targetCamPosRef.current = new THREE.Vector3()
            .copy(meshA.position)
            .add(new THREE.Vector3(0, 2.2, 3.2));
          targetLookAtRef.current.copy(meshA.position);
        }
      } else {
        setFoundPath([]);
      }
    } catch (err) {
      console.error('[KnowledgeGraph] findPath failed:', err);
      alert(`查找路径失败: ${err.message || err}`);
    } finally {
      setPathLoading(false);
    }
  };

  const handleClearPath = () => {
    setPathStartNode(null);
    setPathEndNode(null);
    setFoundPath(null);
  };

  // Handle Node Deletion
  const handleDeleteNode = async (nodeId) => {
    if (!confirm('确定要遗忘当前知识节点吗？此操作将同时清除相关的图谱连线。')) return;
    try {
      await api.deleteById(activeNamespace, nodeId);
      setLastEvent({
        type: 'delete',
        namespace: activeNamespace,
        message: `星系记忆节点被擦除。节点 ID: ${nodeId.substring(0, 8)}...`
      });
      setSelectedNode(null);
      fetchGraph();
      refreshData();
    } catch (err) {
      console.error('[KnowledgeGraph] Delete node failed:', err);
      alert('擦除节点失败');
    }
  };

  // Handle Node Linking
  const handleLinkNodes = async (e) => {
    e.preventDefault();
    if (!selectedNode || !targetLinkId) return;
    try {
      await api.addEdge(selectedNode.id, targetLinkId, relationType, 1.0);
      setLastEvent({
        type: 'insert',
        namespace: activeNamespace,
        message: `已为星系节点建立新的引力链路 [${relationType}]。`
      });
      setIsLinking(false);
      setTargetLinkId('');
      fetchGraph();
    } catch (err) {
      console.error('[KnowledgeGraph] Link nodes failed:', err);
      alert('建立关联失败，请检查目标节点是否存在。');
    }
  };

  // Reset Camera View
  const handleResetCamera = () => {
    targetCamPosRef.current = new THREE.Vector3(0, 8, 10);
    targetLookAtRef.current.set(0, 0, 0);
  };

  // Helper to generate glowing circle texture
  const createCircleTexture = (colorHex) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.2, colorHex);
    grad.addColorStop(0.5, colorHex.replace('1)', '0.3)'));
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  };

  // Core 3D Rendering Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Initialize Scene & Camera
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    // Ambient fog for premium visual depth
    scene.fog = new THREE.FogExp2(0x030201, 0.025);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 8, 10);
    cameraRef.current = camera;
    targetCamPosRef.current = new THREE.Vector3(0, 8, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    try {
      setTimeout(() => {
        const parentElement = container?.parentElement;
        const canvases = document.querySelectorAll('canvas');
        const canvasInfo = Array.from(canvases).map(c => ({
          className: c.className,
          width: c.width,
          height: c.height,
          styleWidth: c.style.width,
          styleHeight: c.style.height,
          parentClassName: c.parentElement ? c.parentElement.className : null,
          grandparentClassName: c.parentElement && c.parentElement.parentElement ? c.parentElement.parentElement.className : null,
        }));
        
        const report = {
          event: "canvases_debug",
          mountWidth: container?.clientWidth,
          mountHeight: container?.clientHeight,
          parentWidth: parentElement ? parentElement.clientWidth : null,
          parentHeight: parentElement ? parentElement.clientHeight : null,
          parentClassName: parentElement ? parentElement.className : null,
          windowWidth: typeof window !== 'undefined' ? window.innerWidth : null,
          windowHeight: typeof window !== 'undefined' ? window.innerHeight : null,
          canvases: canvasInfo
        };
        fetch('http://127.0.0.1:8920/', {
          method: 'POST',
          body: JSON.stringify(report),
          headers: { 'Content-Type': 'application/json' }
        }).catch(e => {});
      }, 2000);
    } catch (err) {}

    // 2. Add Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffbb00, 1.2);
    dirLight.position.set(5, 15, 5);
    scene.add(dirLight);

    // Glowing core point light
    const coreLight = new THREE.PointLight(0xffbb00, 2, 30);
    coreLight.position.set(0, 0, 0);
    scene.add(coreLight);

    // 3. Create Particle Starfield Background
    const starCount = 600;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount; i++) {
      // Distribute stars in a shell between radius 15 and 60
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const r = 15 + Math.random() * 45;
      
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);

      // Cyber gold or orange tints
      const isGold = Math.random() > 0.4;
      starColors[i * 3] = isGold ? 1.0 : 0.9;
      starColors[i * 3 + 1] = isGold ? 0.73 : 0.4;
      starColors[i * 3 + 2] = isGold ? 0.0 : 0.0;
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    
    const starTexture = createCircleTexture('rgba(255, 187, 0, 1)');
    const starMaterial = new THREE.PointsMaterial({
      size: 0.12,
      map: starTexture,
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    const starfield = new THREE.Points(starGeometry, starMaterial);
    scene.add(starfield);

    // 4. Create Core Star (Sun representing Active Namespace)
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);
    
    const coreGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffbb00,
      wireframe: true
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreGroup.add(coreMesh);
    coreRef.current = coreGroup;

    // Concentric orbit lines for solar look
    const orbitGroup = new THREE.Group();
    scene.add(orbitGroup);
    orbitGroupRef.current = orbitGroup;

    // Groups for nodes and edges
    const nodesGroup = new THREE.Group();
    scene.add(nodesGroup);
    nodesGroupRef.current = nodesGroup;

    const edgesGroup = new THREE.Group();
    scene.add(edgesGroup);
    edgesGroupRef.current = edgesGroup;

    // Raycaster for mouse picking
    const raycaster = new THREE.Raycaster();
    raycasterRef.current = raycaster;

    // Resize Observer for robust container-level tracking
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (!container || !camera || !renderer) continue;
        const w = container.clientWidth;
        const h = container.clientHeight;
        
        try {
          const report = {
            event: "resize",
            w: w,
            h: h
          };
          fetch('http://127.0.0.1:8920/', {
            method: 'POST',
            body: JSON.stringify(report),
            headers: { 'Content-Type': 'application/json' }
          }).catch(e => {});
        } catch (err) {}

        if (w === 0 || h === 0) continue;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    if (container) {
      resizeObserver.observe(container);
    }

    // Mouse Move & Click Handlers for WebGL Canvas
    const onMouseMove = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update tooltip HTML position
      if (tooltipRef.current) {
        tooltipRef.current.style.left = `${event.clientX + 15}px`;
        tooltipRef.current.style.top = `${event.clientY + 15}px`;
      }
    };

    const onClick = () => {
      raycaster.setFromCamera(mouseRef.current, camera);
      const intersects = raycaster.intersectObjects(nodesGroup.children);
      
      if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        const nData = clickedMesh.userData;
        setSelectedNode(nData);
        
        // Glide camera closer to the selected node
        const targetPos = new THREE.Vector3()
          .copy(clickedMesh.position)
          .add(new THREE.Vector3(0, 1.8, 2.5));
        targetCamPosRef.current = targetPos;
        targetLookAtRef.current.copy(clickedMesh.position);
      }
    };

    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onClick);

    return () => {
      resizeObserver.disconnect();
      if (renderer.domElement) {
        renderer.domElement.removeEventListener('mousemove', onMouseMove);
        renderer.domElement.removeEventListener('click', onClick);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (container && renderer.domElement) {
        try {
          container.removeChild(renderer.domElement);
        } catch (e) {
          // ignore already removed
        }
      }
      // Dispose WebGL resources to prevent context leaks
      starGeometry.dispose();
      starMaterial.dispose();
      starTexture.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      renderer.dispose();
    };
  }, []);

  // Sync Layout & Data with Three.js Scene
  useEffect(() => {
    const scene = sceneRef.current;
    const nodesGroup = nodesGroupRef.current;
    const edgesGroup = edgesGroupRef.current;
    const orbitGroup = orbitGroupRef.current;
    
    if (!scene || !nodesGroup || !edgesGroup || !orbitGroup) return;

    // Clear previous children
    while (nodesGroup.children.length > 0) {
      const obj = nodesGroup.children[0];
      nodesGroup.remove(obj);
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
    while (edgesGroup.children.length > 0) {
      const obj = edgesGroup.children[0];
      edgesGroup.remove(obj);
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
    while (orbitGroup.children.length > 0) {
      const obj = orbitGroup.children[0];
      orbitGroup.remove(obj);
      obj.geometry?.dispose();
      obj.material?.dispose();
    }

    const { nodes, edges } = graphData;
    if (!nodes || nodes.length === 0) return;

    // Setup shortest path node tracking
    const pathNodeIds = new Set();
    if (foundPath && foundPath.length > 0) {
      foundPath.forEach(step => {
        pathNodeIds.add(step.from);
        pathNodeIds.add(step.to);
      });
    }

    // Filter nodes by query (highlight match)
    const normalizedQuery = searchQuery.toLowerCase().trim();

    // 1. Draw Orbit Ring guides and place planet nodes
    // Community palette: distinct hues per detected cluster, deterministic by id.
    const COMMUNITY_PALETTE = [
      0x00f2fe, 0xff6600, 0xffaa00, 0x8a2be2, 0x4ade80,
      0xff4081, 0x00e676, 0x7c4dff, 0xffeb3b, 0x18ffff,
      0xff5722, 0x3d5afe, 0xe91e63, 0x00bfa5, 0xffd600,
    ];
    const RELATION_PALETTE = {
      contains: 0xff6600,
      calls: 0x00f2fe,
      imports: 0x4ade80,
      imports_from: 0x4ade80,
      inherits: 0xff4081,
      references: 0xffeb3b,
      method: 0xffaa00,
      rationale_for: 0x8a2be2,
      related_to: 0xcccccc,
    };
    const relationColorOf = (rel) => (RELATION_PALETTE[rel] || 0x18ffff) & 0xffffff;

    // Group nodes by community_id so the layout forms natural clusters
    const communityGroups = new Map();
    nodes.forEach((node) => {
      const cid = node.community_id != null ? node.community_id : -1;
      if (!communityGroups.has(cid)) communityGroups.set(cid, []);
      communityGroups.get(cid).push(node);
    });
    // Assign each community an angular sector around the galaxy core
    const communitySectors = new Map();
    const sectorCount = communityGroups.size || 1;
    let sectorIdx = 0;
    for (const cid of communityGroups.keys()) {
      const sectorCenter = (sectorIdx / sectorCount) * Math.PI * 2;
      communitySectors.set(cid, sectorCenter);
      sectorIdx += 1;
    }

    nodeMeshesRef.current = [];
    const idToMesh = {};
    const nodeOrder = []; // preserve original index for solar layout fallback

    nodes.forEach((node, i) => {
      nodeOrder.push(node);
      const isPinned = node.is_pinned;
      const nodeType = node.node_type;
      
      // Check if node is part of the shortest path
      const isOnPath = pathNodeIds.has(node.id);
      const isStart = pathStartNode?.id === node.id;
      const isEnd = pathEndNode?.id === node.id;

      // Size by node type: classes/files are larger than symbols/functions
      const sizeByType =
        nodeType === 'class' || nodeType === 'file' ? 0.28 :
        nodeType === 'function' ? 0.18 :
        nodeType === 'document' ? 0.22 :
        0.16;
      
      let size = isPinned ? Math.max(0.35, sizeByType * 1.6) : sizeByType;
      if (isOnPath) {
        size = isStart || isEnd ? Math.max(size * 1.5, 0.45) : Math.max(size * 1.3, 0.35);
      }

      // Color: path nodes get distinct pathfinder colors, pinned wins next, then community palette, fallback by source
      let color = 0x8a2be2;
      if (isOnPath) {
        if (isStart) color = 0x10b981; // Green for start A
        else if (isEnd) color = 0xef4444; // Red for end B
        else color = 0x00f2fe; // Cyan for path nodes
      } else if (isPinned) {
        color = 0xffaa00;
      } else if (node.community_id != null) {
        color = COMMUNITY_PALETTE[node.community_id % COMMUNITY_PALETTE.length];
      } else if (node.source?.includes('snapshot')) {
        color = 0xff5500;
      } else if (node.source?.includes('code')) {
        color = 0x00f2fe;
      } else {
        color = 0xcccccc;
      }

      const geom = new THREE.SphereGeometry(size, 16, 16);
      
      // Node selection overlay / highlight
      const mat = new THREE.MeshPhongMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: isOnPath ? 0.6 : 0.15,
        shininess: isOnPath ? 120 : 90,
        specular: 0xffffff
      });

      const mesh = new THREE.Mesh(geom, mat);
      
      // Position calculation: nodes cluster around their community sector center
      // so visually-related code entities form coherent "star clusters" instead
      // of a random scatter. Solar mode falls back to concentric orbits.
      let r = 0;
      let angle = 0;
      let y = 0;
      const cid = node.community_id != null ? node.community_id : -1;
      const sectorCenter = communitySectors.get(cid) ?? 0;
      const groupArr = communityGroups.get(cid) || [node];
      const inGroupIndex = groupArr.indexOf(node);
      const groupSize = groupArr.length;

      if (layoutMode === 'galaxy') {
        // Sector width scales so larger communities span more arc.
        // Each cluster sits in its own angular wedge of the disk.
        const sectorWidth = (Math.PI * 2 / sectorCount) * 0.8;
        const withinSector = groupSize > 1
          ? (inGroupIndex / (groupSize - 1) - 0.5) * sectorWidth
          : 0;
        const baseAngle = sectorCenter + withinSector;
        // Radial position inside the cluster, plus jitter for visual depth
        const rBase = 1.6 + (groupSize > 1 ? (inGroupIndex % 4) * 0.7 : 0) + Math.random() * 0.5;
        r = rBase;
        angle = baseAngle;
        y = (Math.random() - 0.5) * 0.4 + (r * 0.04);
      } else {
        // Solar: concentric circular orbits, community-agnostic
        const numConcentricOrbits = Math.max(3, Math.ceil(nodes.length / 4));
        const orbitIndex = i % numConcentricOrbits;
        r = 1.3 + (4.5 * (orbitIndex / numConcentricOrbits)) + (Math.random() * 0.1);
        angle = (i * (Math.PI * 2 / 5)) + (Math.random() * 0.15);
        y = (Math.random() - 0.5) * 0.08;
      }

      mesh.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);

      // Cache coordinates and properties for Keplerian orbital animation
      mesh.userData = {
        id: node.id,
        label: node.content.substring(0, 25) + '...',
        content: node.content,
        source: node.source,
        timestamp: node.timestamp,
        access_count: node.access_count,
        is_pinned: isPinned,
        node_type: nodeType,
        community_id: node.community_id,
        source_file: node.source_file,
        source_location: node.source_location,
        orbitRadius: r,
        orbitAngle: angle,
        orbitSpeed: (0.16 + Math.random() * 0.08) / Math.sqrt(r), // Kepler's speed drop-off
        originalColor: color
      };

      nodesGroup.add(mesh);
      nodeMeshesRef.current.push(mesh);
      idToMesh[node.id] = mesh;

      // Draw Orbit Track rings in Solar layout
      if (layoutMode === 'solar' && i % 4 === 0) {
        const trackGeo = new THREE.RingGeometry(r, r + 0.01, 64);
        const trackMat = new THREE.MeshBasicMaterial({
          color: 0xffbb00,
          opacity: 0.04,
          transparent: true,
          side: THREE.DoubleSide
        });
        const track = new THREE.Mesh(trackGeo, trackMat);
        track.rotation.x = Math.PI / 2;
        orbitGroup.add(track);
      }
    });

    // 2. Draw glowing constellation connections (edges)
    edges.forEach((edge) => {
      const sourceMesh = idToMesh[edge.source];
      const targetMesh = idToMesh[edge.target];
      
      if (!sourceMesh || !targetMesh) return;

      // Filter by connection type if set
      if (relationFilter !== 'all' && edge.relation !== relationFilter) return;

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        sourceMesh.position,
        targetMesh.position
      ]);

      // Check if this edge is on the shortest path
      const isEdgeOnPath = foundPath?.some(step => 
        (step.from === edge.source && step.to === edge.target) ||
        (step.from === edge.target && step.to === edge.source)
      );

      // Edge color reflects relation type, path edges are high contrast green
      const edgeColor = isEdgeOnPath ? 0x10b981 : relationColorOf(edge.relation);
      const lineMat = new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: isEdgeOnPath ? 1.0 : (0.14 + (edge.confidence * 0.18)),
        blending: THREE.AdditiveBlending
      });

      const line = new THREE.Line(lineGeo, lineMat);

      // Store references to dynamically update links as nodes revolve
      line.userData = {
        sourceId: edge.source,
        targetId: edge.target,
        relation: edge.relation,
        originalColor: edgeColor,
        isPath: isEdgeOnPath
      };

      edgesGroup.add(line);
    });

  }, [graphData, layoutMode, searchQuery, relationFilter, foundPath, pathStartNode, pathEndNode]);

  // Main Render Loop (Orbital revolution, camera panning, raycasting)
  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const nodesGroup = nodesGroupRef.current;
    const edgesGroup = edgesGroupRef.current;
    const core = coreRef.current;

    if (!renderer || !scene || !camera || !nodesGroup || !edgesGroup) return;

    let lastTime = 0;
    
    const animate = (time) => {
      animationFrameRef.current = requestAnimationFrame(animate);

      const delta = (time - lastTime) * 0.001;
      lastTime = time;

      // 1. Revolve nodes and core star
      if (core) {
        core.rotation.y += delta * 0.3;
      }

      // Rotate nodes around core if rotation is on
      const rotationDelta = delta * orbitSpeedFactor;
      nodesGroup.children.forEach((mesh) => {
        if (autoRotate) {
          mesh.userData.orbitAngle += mesh.userData.orbitSpeed * rotationDelta;
          mesh.position.x = Math.cos(mesh.userData.orbitAngle) * mesh.userData.orbitRadius;
          mesh.position.z = Math.sin(mesh.userData.orbitAngle) * mesh.userData.orbitRadius;
        }

        // Search query pulse/beacons highlight
        if (searchQuery.trim() !== '') {
          const match = mesh.userData.content.toLowerCase().includes(searchQuery.toLowerCase());
          if (match) {
            mesh.material.emissiveIntensity = 0.5 + Math.sin(time * 0.008) * 0.45;
            mesh.scale.setScalar(1.2 + Math.sin(time * 0.008) * 0.15);
          } else {
            mesh.material.emissiveIntensity = 0.02;
            mesh.scale.setScalar(0.9);
          }
        } else {
          mesh.material.emissiveIntensity = 0.15;
          mesh.scale.setScalar(1.0);
        }
      });

      // 2. Update edge line geometries to match moving nodes
      edgesGroup.children.forEach((line) => {
        const srcMesh = nodesGroup.children.find(m => m.userData.id === line.userData.sourceId);
        const destMesh = nodesGroup.children.find(m => m.userData.id === line.userData.targetId);
        
        if (srcMesh && destMesh) {
          const positions = line.geometry.attributes.position.array;
          positions[0] = srcMesh.position.x;
          positions[1] = srcMesh.position.y;
          positions[2] = srcMesh.position.z;
          positions[3] = destMesh.position.x;
          positions[4] = destMesh.position.y;
          positions[5] = destMesh.position.z;
          line.geometry.attributes.position.needsUpdate = true;
        }
      });

      // 3. Hover Interaction checking (Raycaster)
      raycaster.setFromCamera(mouseRef.current, camera);
      const intersects = raycaster.intersectObjects(nodesGroup.children);
      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        setHoveredNode(mesh.userData);
        renderer.domElement.style.cursor = 'pointer';
      } else {
        setHoveredNode(null);
        renderer.domElement.style.cursor = 'default';
      }

      // 4. Smooth Camera Glide (Interpolation lerp)
      if (targetCamPosRef.current) {
        camera.position.lerp(targetCamPosRef.current, 0.08);
      }
      if (targetLookAtRef.current) {
        currentLookAtRef.current.lerp(targetLookAtRef.current, 0.08);
        camera.lookAt(currentLookAtRef.current);
      }

      renderer.render(scene, camera);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [autoRotate, orbitSpeedFactor, searchQuery]);

  // Sync relation filter list
  const getRelationTypes = () => {
    const types = new Set();
    graphData.edges?.forEach(e => {
      if (e.relation) types.add(e.relation);
    });
    return Array.from(types);
  };

  return (
    <div className="galaxy-vis-layout">
      {/* 3D Visualizer Canvas container */}
      <div className="galaxy-canvas-container" ref={mountRef}>
        
        {/* Quick status bar display */}
        <div className="galaxy-status-hud font-mono">
          <div className="telemetry-bar">
            <span>[ FOCUS: {activeNamespace.toUpperCase()} ]</span>
            <span>[ NODECOUNT: {graphStats.nodes || graphData.nodes?.length || 0} ]</span>
            <span>[ EDGECOUNT: {graphStats.edges || graphData.edges?.length || 0} ]</span>
            <span>[ RELATIONTYPES: {graphStats.relation_types?.length || 0} ]</span>
            <span>[ FPS: 60 ]</span>
          </div>
          <span className="scan-line"></span>
        </div>

        {/* Floating Tooltip */}
        {hoveredNode && (
          <div className="hud-tooltip font-mono" ref={tooltipRef}>
            <div className="tooltip-head">[0x{hoveredNode.id.substring(0, 4)}]</div>
            <div className="tooltip-content">{hoveredNode.content.substring(0, 100)}...</div>
            <div className="tooltip-footer">Src: {hoveredNode.source}</div>
          </div>
        )}
      </div>

      {/* Floating Toggle Button for Console */}
      <button 
        type="button" 
        className={`console-toggle-btn font-mono ${isConsoleOpen ? 'active' : ''}`}
        onClick={() => setIsConsoleOpen(!isConsoleOpen)}
      >
        <span>🧭 {isConsoleOpen ? 'CLOSE_CONSOLE' : 'GALAXY_CONSOLE'}</span>
      </button>

      {/* Cyber HUD Side Panel operations as a popup */}
      {isConsoleOpen && (
        <div className="galaxy-hud-panel scrollbar-hidden popup-console">
          <GlassCard 
            title={
              <div className="console-popup-header">
                <span>星系罗盘控制台 (GALAXY CONSOLE)</span>
                <button 
                  type="button" 
                  onClick={() => setIsConsoleOpen(false)} 
                  className="console-close-btn"
                  title="关闭控制台"
                >
                  ×
                </button>
              </div>
            } 
            glowColor="cyan" 
            className="hud-card flex-grow-card"
          >
            <div className="sci-form font-mono" style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
            
            {/* Extract & Import Section */}
            <div className="form-group-sci" style={{ borderBottom: '1px dashed rgba(255, 187, 0, 0.15)', paddingBottom: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              
              {/* Extract Codebase Button/Input */}
              {!showExtractInput ? (
                <button
                  type="button"
                  onClick={() => { setShowExtractInput(true); setShowImportFileInput(false); }}
                  className="sci-submit-btn bg-cyan"
                  style={{ width: '100%', height: '30px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  📂 提取代码库 (Extract Codebase)
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '9px', color: 'rgba(255, 187, 0, 0.8)' }}>代码库目录绝对路径 (Absolute Path):</label>
                  <input
                    type="text"
                    value={extractPath}
                    onChange={(e) => setExtractPath(e.target.value)}
                    placeholder="例如: E:/my-project"
                    className="sci-control-input"
                    style={{ height: '28px', fontSize: '11px', padding: '4px 8px' }}
                    disabled={extracting}
                  />
                  <label style={{ fontSize: '9px', color: 'rgba(255, 187, 0, 0.8)' }}>命名空间 (留空自动用文件夹名):</label>
                  <input
                    type="text"
                    value={extractNamespace}
                    onChange={(e) => setExtractNamespace(e.target.value)}
                    placeholder="留空则使用文件夹名"
                    className="sci-control-input"
                    style={{ height: '28px', fontSize: '11px', padding: '4px 8px' }}
                    disabled={extracting}
                  />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={handleExtractCodebase}
                      className="sci-submit-btn bg-cyan"
                      style={{ height: '28px', fontSize: '11px', padding: '0 12px', flex: 1 }}
                      disabled={extracting || !extractPath.trim()}
                    >
                      {extracting ? '提取中...' : '开始提取'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowExtractInput(false); setExtractPath(''); setExtractNamespace(''); }}
                      className="wm-edit-btn-inline"
                      style={{ height: '28px', fontSize: '11px', padding: '0 12px' }}
                      disabled={extracting}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {/* Import graph.json Button/Input */}
              {!showImportFileInput ? (
                <button
                  type="button"
                  onClick={() => { setShowImportFileInput(true); setShowExtractInput(false); }}
                  className="sci-submit-btn bg-cyan"
                  style={{ width: '100%', height: '30px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  📥 导入 graph.json (Import JSON)
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '9px', color: 'rgba(255, 187, 0, 0.8)' }}>graph.json 文件绝对路径 (Absolute Path):</label>
                  <input
                    type="text"
                    value={importFilePath}
                    onChange={(e) => setImportFilePath(e.target.value)}
                    placeholder="例如: E:/graphify-out/graph.json"
                    className="sci-control-input"
                    style={{ height: '28px', fontSize: '11px', padding: '4px 8px' }}
                    disabled={importingFile}
                  />
                  <label style={{ fontSize: '9px', color: 'rgba(255, 187, 0, 0.8)' }}>命名空间 (留空自动用文件名):</label>
                  <input
                    type="text"
                    value={importNamespace}
                    onChange={(e) => setImportNamespace(e.target.value)}
                    placeholder="留空则使用文件名"
                    className="sci-control-input"
                    style={{ height: '28px', fontSize: '11px', padding: '4px 8px' }}
                    disabled={importingFile}
                  />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={handleImportGraphFile}
                      className="sci-submit-btn bg-cyan"
                      style={{ height: '28px', fontSize: '11px', padding: '0 12px', flex: 1 }}
                      disabled={importingFile || !importFilePath.trim()}
                    >
                      {importingFile ? '导入中...' : '开始导入'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowImportFileInput(false); setImportFilePath(''); setImportNamespace(''); }}
                      className="wm-edit-btn-inline"
                      style={{ height: '28px', fontSize: '11px', padding: '0 8px' }}
                      disabled={importingFile}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Orbit Controls Toggle */}
            <div className="form-group-sci" style={{ borderBottom: '1px dashed rgba(255, 187, 0, 0.15)', paddingBottom: '10px' }}>
              <button
                type="button"
                onClick={() => setShowControlDial(!showControlDial)}
                className={`sci-submit-btn ${showControlDial ? 'bg-cyan' : 'wm-edit-btn-inline'}`}
                style={{ width: '100%', height: '30px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                🛰 {showControlDial ? '隐藏视角控制盘 (Hide Dial)' : '展开视角控制盘 (Show Dial)'}
              </button>
            </div>

            {/* Quick Filters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
              <div className="form-group-sci" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '9px' }}>星体搜索 (Search)</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="检索星体脉冲..."
                  className="sci-control-input"
                  style={{ height: '28px', fontSize: '11px', padding: '4px 8px' }}
                />
              </div>

              <div className="form-group-sci" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '9px' }}>引力波筛选 (Relation)</label>
                <select
                  value={relationFilter}
                  onChange={(e) => setRelationFilter(e.target.value)}
                  className="sci-control-select"
                  style={{ height: '28px', fontSize: '11px', padding: '2px 6px' }}
                >
                  <option value="all">全部 (All)</option>
                  {getRelationTypes().map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Speed Slider */}
            <div className="form-group-sci" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '4px' }}>
                <label>时空流速 (Time Speed)</label>
                <span className="text-cyan">{orbitSpeedFactor.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="4.0"
                step="0.1"
                value={orbitSpeedFactor}
                onChange={(e) => setOrbitSpeedFactor(parseFloat(e.target.value))}
                className="sci-slider"
                disabled={!autoRotate}
                style={{ height: '4px' }}
              />
            </div>

            {/* Pathfinder Section */}
            <div className="form-group-sci" style={{ borderTop: '1px dashed rgba(255, 187, 0, 0.15)', paddingTop: '10px' }}>
              <label style={{ fontSize: '9px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🔍 拓扑寻路 (Pathfinder)</span>
                {foundPath && (
                  <span 
                    onClick={handleClearPath} 
                    style={{ color: '#ef4444', cursor: 'pointer', textTransform: 'none', fontWeight: 'normal', fontSize: '8.5px' }}
                  >
                    [清除路径]
                  </span>
                )}
              </label>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {/* Node A Slot */}
                <div 
                  className="path-slot"
                  style={{
                    flex: 1,
                    height: '28px',
                    borderRadius: '4px',
                    border: '1px dashed rgba(255, 187, 0, 0.25)',
                    background: pathStartNode ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0,0,0,0.2)',
                    borderColor: pathStartNode ? '#10b981' : 'rgba(255, 187, 0, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '9.5px',
                    color: pathStartNode ? '#10b981' : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    padding: '0 4px'
                  }}
                  title={pathStartNode ? `起点: ${pathStartNode.content}` : '设定起点 A（点击星体并在遥测卡设为起点）'}
                  onClick={() => {
                    if (selectedNode) {
                      setPathStartNode({ id: selectedNode.id, content: selectedNode.content });
                      setFoundPath(null);
                    } else {
                      alert('请先在星系中点击选择一个星体！');
                    }
                  }}
                >
                  {pathStartNode ? `A: ${pathStartNode.content.substring(0, 8)}...` : '设定起点 A'}
                </div>

                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px' }}>⇄</span>

                {/* Node B Slot */}
                <div 
                  className="path-slot"
                  style={{
                    flex: 1,
                    height: '28px',
                    borderRadius: '4px',
                    border: '1px dashed rgba(255, 187, 0, 0.25)',
                    background: pathEndNode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(0,0,0,0.2)',
                    borderColor: pathEndNode ? '#ef4444' : 'rgba(255, 187, 0, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '9.5px',
                    color: pathEndNode ? '#ef4444' : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    padding: '0 4px'
                  }}
                  title={pathEndNode ? `终点: ${pathEndNode.content}` : '设定终点 B（点击星体并在遥测卡设为终点）'}
                  onClick={() => {
                    if (selectedNode) {
                      setPathEndNode({ id: selectedNode.id, content: selectedNode.content });
                      setFoundPath(null);
                    } else {
                      alert('请先在星系中点击选择一个星体！');
                    }
                  }}
                >
                  {pathEndNode ? `B: ${pathEndNode.content.substring(0, 8)}...` : '设定终点 B'}
                </div>

                {/* Max Depth Input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <label style={{ fontSize: '9px', color: 'rgba(255,187,0,0.7)', whiteSpace: 'nowrap' }}>深度:</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={pathMaxDepth}
                    onChange={(e) => setPathMaxDepth(Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
                    className="sci-control-input"
                    style={{ width: '45px', height: '28px', fontSize: '10px', padding: '2px 6px', textAlign: 'center' }}
                    disabled={pathLoading}
                  />
                </div>

                {/* Find path button */}
                <button
                  type="button"
                  onClick={handleFindPath}
                  disabled={!pathStartNode || !pathEndNode || pathLoading}
                  className="sci-submit-btn bg-cyan"
                  style={{ height: '28px', padding: '0 10px', fontSize: '10px', minWidth: '45px' }}
                >
                  {pathLoading ? '...' : '寻路'}
                </button>
              </div>

              {/* Path Result display */}
              {foundPath && (
                <div 
                  className="path-result-box scrollbar-thin"
                  style={{
                    fontSize: '9px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    borderRadius: '4px',
                    padding: '5px 8px',
                    color: '#e5e7eb',
                    maxHeight: '60px',
                    overflowY: 'auto',
                    lineHeight: '1.4'
                  }}
                >
                  {foundPath.length === 0 ? (
                    <span style={{ color: '#ef4444' }}>未找到连通的引力路径 (Max Depth: {pathMaxDepth})</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ 已打通引力通路:</span>
                      <div>
                        {pathStartNode.content.substring(0, 10)}...
                        {foundPath.map((step, idx) => {
                          const nextNode = graphData.nodes?.find(n => n.id === step.to);
                          const nextLabel = nextNode ? nextNode.content.substring(0, 10) + '...' : `0x${step.to.substring(0, 6)}`;
                          return (
                            <span key={idx}>
                              {' '}→ <span style={{ color: '#00f2fe' }}>[{step.relation}]</span> → {nextLabel}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Telemetry Output Box */}
            <div className="holographic-telemetry-box" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '180px' }}>
              <div className="telemetry-box-header font-mono">
                <span>[ TELEMETRY // 天体遥测 ]</span>
              </div>
              {selectedNode ? (
                <div className="node-telemetry-content font-mono scrollbar-thin" style={{ overflowY: 'auto', flex: 1 }}>
                  <div className="telemetry-info-row">
                    <span className="lbl">天体编号:</span>
                    <span className="val text-cyan" title={selectedNode.id}>0x{selectedNode.id.substring(0, 10)}...</span>
                  </div>

                  <div className="telemetry-info-row">
                    <span className="lbl">引力类别:</span>
                    <span className="val text-muted" title={selectedNode.source}>{selectedNode.source.split(':').pop()}</span>
                  </div>

                  <div className="telemetry-info-row">
                    <span className="lbl">能量能级:</span>
                    <span className="val" style={{ color: selectedNode.is_pinned ? 'hsl(var(--color-cyan))' : 'hsl(var(--color-green))' }}>
                      {selectedNode.is_pinned ? '★ 置顶高频' : '☆ 常规活跃'}
                    </span>
                  </div>

                  {selectedNode.node_type && (
                    <div className="telemetry-info-row">
                      <span className="lbl">节点类型:</span>
                      <span className="val text-cyan">{selectedNode.node_type.toUpperCase()}</span>
                    </div>
                  )}

                  {selectedNode.community_id != null && (
                    <div className="telemetry-info-row">
                      <span className="lbl">所属集群:</span>
                      <span className="val text-cyan">CLUSTER_{selectedNode.community_id}</span>
                    </div>
                  )}

                  {selectedNode.source_file && (
                    <div className="telemetry-info-row" style={{ flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                      <span className="lbl">源文件:</span>
                      <span className="val" style={{ fontSize: '9.5px', wordBreak: 'break-all', color: 'hsl(var(--text-muted))' }}>
                        {selectedNode.source_file}{selectedNode.source_location ? ` @ ${selectedNode.source_location}` : ''}
                      </span>
                    </div>
                  )}

                  <div className="telemetry-info-row">
                    <span className="lbl">调阅频度:</span>
                    <span className="val">{selectedNode.access_count} RC</span>
                  </div>

                  <div className="telemetry-info-row" style={{ flexDirection: 'column', gap: '6px', borderBottom: 'none' }}>
                    <span className="lbl">记忆体质荷 (Payload):</span>
                    <div className="telemetry-payload-box scrollbar-thin" style={{ maxHeight: '90px' }}>
                      {selectedNode.content}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setIsLinking(!isLinking)}
                      className="wm-edit-btn-inline"
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '28px', fontSize: '10px' }}
                    >
                      🔗 连接
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNode(selectedNode.id)}
                      className="wm-del-btn-inline"
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '28px', fontSize: '10px', background: 'rgba(244,63,94,0.04)' }}
                    >
                      ☄ 擦除
                    </button>
                  </div>

                  {/* Path Shortcuts */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setPathStartNode({ id: selectedNode.id, content: selectedNode.content });
                        setFoundPath(null);
                      }}
                      className="wm-edit-btn-inline"
                      style={{ flex: 1, height: '24px', fontSize: '9px', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                    >
                      🚩 设为起点 A
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPathEndNode({ id: selectedNode.id, content: selectedNode.content });
                        setFoundPath(null);
                      }}
                      className="wm-edit-btn-inline"
                      style={{ flex: 1, height: '24px', fontSize: '9px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                    >
                      🏁 设为终点 B
                    </button>
                  </div>

                  {/* Neighbors list */}
                  {detailLoading ? (
                    <div style={{ fontSize: '9.5px', color: 'rgba(255, 187, 0, 0.5)', marginTop: '10px', textAlign: 'center' }}>
                      正在拉取引力邻居数据...
                    </div>
                  ) : nodeDetail?.edges && nodeDetail.edges.length > 0 ? (
                    <div className="telemetry-info-row" style={{ flexDirection: 'column', gap: '6px', borderBottom: 'none', marginTop: '10px' }}>
                      <span className="lbl">关联引力星体 ({nodeDetail.edges.length}):</span>
                      <div className="telemetry-neighbors-box scrollbar-thin" style={{ maxHeight: '100px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                        {nodeDetail.edges.map((edge, idx) => {
                          const nbNode = graphData.nodes?.find(n => n.id === edge.id);
                          const nbLabel = nbNode ? nbNode.content.substring(0, 25) + '...' : `0x${edge.id.substring(0, 8)}`;
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                const mesh = nodeMeshesRef.current?.find(m => m.userData.id === edge.id);
                                if (mesh) {
                                  setSelectedNode(mesh.userData);
                                  const targetPos = new THREE.Vector3()
                                    .copy(mesh.position)
                                    .add(new THREE.Vector3(0, 1.8, 2.5));
                                  targetCamPosRef.current = targetPos;
                                  targetLookAtRef.current.copy(mesh.position);
                                }
                              }}
                              className="neighbor-row"
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '9.5px',
                                padding: '4px 6px',
                                background: 'rgba(255, 187, 0, 0.03)',
                                border: '1px solid rgba(255, 187, 0, 0.08)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                color: '#e5e7eb'
                              }}
                            >
                              <span style={{ color: edge.direction === 'out' ? '#ffbb00' : '#00f2fe' }}>
                                {edge.direction === 'out' ? '→' : '←'} [{edge.relation}]
                              </span>
                              <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nbNode?.content}>
                                {nbLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {/* Link Subform */}
                  {isLinking && (
                    <form onSubmit={handleLinkNodes} className="link-sub-form sci-form" style={{ marginTop: '10px', background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,187,0,0.1)' }}>
                      <div className="form-group-sci" style={{ marginBottom: '6px' }}>
                        <label style={{ fontSize: '8px' }}>目标星体</label>
                        <select
                          value={targetLinkId}
                          onChange={(e) => setTargetLinkId(e.target.value)}
                          className="sci-control-select"
                          style={{ height: '26px', fontSize: '10.5px', padding: '2px 4px' }}
                          required
                        >
                          <option value="">-- 选择星球 --</option>
                          {graphData.nodes.filter(n => n.id !== selectedNode.id).map(node => (
                            <option key={node.id} value={node.id}>
                              [{node.source.split(':').pop()}] {node.content.substring(0, 20)}...
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group-sci" style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '8px' }}>引力属性</label>
                        <input
                          type="text"
                          value={relationType}
                          onChange={(e) => setRelationType(e.target.value)}
                          placeholder="relation type"
                          className="sci-control-input"
                          style={{ height: '24px', fontSize: '10.5px', padding: '2px 6px' }}
                          required
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="submit" className="sci-submit-btn bg-cyan" style={{ height: '24px', fontSize: '9px', padding: '0' }}>
                          连接
                        </button>
                        <button type="button" onClick={() => setIsLinking(false)} className="wm-edit-btn-inline" style={{ height: '24px', fontSize: '9px' }}>
                          取消
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                <div className="empty-telemetry font-mono" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '120px', padding: '12px' }}>
                  [ CHOOSENODE // 点击左侧星球以载入遥测参数 ]
                </div>
              )}
            </div>

            </div>
          </GlassCard>
        </div>
      )}

      {/* Holographic Disk Popup */}
      {isConsoleOpen && showControlDial && (
        <div className="holographic-disk-popup">
          <GlassCard
            title={
              <div className="console-popup-header">
                <span>控制罗盘 (ORBIT DIAL)</span>
                <button
                  type="button"
                  onClick={() => setShowControlDial(false)}
                  className="console-close-btn"
                  title="关闭罗盘"
                >
                  ×
                </button>
              </div>
            }
            glowColor="cyan"
            className="hud-card"
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px' }}>
              <div className="holographic-disk-container" style={{ margin: 0 }}>
                {/* Rotating background rings */}
                <svg className="hud-disk-svg" viewBox="0 0 200 200">
                  <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255, 187, 0, 0.03)" strokeWidth="0.8" />
                  <circle cx="100" cy="100" r="76" fill="none" stroke="rgba(255, 187, 0, 0.08)" strokeWidth="1.2" strokeDasharray="10,8" className="spinning-dashed-ring" />
                  <circle cx="100" cy="100" r="58" fill="none" stroke="rgba(0, 242, 254, 0.12)" strokeWidth="1" strokeDasharray="25,10" className="counter-spinning-ring" />
                  <circle cx="100" cy="100" r="40" fill="none" stroke="rgba(255, 187, 0, 0.04)" strokeWidth="0.8" />
                  
                  {/* Horizontal and vertical axis tick lines */}
                  <line x1="100" y1="5" x2="100" y2="195" stroke="rgba(255, 187, 0, 0.04)" strokeWidth="0.8" />
                  <line x1="5" y1="100" x2="195" y2="100" stroke="rgba(255, 187, 0, 0.04)" strokeWidth="0.8" />
                </svg>

                {/* Cardinal controls absolute layout */}
                <div className="disk-controls">
                  <button
                    type="button"
                    onClick={() => setAutoRotate(!autoRotate)}
                    className={`disk-btn-center ${autoRotate ? 'active' : ''}`}
                    title="星系公转 (Spin)"
                  >
                    <div className="pulse-core-hud"></div>
                    <span className="btn-lbl">SPIN</span>
                    <span className="btn-status">{autoRotate ? 'ON' : 'OFF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLayoutMode('galaxy')}
                    className={`disk-btn-cardinal cardinal-top ${layoutMode === 'galaxy' ? 'selected' : ''}`}
                    title="切换到星系漩涡模式 (Spiral)"
                  >
                    漩涡
                  </button>

                  <button
                    type="button"
                    onClick={handleResetCamera}
                    className="disk-btn-cardinal cardinal-right"
                    title="重置观测视角"
                  >
                    重置
                  </button>

                  <button
                    type="button"
                    onClick={() => setLayoutMode('solar')}
                    className={`disk-btn-cardinal cardinal-bottom ${layoutMode === 'solar' ? 'selected' : ''}`}
                    title="切换到天体轨道模式 (Solar)"
                  >
                    轨道
                  </button>

                  <button
                    type="button"
                    onClick={fetchGraph}
                    className="disk-btn-cardinal cardinal-left"
                    title="同步星系图谱"
                  >
                    同步
                  </button>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      <style jsx>{`
        .galaxy-vis-layout {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        .galaxy-canvas-container {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 100%;
          background: rgba(3, 2, 1, 0.85);
          border: 1px solid rgba(255, 187, 0, 0.08);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.95);
          z-index: 1;
        }

        .galaxy-status-hud {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          padding: 12px 20px;
          background: linear-gradient(to bottom, rgba(3, 2, 1, 0.9) 0%, transparent 100%);
          border-bottom: 1px dashed rgba(255, 187, 0, 0.05);
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 10;
        }

        .telemetry-bar {
          display: flex;
          gap: 20px;
          font-size: 10.5px;
          color: hsl(var(--text-muted));
          letter-spacing: 0.5px;
        }

        .scan-line {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 1px;
          background: hsl(var(--color-cyan));
          opacity: 0.35;
        }

        .hud-tooltip {
          position: fixed;
          background: rgba(8, 7, 5, 0.95);
          border: 1px solid hsl(var(--color-cyan));
          box-shadow: 0 0 15px rgba(255, 187, 0, 0.25);
          padding: 8px 12px;
          border-radius: 6px;
          max-width: 250px;
          pointer-events: none;
          z-index: 100;
          font-size: 11px;
        }

        .tooltip-head {
          color: hsl(var(--color-cyan));
          font-weight: bold;
          margin-bottom: 4px;
          font-size: 9px;
        }

        .tooltip-content {
          color: #e5e7eb;
          line-height: 1.4;
        }

        .tooltip-footer {
          margin-top: 6px;
          color: hsl(var(--text-muted));
          font-size: 8.5px;
        }

        .galaxy-hud-panel.popup-console {
          position: absolute;
          right: 20px;
          top: 95px;
          bottom: auto;
          height: auto;
          max-height: calc(100% - 120px);
          width: 340px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          pointer-events: none;
          overflow-y: auto;
          transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .galaxy-hud-panel.popup-console :global(*) {
          pointer-events: auto;
        }

        .holographic-disk-popup {
          position: absolute;
          right: 370px;
          top: 95px;
          width: 220px;
          height: auto;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          pointer-events: auto;
          transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }

        /* Console Toggle Button */
        .console-toggle-btn {
          position: absolute;
          right: 20px;
          top: 54px;
          z-index: 1001;
          background: rgba(3, 2, 1, 0.85);
          border: 1px solid rgba(255, 187, 0, 0.4);
          border-radius: 6px;
          padding: 6px 14px;
          color: hsl(var(--color-cyan));
          font-size: 11px;
          cursor: pointer;
          outline: none;
          box-shadow: 0 0 10px rgba(255, 187, 0, 0.1);
          transition: all 0.2s ease;
        }

        .console-toggle-btn:hover {
          background: rgba(255, 187, 0, 0.1);
          border-color: hsl(var(--color-cyan));
          box-shadow: 0 0 15px rgba(255, 187, 0, 0.3);
        }

        .console-toggle-btn.active {
          background: rgba(255, 102, 0, 0.15);
          border-color: hsl(var(--color-purple));
          color: hsl(var(--color-purple));
          box-shadow: 0 0 12px rgba(255, 102, 0, 0.3);
        }

        /* Close Button in Popup Header */
        .console-close-btn {
          background: transparent;
          border: none;
          color: hsl(var(--text-muted));
          font-size: 18px;
          font-weight: bold;
          cursor: pointer;
          transition: color 0.2s ease;
          padding: 0 4px;
          line-height: 1;
        }

        .console-close-btn:hover {
          color: hsl(var(--color-red));
        }

        .console-popup-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }

        .hud-card {
          background: rgba(6, 4, 3, 0.65) !important;
          border-color: rgba(255, 187, 0, 0.12) !important;
          backdrop-filter: blur(20px) saturate(180%) !important;
          -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
          height: 100%;
        }

        .flex-grow-card {
          display: flex;
          flex-direction: column;
        }

        :global(.flex-grow-card .card-content) {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        /* Holographic Disk Layout */
        .holographic-disk-container {
          position: relative;
          width: 160px;
          height: 160px;
          margin: 4px auto;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .hud-disk-svg {
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
          pointer-events: none;
        }

        .spinning-dashed-ring {
          transform-origin: center;
          animation: spin 30s linear infinite;
        }

        .counter-spinning-ring {
          transform-origin: center;
          animation: spin-back 20s linear infinite;
        }

        @keyframes spin {
          100% { transform: rotate(360deg); }
        }

        @keyframes spin-back {
          100% { transform: rotate(-360deg); }
        }

        .disk-controls {
          position: relative;
          width: 100%;
          height: 100%;
        }

        /* Center Spin button */
        .disk-btn-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 55px;
          height: 55px;
          border-radius: 50%;
          background: rgba(3, 2, 1, 0.9);
          border: 1.5px solid hsl(var(--color-cyan));
          box-shadow: 0 0 15px rgba(255, 187, 0, 0.3);
          color: white;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 10;
          transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          font-family: var(--font-mono);
          outline: none;
        }

        .disk-btn-center:hover {
          background: rgba(255, 187, 0, 0.1);
          box-shadow: 0 0 25px rgba(255, 187, 0, 0.6);
        }

        .disk-btn-center.active {
          border-color: hsl(var(--color-purple));
          box-shadow: 0 0 20px rgba(255, 102, 0, 0.4);
        }

        .pulse-core-hud {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: hsl(var(--color-cyan));
          margin-bottom: 2px;
          animation: pulse 2.5s infinite;
        }

        .disk-btn-center.active .pulse-core-hud {
          background: hsl(var(--color-purple));
        }

        .disk-btn-center .btn-lbl {
          font-size: 8px;
          font-weight: bold;
          letter-spacing: 0.5px;
          line-height: 1;
        }

        .disk-btn-center .btn-status {
          font-size: 7px;
          color: hsl(var(--text-muted));
          margin-top: 1px;
        }

        /* Cardinal Buttons (Top, Right, Bottom, Left) */
        .disk-btn-cardinal {
          position: absolute;
          width: 36px;
          height: 36px;
          font-size: 8px;
          border-radius: 50%;
          background: rgba(8, 7, 5, 0.88);
          border: 1px solid rgba(255, 187, 0, 0.25);
          color: hsl(var(--text-muted));
          font-family: var(--font-mono);
          font-size: 9px;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
          z-index: 5;
          outline: none;
        }

        .disk-btn-cardinal:hover {
          color: white;
          border-color: hsl(var(--color-cyan));
          background: rgba(255, 187, 0, 0.08);
          box-shadow: 0 0 12px rgba(255, 187, 0, 0.25);
        }

        .disk-btn-cardinal.selected {
          color: hsl(var(--color-cyan));
          border-color: hsl(var(--color-cyan));
          background: rgba(255, 187, 0, 0.05);
          box-shadow: 0 0 15px rgba(255, 187, 0, 0.35);
          text-shadow: 0 0 8px rgba(255, 187, 0, 0.5);
        }

        .cardinal-top {
          top: 0;
          left: 50%;
          transform: translateX(-50%);
        }

        .cardinal-right {
          right: 0;
          top: 50%;
          transform: translateY(-50%);
        }

        .cardinal-bottom {
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
        }

        .cardinal-left {
          left: 0;
          top: 50%;
          transform: translateY(-50%);
        }

        /* Holographic Telemetry box styling */
        .holographic-telemetry-box {
          border: 1px solid rgba(255, 187, 0, 0.1);
          border-radius: 6px;
          background: rgba(3, 2, 1, 0.4);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          padding: 10px;
          box-shadow: inset 0 0 10px rgba(255, 187, 0, 0.02);
          position: relative;
        }

        .holographic-telemetry-box::before {
          content: "";
          position: absolute;
          top: -1px;
          left: -1px;
          width: 8px;
          height: 8px;
          border-top: 1.5px solid hsl(var(--color-cyan));
          border-left: 1.5px solid hsl(var(--color-cyan));
          pointer-events: none;
        }

        .holographic-telemetry-box::after {
          content: "";
          position: absolute;
          bottom: -1px;
          right: -1px;
          width: 8px;
          height: 8px;
          border-bottom: 1.5px solid hsl(var(--color-cyan));
          border-right: 1.5px solid hsl(var(--color-cyan));
          pointer-events: none;
        }

        .telemetry-box-header {
          font-size: 9px;
          font-weight: bold;
          color: hsl(var(--color-cyan));
          letter-spacing: 1px;
          margin-bottom: 8px;
          border-bottom: 1px dashed rgba(255, 187, 0, 0.15);
          padding-bottom: 4px;
        }

        .node-telemetry-content {
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        .telemetry-info-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.04);
          font-size: 11px;
        }

        .telemetry-info-row .lbl {
          color: hsl(var(--text-muted));
        }

        .telemetry-payload-box {
          width: 100%;
          flex: 1;
          min-height: 60px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 187, 0, 0.06);
          border-radius: 6px;
          padding: 8px;
          font-size: 10.5px;
          line-height: 1.4;
          color: #e5e7eb;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }

        .empty-telemetry {
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          height: 100%;
          min-height: 120px;
          font-size: 11px;
          color: hsl(var(--text-muted));
          line-height: 1.6;
          padding: 20px;
        }

        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(255, 187, 0, 0.15);
        }

        /* Premium Sci-Fi form controls */
        .form-group-sci {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .form-group-sci label {
          font-size: 9px;
          color: rgba(255, 187, 0, 0.75);
          font-weight: bold;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .sci-control-input, .sci-control-select {
          background: rgba(12, 9, 6, 0.85);
          border: 1px solid rgba(255, 187, 0, 0.25);
          border-radius: 4px;
          color: #ffddaa;
          font-family: var(--font-mono);
          outline: none;
          transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
          width: 100%;
        }

        .sci-control-input:focus, .sci-control-select:focus {
          border-color: hsl(var(--color-cyan));
          box-shadow: 0 0 10px rgba(0, 242, 254, 0.25);
          background: rgba(18, 14, 9, 0.95);
        }

        .sci-control-input::placeholder {
          color: rgba(255, 187, 0, 0.3);
        }

        /* Custom dropdown arrow for select elements */
        .sci-control-select {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background-image: url("data:image/svg+xml;utf8,<svg fill='%23ffbb00' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>");
          background-repeat: no-repeat;
          background-position: right 6px center;
          background-size: 16px;
          padding-right: 24px !important;
        }

        .sci-control-select option {
          background: #0d0905;
          color: #ffddaa;
        }

        /* Premium Custom range slider */
        .sci-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 4px;
          background: rgba(255, 187, 0, 0.15);
          outline: none;
          border-radius: 2px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .sci-slider:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .sci-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #ffbb00;
          box-shadow: 0 0 8px rgba(255, 187, 0, 0.8);
          cursor: pointer;
          transition: transform 0.1s ease, background-color 0.2s ease;
        }

        .sci-slider:not(:disabled)::-webkit-slider-thumb:hover {
          transform: scale(1.25);
          background: #00f2fe;
          box-shadow: 0 0 10px rgba(0, 242, 254, 0.9);
        }

        .sci-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border: none;
          border-radius: 50%;
          background: #ffbb00;
          box-shadow: 0 0 8px rgba(255, 187, 0, 0.8);
          cursor: pointer;
          transition: transform 0.1s ease, background-color 0.2s ease;
        }

        .sci-slider:not(:disabled)::-moz-range-thumb:hover {
          transform: scale(1.25);
          background: #00f2fe;
          box-shadow: 0 0 10px rgba(0, 242, 254, 0.9);
        }

        /* Subform submit button styling */
        .sci-submit-btn {
          border: none;
          border-radius: 4px;
          padding: 4px 10px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s ease;
          color: #030201;
        }

        .sci-submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .bg-cyan {
          background: hsl(var(--color-cyan));
          box-shadow: 0 2px 8px rgba(0, 242, 254, 0.3);
        }
        
        .bg-cyan:hover:not(:disabled) {
          background: #00e0ec;
          box-shadow: 0 4px 12px rgba(0, 242, 254, 0.5);
        }

        /* Inline action buttons */
        .wm-edit-btn-inline, .wm-del-btn-inline {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 187, 0, 0.15);
          color: rgba(255, 255, 255, 0.7);
          border-radius: 3px;
          font-size: 9px;
          padding: 2px 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: var(--font-mono);
        }

        .wm-edit-btn-inline:hover {
          border-color: hsl(var(--color-cyan));
          color: hsl(var(--color-cyan));
          background: rgba(0, 242, 254, 0.05);
          box-shadow: 0 0 8px rgba(0, 242, 254, 0.2);
        }

        .wm-del-btn-inline:hover {
          border-color: hsl(var(--color-red));
          color: hsl(var(--color-red));
          background: rgba(244, 63, 94, 0.08);
          box-shadow: 0 0 8px rgba(244, 63, 94, 0.2);
        }

        .neighbor-row:hover {
          background: rgba(255, 187, 0, 0.1) !important;
          border-color: rgba(255, 187, 0, 0.3) !important;
          color: white !important;
          box-shadow: 0 0 8px rgba(255, 187, 0, 0.15);
        }
      `}</style>
    </div>
  );
}
