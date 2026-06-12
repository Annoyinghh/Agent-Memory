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
    if (!mountRef.current) return;

    // 1. Initialize Scene & Camera
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    
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
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

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
        if (!mountRef.current || !camera || !renderer) continue;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        if (w === 0 || h === 0) continue;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    if (mountRef.current) {
      resizeObserver.observe(mountRef.current);
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
      if (rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.domElement.removeEventListener('mousemove', onMouseMove);
        rendererRef.current.domElement.removeEventListener('click', onClick);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mountRef.current && renderer.domElement) {
        try {
          mountRef.current.removeChild(renderer.domElement);
        } catch (e) {
          // ignore already removed
        }
      }
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

    // Filter nodes by query (highlight match)
    const normalizedQuery = searchQuery.toLowerCase().trim();

    nodeMeshesRef.current = [];
    const idToMesh = {};

    // 1. Draw Orbit Ring guides and place planet nodes
    nodes.forEach((node, i) => {
      // Calculate planet visual properties
      const isPinned = node.is_pinned;
      const size = isPinned ? 0.35 : 0.16;
      
      // Node Color Scheme matching system (Cyber Gold for pinned/snapshots, Orange/Cyan/Silver for standard)
      let color = 0x8a2be2; // Default orange/purple tint
      if (isPinned) color = 0xffaa00; // Bright Gold
      else if (node.source.includes('snapshot')) color = 0xff5500; // Orange snapshot
      else if (node.source.includes('code')) color = 0x00f2fe; // Light cyan codebase node
      else color = 0xcccccc; // Silver/White manual insertion

      const geom = new THREE.SphereGeometry(size, 16, 16);
      
      // Node selection overlay / highlight
      const mat = new THREE.MeshPhongMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.15,
        shininess: 90,
        specular: 0xffffff
      });

      const mesh = new THREE.Mesh(geom, mat);
      
      // Position calculation based on layout modes
      let r = 0;
      let angle = 0;
      let y = 0;

      if (layoutMode === 'galaxy') {
        // Arrange in a dual logarithmic spiral arm galaxy
        const armIndex = i % 2;
        const normalizedIndex = i / nodes.length;
        r = 1.0 + 5.0 * normalizedIndex + Math.random() * 0.15;
        angle = normalizedIndex * Math.PI * 4 + (armIndex * Math.PI);
        y = (Math.random() - 0.5) * 0.35 + (r * 0.05); // Thin disk thickness
      } else {
        // Arrange in concentric circular solar system orbits
        const numConcentricOrbits = Math.max(3, Math.ceil(nodes.length / 4));
        const orbitIndex = i % numConcentricOrbits;
        r = 1.3 + (4.5 * (orbitIndex / numConcentricOrbits)) + (Math.random() * 0.1);
        angle = (i * (Math.PI * 2 / 5)) + (Math.random() * 0.15); // Disperse around orbit track
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

      // Glowing cyan laser link lines
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x00f2fe,
        transparent: true,
        opacity: 0.16 + (edge.confidence * 0.2),
        blending: THREE.AdditiveBlending
      });

      const line = new THREE.Line(lineGeo, lineMat);
      
      // Store references to dynamically update links as nodes revolve
      line.userData = {
        sourceId: edge.source,
        targetId: edge.target
      };
      
      edgesGroup.add(line);
    });

  }, [graphData, layoutMode, searchQuery, relationFilter]);

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
            <span>[ NODECOUNT: {graphData.nodes?.length || 0} ]</span>
            <span>[ EDGECOUNT: {graphData.edges?.length || 0} ]</span>
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
            
            {/* Holographic Disk Dial (SVG background + Cardinal buttons) */}
            <div className="holographic-disk-container">
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
                {/* Center Core Button: Play/Pause */}
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

                {/* Top: Spiral layout */}
                <button
                  type="button"
                  onClick={() => setLayoutMode('galaxy')}
                  className={`disk-btn-cardinal cardinal-top ${layoutMode === 'galaxy' ? 'selected' : ''}`}
                  title="切换到星系漩涡模式 (Spiral)"
                >
                  漩涡
                </button>

                {/* Right: Reset camera */}
                <button
                  type="button"
                  onClick={handleResetCamera}
                  className="disk-btn-cardinal cardinal-right"
                  title="重置观测视角"
                >
                  重置
                </button>

                {/* Bottom: Solar layout */}
                <button
                  type="button"
                  onClick={() => setLayoutMode('solar')}
                  className={`disk-btn-cardinal cardinal-bottom ${layoutMode === 'solar' ? 'selected' : ''}`}
                  title="切换到天体轨道模式 (Solar)"
                >
                  轨道
                </button>

                {/* Left: Sync data */}
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
      `}</style>
    </div>
  );
}
