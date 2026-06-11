'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useApp } from '@/context/AppContext';

export default function DigitalAvatar() {
  const containerRef = useRef(null);
  const { lastEvent, stats, avatarMuted } = useApp();
  
  const [subtitle, setSubtitle] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechText, setSpeechText] = useState('全息脑记忆系统连接成功。核心数据载入就绪。');
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  
  const isSpeakingRef = useRef(false);
  const isTypingRef = useRef(false);
  const isSpeakingAudioRef = useRef(false);
  const synthRef = useRef(null);
  const utteranceRef = useRef(null);
  const hasSpokenFirstTimeRef = useRef(false);

  // Helper to sync speaking status from both audio speech and typewriter typing
  const updateSpeakingState = () => {
    const active = isTypingRef.current || isSpeakingAudioRef.current;
    console.log("[DigitalAvatar] updateSpeakingState - active:", active, "isTyping:", isTypingRef.current, "isSpeakingAudio:", isSpeakingAudioRef.current);
    setIsSpeaking(active);
    isSpeakingRef.current = active;
  };

  // Define speech texts based on event types
  useEffect(() => {
    if (!lastEvent) return;

    let text = '';
    const totalNs = Object.keys(stats.namespaces || {}).length;
    
    switch (lastEvent.type) {
      case 'init_silent':
        text = '';
        break;
      case 'init':
        text = `全息助手系统初始化完成。核心连接就绪，当前数据库包含 ${totalNs} 个命名空间，共计 ${stats.total_chunks} 个知识点分块。随时待命。`;
        break;
      case 'online':
        text = `网络同步已就绪。检测到本地记忆库状态良好，总内存区块：${stats.total_chunks} 个，分布于 ${totalNs} 个命名空间中。核心健康度 100%。`;
        break;
      case 'insert':
        text = `检测到知识存入事件！已向命名空间 [ ${lastEvent.namespace || '默认'} ] 成功注入一条来源于 [ ${lastEvent.source || '未知'} ] 的新记忆。区块索引已同步更新。`;
        break;
      case 'delete':
        text = `警报：遗忘指令已执行。已从命名空间 [ ${lastEvent.namespace || '默认'} ] 中擦除指定记忆节点。受影响的分块数量已从底层同步扣除。`;
        break;
      case 'snapshot':
        text = `注意，高优先级快照已冷冻！已为命名空间 [ ${lastEvent.namespace || '默认'} ] 捕获了当前的认知边界与核心架构快照。后续 Agent 检索将优先以此为准。`;
        break;
      default:
        text = lastEvent.message || '系统状态更新完毕。';
    }

    setSpeechText(text);
  }, [lastEvent, stats]);

  // Intercept and swallow SpeechSynthesis errors to prevent Next.js red crash overlay
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const originalError = console.error;
    console.error = (...args) => {
      const isSpeechError = args.some(arg => 
        (typeof arg === 'string' && (arg.includes('Speech synthesis') || arg.includes('speechSynthesis'))) ||
        (arg && typeof arg === 'object' && (
          (arg.message && (arg.message.includes('Speech synthesis') || arg.message.includes('speechSynthesis'))) ||
          (arg.type === 'error' && arg.target && arg.target instanceof SpeechSynthesisUtterance)
        ))
      );
      if (isSpeechError) {
        console.warn('[Speech Intercepted]', ...args);
        return;
      }
      originalError.apply(console, args);
    };
    return () => {
      console.error = originalError;
    };
  }, []);

  // Run Speech synthesis when speechText changes
  useEffect(() => {
    if (!isModelLoaded) return;
    if (typeof window === 'undefined') return;
    synthRef.current = window.speechSynthesis;

    if (!speechText) {
      isSpeakingAudioRef.current = false;
      updateSpeakingState();
      return;
    }

    if (synthRef.current) {
      try {
        synthRef.current.cancel();
      } catch (err) {
        // Silently catch browser cancellation bugs
      }
    }

    if (!avatarMuted && speechText && synthRef.current) {
      isSpeakingAudioRef.current = true;
      updateSpeakingState();

      const utterance = new SpeechSynthesisUtterance(speechText);
      utteranceRef.current = utterance;
      
      utterance.onstart = () => {
        hasSpokenFirstTimeRef.current = true;
      };

      const voices = synthRef.current.getVoices();
      let zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
      
      const preferredVoices = ['Xiaoxiao', 'Yunxi', 'Tingting', 'Google', 'Lando'];
      for (const name of preferredVoices) {
        const found = voices.find(v => (v.lang.includes('zh') || v.lang.includes('CN')) && v.name.includes(name));
        if (found) {
          zhVoice = found;
          break;
        }
      }

      if (zhVoice) {
        utterance.voice = zhVoice;
      }
      utterance.pitch = 1.0;
      utterance.rate = 1.0;

      utterance.onend = () => {
        isSpeakingAudioRef.current = false;
        updateSpeakingState();
      };

      utterance.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.warn('Speech synthesis minor warning:', e.error);
        }
        isSpeakingAudioRef.current = false;
        updateSpeakingState();
      };

      try {
        synthRef.current.speak(utterance);
      } catch (err) {
        isSpeakingAudioRef.current = false;
        updateSpeakingState();
      }
    } else {
      isSpeakingAudioRef.current = false;
      updateSpeakingState();
    }
  }, [speechText, avatarMuted, isModelLoaded]);

  // Autoplay voice fallback on first interaction
  useEffect(() => {
    if (!isModelLoaded) return;
    if (typeof window === 'undefined') return;
    const handleFirstInteraction = () => {
      if (!hasSpokenFirstTimeRef.current && speechText) {
        hasSpokenFirstTimeRef.current = true;
        if (synthRef.current && !avatarMuted) {
          try {
            synthRef.current.cancel();
            const utterance = new SpeechSynthesisUtterance(speechText);
            utteranceRef.current = utterance;
            
            const voices = synthRef.current.getVoices();
            let zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
            const preferredVoices = ['Xiaoxiao', 'Yunxi', 'Tingting', 'Google', 'Lando'];
            for (const name of preferredVoices) {
              const found = voices.find(v => (v.lang.includes('zh') || v.lang.includes('CN')) && v.name.includes(name));
              if (found) {
                zhVoice = found;
                break;
              }
            }
            if (zhVoice) utterance.voice = zhVoice;
            utterance.pitch = 1.0;
            utterance.rate = 1.0;
            
            utterance.onstart = () => {
              hasSpokenFirstTimeRef.current = true;
            };
            utterance.onend = () => {
              isSpeakingAudioRef.current = false;
              updateSpeakingState();
            };
            utterance.onerror = () => {
              isSpeakingAudioRef.current = false;
              updateSpeakingState();
            };
            
            isSpeakingAudioRef.current = true;
            updateSpeakingState();
            synthRef.current.speak(utterance);
          } catch (e) {
            console.warn('First interaction speech failed:', e);
            isSpeakingAudioRef.current = false;
            updateSpeakingState();
          }
        }
      }
    };
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);
    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, [speechText, avatarMuted, isModelLoaded]);

  // Typewriter effect
  useEffect(() => {
    if (!isModelLoaded) return;
    if (!speechText) {
      setSubtitle('全息系统已连接，控制端就绪。');
      isTypingRef.current = false;
      updateSpeakingState();
      return;
    }
    
    isTypingRef.current = true;
    updateSpeakingState();

    let index = 0;
    setSubtitle('');
    const interval = setInterval(() => {
      index++;
      setSubtitle(speechText.slice(0, index));
      if (index >= speechText.length) {
        clearInterval(interval);
        isTypingRef.current = false;
        updateSpeakingState();
      }
    }, 120);

    return () => clearInterval(interval);
  }, [speechText, isModelLoaded]);

  // Three.js 3D Loaded Holographic Head implementation
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    
    let targetCameraZ = 4.2;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 4.2;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);

    // Particle texture
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);
    const texture = new THREE.CanvasTexture(canvas);

    // Track mouse relative coordinates
    const mouse = { x: 0, y: 0 };
    const handleMouseMove = (event) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);

    let animId = null;
    let clock = new THREE.Clock();
    let headPoints = null;
    let headWireframe = null;
    let headSolid = null;
    let pointsShaderMaterial = null;
    let originalPositions = null;
    let headGeometry = null;
    const avatarState = { isVertexVisible: null };

    // Flat arrays to cache rotated/scaled morph target offsets
    let blinkL_dx = null, blinkL_dy = null, blinkL_dz = null;
    let blinkR_dx = null, blinkR_dy = null, blinkR_dz = null;
    let jawOpen_dx = null, jawOpen_dy = null, jawOpen_dz = null;

    // Blinking state
    let nextBlinkTime = 3.0 + Math.random() * 4.0;
    let lastBlinkTime = 0;
    const blinkDuration = 0.20;

    // Glitch state
    let nextGlitchTime = 1.0;
    let glitchEndTime = 0;
    let isGlitching = false;

    // Additional premium visual effects states
    let fresnelShaderMaterial = null;
    let dustPoints = null;
    let dustGeometry = null;
    let dustSpeeds = [];

    // Load glTF model dynamically to avoid Next.js SSR build errors
    import('three/examples/jsm/loaders/GLTFLoader').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      loader.load('/female_head_final.glb', (gltf) => {
          let headMesh = null;
          // Prefer mesh with morph targets (the face mesh in facecap model)
          gltf.scene.traverse((child) => {
            if (child.isMesh && child.morphTargetInfluences && child.morphTargetInfluences.length > 0) {
              headMesh = child;
            }
          });
          if (!headMesh) {
            gltf.scene.traverse((child) => {
              if (child.isMesh && !headMesh) headMesh = child;
            });
          }

          if (headMesh) {
          headGeometry = headMesh.geometry;
          // Apply corrective rotation to orient the raw geometry:
          // Face points along +Z, top of head along +Y, chin along -Y
          headGeometry.rotateX(Math.PI / 2);
          headGeometry.center();
          headGeometry.computeBoundingBox();
          
          const oldBbox = headGeometry.boundingBox;
          const minY = oldBbox.min.y;
          const maxY = oldBbox.max.y;
          const height = maxY - minY;
          
          // Female facecap model is already just a head, keep all vertices
          const thresholdY = minY;

          const posAttr = headGeometry.attributes.position;
          const normAttr = headGeometry.attributes.normal;
          const count = posAttr.count;
          
          // Compute bounding box of all vertices to scale/center specifically for the head
          let minX = Infinity, maxX = -Infinity;
          let keptMinY = Infinity, keptMaxY = -Infinity;
          let minZ = Infinity, maxZ = -Infinity;
          
          avatarState.isVertexVisible = new Uint8Array(count);

          for (let i = 0; i < count; i++) {
            const vx = posAttr.getX(i);
            const vy = posAttr.getY(i);
            const vz = posAttr.getZ(i);

            const visible = (vy >= thresholdY);
            avatarState.isVertexVisible[i] = visible ? 1 : 0;
            
            if (visible) {
              if (vx < minX) minX = vx;
              if (vx > maxX) maxX = vx;
              if (vy < keptMinY) keptMinY = vy;
              if (vy > keptMaxY) keptMaxY = vy;
              if (vz < minZ) minZ = vz;
              if (vz > maxZ) maxZ = vz;
            }
          }

          // Center relative to the head bounding box
          const centerX = (minX + maxX) / 2;
          const centerY = (keptMinY + keptMaxY) / 2;
          const centerZ = (minZ + maxZ) / 2;

          for (let i = 0; i < count; i++) {
            if (avatarState.isVertexVisible[i]) {
              posAttr.setX(i, posAttr.getX(i) - centerX);
              posAttr.setY(i, posAttr.getY(i) - centerY);
              posAttr.setZ(i, posAttr.getZ(i) - centerZ);
            } else {
              posAttr.setX(i, 0);
              posAttr.setY(i, 0);
              posAttr.setZ(i, 0);
            }
          }

          const headWidth = maxX - minX;
          const headHeight = keptMaxY - keptMinY;
          const headDepth = maxZ - minZ;
          const maxDim = Math.max(headWidth, headHeight, headDepth);
          
           // Scale based on head dimensions to zoom in
          const scale = 2.45 / maxDim; // slightly larger zoom
          headGeometry.scale(scale, scale, scale);

          console.log("[DigitalAvatar] Loader Success - centerX:", centerX.toFixed(4), "centerY:", centerY.toFixed(4), "centerZ:", centerZ.toFixed(4), "scale:", scale.toFixed(6));
          console.log("[DigitalAvatar] Loader Success - vertex 1601 pos:", posAttr.getX(1601).toFixed(4), posAttr.getY(1601).toFixed(4), posAttr.getZ(1601).toFixed(4));

          // Store initial positions for voice ripple (extract X,Y,Z cleanly for interleaved attributes)
          originalPositions = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) {
            originalPositions[i * 3] = posAttr.getX(i);
            originalPositions[i * 3 + 1] = posAttr.getY(i);
            originalPositions[i * 3 + 2] = posAttr.getZ(i);
          }

          // Cache morph targets if they exist
          const morphPos = headGeometry.morphAttributes ? headGeometry.morphAttributes.position : null;
          if (morphPos) {
            const dict = headMesh.morphTargetDictionary || {};
            const blinkLIdx = dict['eyeBlink_L'];
            const blinkRIdx = dict['eyeBlink_R'];
            const jawOpenIdx = dict['jawOpen'];

            if (blinkLIdx !== undefined && morphPos[blinkLIdx]) {
              const attr = morphPos[blinkLIdx];
              blinkL_dx = new Float32Array(count);
              blinkL_dy = new Float32Array(count);
              blinkL_dz = new Float32Array(count);
              for (let i = 0; i < count; i++) {
                blinkL_dx[i] = attr.getX(i) * scale;
                blinkL_dy[i] = -attr.getZ(i) * scale;
                blinkL_dz[i] = attr.getY(i) * scale;
              }
            }

            if (blinkRIdx !== undefined && morphPos[blinkRIdx]) {
              const attr = morphPos[blinkRIdx];
              blinkR_dx = new Float32Array(count);
              blinkR_dy = new Float32Array(count);
              blinkR_dz = new Float32Array(count);
              for (let i = 0; i < count; i++) {
                blinkR_dx[i] = attr.getX(i) * scale;
                blinkR_dy[i] = -attr.getZ(i) * scale;
                blinkR_dz[i] = attr.getY(i) * scale;
              }
            }

            if (jawOpenIdx !== undefined && morphPos[jawOpenIdx]) {
              const attr = morphPos[jawOpenIdx];
              jawOpen_dx = new Float32Array(count);
              jawOpen_dy = new Float32Array(count);
              jawOpen_dz = new Float32Array(count);
              for (let i = 0; i < count; i++) {
                jawOpen_dx[i] = attr.getX(i) * scale;
                jawOpen_dy[i] = -attr.getZ(i) * scale;
                jawOpen_dz[i] = attr.getY(i) * scale;
              }
            }
          }

          // Filter index buffer to remove any triangles using hidden vertices
          const indexAttr = headGeometry.index;
          if (indexAttr) {
            const oldIndices = indexAttr.array;
            const newIndices = [];
            for (let i = 0; i < oldIndices.length; i += 3) {
              const idx0 = oldIndices[i];
              const idx1 = oldIndices[i + 1];
              const idx2 = oldIndices[i + 2];
              
              if (avatarState.isVertexVisible[idx0] && avatarState.isVertexVisible[idx1] && avatarState.isVertexVisible[idx2]) {
                newIndices.push(idx0, idx1, idx2);
              }
            }
            headGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(newIndices), 1));
          }

          // Generate colors based on normal vector (front is cyan, sides/back are dark blue, no purple!)
          const colorsArr = new Float32Array(count * 3);
          const colorCyan = new THREE.Color(0x00f2fe);
          const colorBlue = new THREE.Color(0x0077ff);
          const colorDarkBlue = new THREE.Color(0x001144); // pure deep blue, no purple

          const bottomY = (thresholdY - centerY) * scale;
          const fadeRange = 0.24; // smooth fade-out over 0.24 units of height

          const visibilityArr = new Float32Array(count);

          for (let i = 0; i < count; i++) {
            const zVal = posAttr.getZ(i);
            const yVal = posAttr.getY(i);
            const visible = avatarState.isVertexVisible[i];
            
            visibilityArr[i] = visible ? 1.0 : 0.0;
            
            let baseColor = new THREE.Color();
            if (visible) {
              const nz = normAttr ? normAttr.getZ(i) : 0;
              const forwardRatio = Math.max(0.0, Math.min(1.0, nz));
              
              if (forwardRatio > 0.5) {
                // Front parts: mix blue and cyan
                baseColor.lerpColors(colorBlue, colorCyan, (forwardRatio - 0.5) * 2.0);
              } else {
                // Side parts: mix dark blue and blue
                baseColor.lerpColors(colorDarkBlue, colorBlue, forwardRatio * 2.0);
              }
              
              // Fade back of head slightly
              if (zVal > 0) {
                baseColor.multiplyScalar(0.75 + zVal * 0.25);
              } else {
                baseColor.multiplyScalar(0.75 + zVal * 0.75);
              }
              
              // Smoothly fade out near the bottom boundary
              if (yVal < bottomY + fadeRange) {
                const fadeFactor = Math.max(0.0, (yVal - bottomY) / fadeRange);
                baseColor.multiplyScalar(fadeFactor);
              }
            } else {
              baseColor.setRGB(0, 0, 0); // Hide completely
            }
            colorsArr[i * 3] = baseColor.r;
            colorsArr[i * 3 + 1] = baseColor.g;
            colorsArr[i * 3 + 2] = baseColor.b;
          }
          headGeometry.setAttribute('aColor', new THREE.BufferAttribute(colorsArr, 3));
          headGeometry.setAttribute('aVisibility', new THREE.BufferAttribute(visibilityArr, 1));

          // Fresnel Glow Material for the solid head backing (depth mask)
          fresnelShaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
              glowColor: { value: new THREE.Color(0x00a2ff) }, // pure blue glow
              innerColor: { value: new THREE.Color(0x000511) }, // dark space blue
              power: { value: 2.2 },
              opacity: { value: 0.85 },
              bottomY: { value: bottomY },
              fadeRange: { value: fadeRange },
              uTime: { value: 0.0 }
            },
            vertexShader: `
              attribute float aVisibility;
              varying float vVisibility;
              varying vec3 vNormal;
              varying vec3 vPositionNormal;
              varying vec3 vPosition;
              void main() {
                vVisibility = aVisibility;
                vNormal = normalize(normalMatrix * normal);
                vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `,
            fragmentShader: `
              uniform vec3 glowColor;
              uniform vec3 innerColor;
              uniform float power;
              uniform float opacity;
              uniform float bottomY;
              uniform float fadeRange;
              uniform float uTime;
              varying float vVisibility;
              varying vec3 vNormal;
              varying vec3 vPositionNormal;
              varying vec3 vPosition;
              void main() {
                if (vVisibility < 0.5) {
                  discard;
                }
                vec3 viewDir = normalize(-vPositionNormal);
                vec3 norm = normalize(vNormal);
                float intensity = pow(1.0 - max(0.0, dot(norm, viewDir)), power);
                
                // Add a dynamic energy ripple along the face's Y coordinates
                float pulse = sin(vPosition.y * 4.0 - uTime * 3.0) * 0.5 + 0.5;
                vec3 pulseColor = mix(glowColor, vec3(0.0, 1.0, 0.85), pulse * 0.3);
                
                vec3 finalColor = mix(innerColor, pulseColor, intensity);
                
                float alpha = mix(opacity * 0.45, opacity, intensity);
                if (vPosition.y < bottomY + fadeRange) {
                  float fadeFactor = max(0.0, (vPosition.y - bottomY) / fadeRange);
                  alpha *= fadeFactor;
                }
                
                gl_FragColor = vec4(finalColor, alpha);
              }
            `,
            transparent: true,
            depthWrite: true,
            depthTest: true,
            blending: THREE.NormalBlending,
            polygonOffset: true,
            polygonOffsetFactor: 1.0,
            polygonOffsetUnits: 1.0
          });

          headSolid = new THREE.Mesh(headGeometry, fresnelShaderMaterial);
          scene.add(headSolid);

          // Points (Point Cloud) using Custom Shader Material to discard mouth interior
          pointsShaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
              uSize: { value: 0.024 },
              uTexture: { value: texture },
              uTime: { value: 0.0 }
            },
            vertexShader: `
              uniform float uSize;
              uniform float uTime;
              attribute float aVisibility;
              attribute vec3 aColor;
              varying float vVisibility;
              varying vec3 vColor;
              varying vec3 vPosition;
              void main() {
                vVisibility = aVisibility;
                vPosition = position;
                
                // Add a dynamic wave color highlight flowing up the face in vertex shader
                float wave = sin(position.y * 2.5 - uTime * 1.8) * 0.5 + 0.5;
                // Bright cyan energy wave sweep
                vColor = mix(aColor, vec3(0.1, 0.95, 1.0), wave * 0.28);
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = uSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
              }
            `,
            fragmentShader: `
              uniform sampler2D uTexture;
              uniform float uTime;
              varying float vVisibility;
              varying vec3 vColor;
              varying vec3 vPosition;
              void main() {
                if (vVisibility < 0.5) {
                  discard;
                }
                vec4 texColor = texture2D(uTexture, gl_PointCoord);
                if (texColor.a < 0.1) discard;
                
                // Add high-frequency digital shimmer based on screen coordinates and time
                float shimmer = sin(gl_FragCoord.x * 0.15 + gl_FragCoord.y * 0.23 + uTime * 6.0) * 0.5 + 0.5;
                vec3 finalColor = vColor * (0.82 + shimmer * 0.18);
                
                gl_FragColor = vec4(finalColor * texColor.rgb, 0.95);
              }
            `,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending
          });
          headPoints = new THREE.Points(headGeometry, pointsShaderMaterial);
          scene.add(headPoints);

          // Wireframe Mesh using Custom Shader Material to discard mouth interior
          const lineShaderMaterial = new THREE.ShaderMaterial({
            vertexShader: `
              attribute float aVisibility;
              attribute vec3 aColor;
              varying float vVisibility;
              varying vec3 vColor;
              void main() {
                vVisibility = aVisibility;
                vColor = aColor;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `,
            fragmentShader: `
              varying float vVisibility;
              varying vec3 vColor;
              void main() {
                if (vVisibility < 0.5) {
                  discard;
                }
                gl_FragColor = vec4(vColor, 0.42);
              }
            `,
            wireframe: true,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending
          });
          // headWireframe = new THREE.Mesh(headGeometry, lineShaderMaterial);
          // scene.add(headWireframe);

          // Create ambient data dust (floating digital memory particles)
          const dustCount = 120;
          dustGeometry = new THREE.BufferGeometry();
          const dustPositions = new Float32Array(dustCount * 3);
          dustSpeeds = [];
          
          for (let i = 0; i < dustCount; i++) {
            // Distribute in a cylinder surrounding the head
            const angle = Math.random() * Math.PI * 2;
            const radius = 0.55 + Math.random() * 1.6;
            const x = Math.cos(angle) * radius;
            const y = (Math.random() - 0.5) * 3.6;
            const z = Math.sin(angle) * radius + (Math.random() - 0.5) * 0.6;
            
            dustPositions[i * 3] = x;
            dustPositions[i * 3 + 1] = y;
            dustPositions[i * 3 + 2] = z;
            
            dustSpeeds.push({
              speedY: 0.10 + Math.random() * 0.16,
              amplitude: 0.03 + Math.random() * 0.07,
              freq: 0.7 + Math.random() * 1.3,
              phase: Math.random() * Math.PI * 2
            });
          }
          
          dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
          
          const dustTextureCanvas = document.createElement('canvas');
          dustTextureCanvas.width = 16;
          dustTextureCanvas.height = 16;
          const dtCtx = dustTextureCanvas.getContext('2d');
          const dtGrad = dtCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
          dtGrad.addColorStop(0, 'rgba(0, 242, 254, 1)'); 
          dtGrad.addColorStop(0.35, 'rgba(0, 119, 255, 0.7)'); 
          dtGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          dtCtx.fillStyle = dtGrad;
          dtCtx.fillRect(0, 0, 16, 16);
          const dustTexture = new THREE.CanvasTexture(dustTextureCanvas);
          
          const dustMaterial = new THREE.PointsMaterial({
            size: 0.05,
            map: dustTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.8
          });
          
          dustPoints = new THREE.Points(dustGeometry, dustMaterial);
          scene.add(dustPoints);
 
          // Start loop
          animate();
          setIsModelLoaded(true);
        }
      }, undefined, (err) => {
        console.warn('Failed to load 3D model:', err);
      });
    });
    const animate = () => {
      animId = requestAnimationFrame(animate);
      
      const time = clock.getElapsedTime();
      const isSpeakingVal = isSpeakingRef.current;

      // Smoothly lerp camera position Z based on container width
      camera.position.z += (targetCameraZ - camera.position.z) * 0.05;
      
      if (isSpeakingVal && Math.random() < 0.01) {
        console.log("[DigitalAvatar] animate - mouth animating, talkCycle:", Math.sin(time * 14));
      }

      // Natural eye blinking: random intervals (minimum 3.0s, max 8.0s)
      let blinkFactor = 0.0;
      const timeSinceLastBlink = time - lastBlinkTime;
      if (timeSinceLastBlink > nextBlinkTime) {
        lastBlinkTime = time;
        nextBlinkTime = 3.0 + Math.random() * 5.0; // next blink in 3 to 8 seconds (typical human frequency minimum 3s)
      }
      if (timeSinceLastBlink < blinkDuration) {
        blinkFactor = Math.sin((timeSinceLastBlink / blinkDuration) * Math.PI);
      }

      // Holographic current glitch state update
      if (time > nextGlitchTime) {
        if (Math.random() < 0.40) { // 40% chance to glitch when timer fires
          isGlitching = true;
          glitchEndTime = time + 0.08 + Math.random() * 0.12; // lasts 80ms to 200ms
        }
        nextGlitchTime = time + 1.5 + Math.random() * 2.5; // check again in 1.5 to 4 seconds
      }
      if (isGlitching && time > glitchEndTime) {
        isGlitching = false;
      }

      // Idle floating breath translations and rotations
      const floatOffsetY = Math.sin(time * 1.2) * 0.04;
      const floatTiltX = Math.sin(time * 0.6) * 0.02;
      const floatTiltZ = Math.cos(time * 0.8) * 0.02;

      // Interact with mouse occasionally (natural glance breathing)
      // Oscillate glance interest between 0.0 (focused forward) and 1.0 (looking at mouse)
      const glanceWeight = Math.max(0.0, Math.sin(time * 0.3) * 0.8 + 0.2); 
      const targetRotX = -mouse.y * 0.25 * glanceWeight + floatTiltX;
      const targetRotY = mouse.x * 0.30 * glanceWeight;
      const targetRotZ = floatTiltZ;

      const lerpSpeed = 0.035; // slower, natural, weighted look-at rotation

      if (headPoints && headGeometry) {
        headPoints.position.y = floatOffsetY;
        if (headWireframe) headWireframe.position.y = floatOffsetY;
        if (headSolid) headSolid.position.y = floatOffsetY;

        headPoints.rotation.x += (targetRotX - headPoints.rotation.x) * lerpSpeed;
        headPoints.rotation.y += (targetRotY - headPoints.rotation.y) * lerpSpeed;
        headPoints.rotation.z += (targetRotZ - headPoints.rotation.z) * lerpSpeed;

        if (headWireframe) headWireframe.rotation.copy(headPoints.rotation);
        if (headSolid) headSolid.rotation.copy(headPoints.rotation);
      }

      if (pointsShaderMaterial) {
        pointsShaderMaterial.uniforms.uTime.value = time;
        if (isSpeakingVal) {
          pointsShaderMaterial.uniforms.uSize.value = 0.032 + Math.sin(time * 20) * 0.003;
        } else {
          pointsShaderMaterial.uniforms.uSize.value = 0.024 + Math.sin(time * 1.5) * 0.0015;
        }
 
        // Apply glitch size flicker (flicker point size to look like power signal fluctuations)
        if (isGlitching) {
          pointsShaderMaterial.uniforms.uSize.value *= (0.6 + Math.random() * 0.6);
        }
      }
 
      if (fresnelShaderMaterial) {
        fresnelShaderMaterial.uniforms.uTime.value = time;
        // Slowly pulse backing opacity and power to create a heartbeat glow
        fresnelShaderMaterial.uniforms.power.value = 2.2 + Math.sin(time * 2.0) * 0.3;
        fresnelShaderMaterial.uniforms.opacity.value = 0.82 + Math.sin(time * 3.5) * 0.08;
      }

      if (headPoints && headGeometry) {
        // Voice ripple effect and morph target animations on positions
        const posAttr = headGeometry.attributes.position;
        const count = posAttr.count;

        for (let i = 0; i < count; i++) {
          if (avatarState.isVertexVisible && avatarState.isVertexVisible[i] === 0) {
            // Keep collapsed at origin, do not animate
            posAttr.setXYZ(i, 0, 0, 0);
            continue;
          }
          const baseX = originalPositions[i * 3];
          const baseY = originalPositions[i * 3 + 1];
          const baseZ = originalPositions[i * 3 + 2];
          
          let offsetX = 0;
          let offsetY = 0;
          let offsetZ = Math.sin(time * 4 + baseY * 3) * 0.006;

          // Eye Blink procedurally (using smooth ellipse falloff to animate the entire eyelid and eye corners)
          if (blinkFactor > 0.0) {
            const eyeCenterY = 0.06;
            const isLeftEye = (baseZ > 0.65 && baseX >= 0.12 && baseX <= 0.64 && baseY >= -0.06 && baseY <= 0.18);
            const isRightEye = (baseZ > 0.65 && baseX <= -0.12 && baseX >= -0.64 && baseY >= -0.06 && baseY <= 0.18);
            
            if (isLeftEye || isRightEye) {
              const eyeCenterX = baseX > 0 ? 0.38 : -0.38;
              const dx = (Math.abs(baseX) - 0.38) / 0.26; // normalized X (slightly larger radius for more corner movement)
              const dy = (baseY - eyeCenterY) / 0.12;     // normalized Y
              const distSq = dx * dx + dy * dy;
              
              if (distSq < 1.0) {
                const weight = Math.cos(Math.sqrt(distSq) * Math.PI * 0.5);
                const distToCenter = baseY - eyeCenterY;
                offsetY = -distToCenter * blinkFactor * weight;
              }
            }
          }

          // speaking mouth animation using jawOpen morph target
          if (isSpeakingVal) {
            const talkCycle = Math.max(0.0, Math.sin(time * 14) * 0.35 + Math.sin(time * 23) * 0.25 + Math.sin(time * 9) * 0.15 + 0.25);
            // Gaping amplitude coefficient for speech (0.5 keeps the mouth movement natural and subtle)
            const speakingAmplitude = 0.5;
            if (jawOpen_dx) {
              offsetX += jawOpen_dx[i] * talkCycle * speakingAmplitude;
              offsetY += jawOpen_dy[i] * talkCycle * speakingAmplitude;
              offsetZ += jawOpen_dz[i] * talkCycle * speakingAmplitude;
            }
          }

          // Electric current glitch / jitter effect (点阵电流抖动特效)
          let jitterX = 0;
          let jitterZ = 0;
          if (isGlitching) {
            // Horizontal slice glitch displacement
            const glitchBandCenter = Math.sin(time * 60) * 0.8;
            const distToBand = Math.abs(baseY - glitchBandCenter);
            if (distToBand < 0.18) {
              jitterX = (Math.random() - 0.5) * 0.06;
              jitterZ = (Math.random() - 0.5) * 0.06;
            } else {
              // General noise during a glitch
              jitterX = (Math.random() - 0.5) * 0.01;
              jitterZ = (Math.random() - 0.5) * 0.01;
            }
          } else {
            // Constant subtle micro-jitter (hologram idle hum) on random points
            if (Math.random() < 0.12) {
              jitterX = (Math.random() - 0.5) * 0.0025;
              jitterZ = (Math.random() - 0.5) * 0.0025;
            }
          }

          offsetX += jitterX;
          offsetZ += jitterZ;

          posAttr.setX(i, baseX + offsetX);
          posAttr.setY(i, baseY + offsetY);
          posAttr.setZ(i, baseZ + offsetZ);
        }
        posAttr.needsUpdate = true;
      }

      // Animate ambient data dust particles (rising quantum memory dust)
      if (dustPoints && dustGeometry) {
        const positions = dustGeometry.attributes.position.array;
        const dustCount = positions.length / 3;
        for (let i = 0; i < dustCount; i++) {
          const speed = dustSpeeds[i];
          positions[i * 3 + 1] += speed.speedY * 0.016; // float up
          positions[i * 3] += Math.sin(time * speed.freq + speed.phase) * speed.amplitude * 0.01; // swirl
          
          // Reset particle if it floats past the top boundary
          if (positions[i * 3 + 1] > 2.0) {
            positions[i * 3 + 1] = -1.8;
            positions[i * 3] = (Math.random() - 0.5) * 3.2;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 2.0;
          }
        }
        dustGeometry.attributes.position.needsUpdate = true;
      }
      
      renderer.render(scene, camera);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        // Use clientWidth/Height of container for exact rendering bounds
        if (!containerRef.current) continue;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        if (w === 0 || h === 0) continue;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);

        // Zoom out when avatar shrinks to narrow column in Search/Ingest tabs
        if (w < 450) {
          targetCameraZ = 6.2;
        } else {
          targetCameraZ = 4.2;
        }
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animId);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      
      if (headGeometry) headGeometry.dispose();
      texture.dispose();
      if (headPoints) headPoints.material.dispose();
      if (headWireframe) headWireframe.material.dispose();
      if (headSolid) headSolid.material.dispose();
    };
  }, []);

  return (
    <div className="avatar-panel">
      <div className="scanner-line"></div>
      
      {/* Symmetrical Sci-fi corner brackets inside panels */}
      <div className="sci-corner corner-tr"></div>
      <div className="sci-corner corner-bl"></div>

      {/* 3D WebGL Canvas Holder */}
      <div ref={containerRef} className="canvas-container" />

      {/* Subtitles / Console Logs Display */}
      <div className="console-wrapper">
        <div className="terminal-header">
          <span className="dot dot-red"></span>
          <span className="dot dot-yellow"></span>
          <span className="dot dot-green"></span>
          <span className="console-label font-mono">NEURAL_AUDIO_FEED // SYS_OK</span>
          <div className="speaker-wave-holder">
            {isSpeaking && (
              <div className="soundwave-container">
                <div className="soundwave-bar animating"></div>
                <div className="soundwave-bar animating"></div>
                <div className="soundwave-bar animating"></div>
                <div className="soundwave-bar animating"></div>
                <div className="soundwave-bar animating"></div>
                <div className="soundwave-bar animating"></div>
              </div>
            )}
          </div>
        </div>
        <div className="console-text font-mono cursor-blink">
          {subtitle || 'STANDBY_'}
        </div>
      </div>

      <style jsx>{`
        .avatar-panel {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          overflow: hidden;
          background: transparent;
          border: none;
          box-shadow: none;
        }

        /* Diagonal corner bracket decoration */
        .sci-corner {
          position: absolute;
          width: 14px;
          height: 14px;
          border: 2px solid hsl(var(--color-cyan));
          pointer-events: none;
        }
        .corner-tr {
          top: 8px;
          right: 8px;
          border-left: none;
          border-bottom: none;
        }
        .corner-bl {
          bottom: 8px;
          left: 8px;
          border-right: none;
          border-top: none;
        }

        .scanner-line {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, transparent, hsl(var(--color-cyan)), transparent);
          box-shadow: 0 0 15px hsl(var(--color-cyan));
          animation: scan-down 6s linear infinite;
          opacity: 0.3;
          z-index: 5;
          pointer-events: none;
        }

        @keyframes scan-down {
          0% { top: -5%; }
          100% { top: 105%; }
        }

        .canvas-container {
          width: 100%;
          height: 100%;
          position: absolute;
          top: 0;
          left: 0;
          z-index: 1;
        }

        .console-wrapper {
          position: relative;
          bottom: 0;
          width: 100%;
          max-width: 100%;
          background: rgba(5, 4, 3, 0.85);
          border: 1px solid rgba(255, 187, 0, 0.2);
          border-radius: 10px;
          padding: 16px;
          box-shadow: inset 0 0 15px rgba(255, 187, 0, 0.04), 0 10px 40px rgba(0, 0, 0, 0.8);
          z-index: 100;
          opacity: 0.48;
          transition: opacity 0.3s ease;
          margin-top: auto;
        }

        .console-wrapper:hover {
          opacity: 1.0;
        }

        .console-label {
          font-size: 10px;
          color: hsl(var(--text-muted));
          letter-spacing: 1px;
          flex: 1;
        }

        .speaker-wave-holder {
          height: 25px;
          display: flex;
          align-items: center;
        }

        .console-text {
          font-size: 13px;
          color: hsl(var(--color-cyan));
          line-height: 1.6;
          min-height: 48px;
          white-space: pre-wrap;
          word-break: break-all;
          text-shadow: 0 0 8px rgba(255, 187, 0, 0.35);
        }
      `}</style>
    </div>
  );
}
