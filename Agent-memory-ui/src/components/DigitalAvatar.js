'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export default function DigitalAvatar() {
  const mount = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const host = mount.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      const frame = requestAnimationFrame(() => setStatus('unavailable'));
      return () => cancelAnimationFrame(frame);
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
    const head = new THREE.Group();
    head.rotation.y = -0.24;
    scene.add(head, new THREE.HemisphereLight(0xaddbff, 0x23194a, 1.7));
    const key = new THREE.DirectionalLight(0x9adeff, 3.1);
    key.position.set(-3, 4, 5);
    const rim = new THREE.DirectionalLight(0xb4a3ff, 4.8);
    rim.position.set(3, 0, -4);
    scene.add(key, rim);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    let visible = false;
    let ready = false;
    let lastDraw = -Infinity;
    const draw = () => renderer.render(scene, camera);
    const animate = time => {
      if (time - lastDraw < 31) return;
      lastDraw = time;
      head.rotation.y = -0.24 + Math.sin(time / 2600) * 0.26;
      head.position.y = Math.sin(time / 1900) * 0.04;
      draw();
    };
    const syncAnimation = () => {
      if (motion.matches) {
        head.rotation.y = -0.24;
        head.position.y = 0;
      }
      renderer.setAnimationLoop(visible && ready && !motion.matches ? animate : null);
      if (visible) draw();
    };
    const resize = () => {
      const { clientWidth: width, clientHeight: height } = host;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.position.set(0, 0.08, 4.6 / Math.min(1, camera.aspect));
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      draw();
    };
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(host);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncAnimation();
    });
    visibilityObserver.observe(host);
    motion.addEventListener('change', syncAnimation);

    new GLTFLoader().load('/female_head_final.glb', ({ scene: original }) => {
      const meshes = [];
      original.traverse(object => { if (object.isMesh) meshes.push(object); });
      const source = meshes.find(mesh => mesh.morphTargetInfluences?.length) || meshes[0];
      if (!disposed && source) {
        const geometry = source.geometry.clone();
        // The original face is Y-forward. Match the original viewer's orientation.
        geometry.morphAttributes = {};
        geometry.rotateX(Math.PI / 2).center();
        geometry.computeBoundingBox();
        const scale = 2.12 / geometry.boundingBox.getSize(new THREE.Vector3()).y;
        geometry.scale(scale, scale, scale);
        head.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
          color: 0x3678a8, emissive: 0x102e61, emissiveIntensity: 0.4, metalness: 0.48, roughness: 0.42,
        })));
        const lines = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), new THREE.LineBasicMaterial({
          color: 0xa1e4ff, transparent: true, opacity: 0.24,
        }));
        lines.scale.setScalar(1.003);
        head.add(lines);
        ready = true;
        setStatus('ready');
        syncAnimation();
      } else if (!disposed) {
        setStatus('unavailable');
      }
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        for (const material of [].concat(mesh.material)) {
          for (const value of Object.values(material)) {
            if (value?.isTexture) value.dispose();
          }
          material.dispose();
        }
      }
    }, undefined, () => { if (!disposed) setStatus('unavailable'); });

    return () => {
      disposed = true;
      sizeObserver.disconnect();
      visibilityObserver.disconnect();
      motion.removeEventListener('change', syncAnimation);
      renderer.setAnimationLoop(null);
      for (const object of head.children) {
        object.geometry.dispose();
        object.material.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <figure className="hologram">
    <div className="hologram-canvas" ref={mount} role="img" aria-label="原版 Agent 数字人三维模型" />
    {status !== 'ready' && <p role="status" className="hologram-message">{status === 'loading' ? '正在载入原版数字人…' : '当前浏览器无法显示 3D 模型'}</p>}
    <figcaption><span>AGENT / 01</span><span>全息数字人</span></figcaption>
  </figure>;
}
