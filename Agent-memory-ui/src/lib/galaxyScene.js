import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ARMS = 4;
const STAR_COUNT = 3200;
const PALETTE = [0xc4b5ff, 0x8ad7ff, 0xf9b288, 0xf096cf].map(color => new THREE.Color(color));
const CORE = new THREE.Color(0xffe1b7);
const FRAME = 70;

function randomSource() {
  let seed = 62191;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function spiral(arm, radius, spread = 0) {
  return arm * Math.PI * 2 / ARMS + radius * 0.057 + spread;
}

function dust() {
  const rand = randomSource();
  return Array.from({ length: STAR_COUNT }, (_, index) => {
    const arm = index % ARMS;
    const radius = Math.pow(rand(), 1.34) * 69;
    const width = 0.12 + (1 - radius / 69) * 0.36;
    const angle = spiral(arm, radius, (rand() - rand()) * width);
    const height = (rand() - rand()) * (radius < 16 ? 3.5 + radius * 0.24 : 4.3);
    const color = PALETTE[arm].clone().lerp(CORE, Math.max(0, 1 - radius / 26));
    const mist = index % 7 === 0;
    const size = mist ? 8 + rand() * 13 : 1 + rand() * 3.2;
    const opacity = (mist ? 0.15 : 0.42 + rand() * 0.58) * (1 - radius / 130);
    return { x: Math.cos(angle) * radius, y: height, z: Math.sin(angle) * radius, color, size, opacity };
  });
}

function plotNodes(nodes) {
  const groups = new Map();
  for (const node of nodes) {
    const key = node.community_id ?? (node.source_file || node.source || 'memory');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }
  const arms = Array.from({ length: ARMS }, () => []);
  [...groups.values()].forEach((group, index) => arms[index % ARMS].push(...group));
  return arms.flatMap((arm, sector) => arm.map((node, index) => {
    const radius = 19 + 41 * ((index + 0.65) / Math.max(arm.length, 2));
    const angle = spiral(sector, radius, Math.sin(index * 2.4) * 0.13);
    return { id: node.id, x: radius * Math.cos(angle), y: Math.sin(index) * 2, z: radius * Math.sin(angle), color: PALETTE[sector], size: 15, opacity: 1 };
  }));
}

function pointCloud(stars, kind) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(stars.flatMap(({ x, y, z }) => [x, y, z]), 3));
  geometry.setAttribute('tint', new THREE.Float32BufferAttribute(stars.flatMap(({ color }) => color.toArray()), 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(stars.map(star => star.size), 1));
  geometry.setAttribute('alpha', new THREE.Float32BufferAttribute(stars.map(star => star.opacity), 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 1 }, kind: { value: kind } },
    vertexShader: `
      attribute vec3 tint;
      attribute float size;
      attribute float alpha;
      uniform float scale;
      varying vec3 vTint;
      varying float vAlpha;
      void main() {
        vTint = tint;
        vAlpha = alpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale;
      }`,
    fragmentShader: `
      uniform float kind;
      varying vec3 vTint;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
        float falloff = 1.0 - smoothstep(0.08, 1.0, r);
        float core = 1.0 - smoothstep(0.1, 0.4, r);
        float ring = smoothstep(0.57, 0.67, r) * (1.0 - smoothstep(0.73, 0.83, r));
        float glow = falloff * falloff;
        gl_FragColor = vec4(vTint, vAlpha * mix(glow, 0.38 * glow + 0.86 * core + 0.78 * ring, kind));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const cloud = new THREE.Points(geometry, material);
  cloud.frustumCulled = false;
  return cloud;
}

export function mountGalaxy(host, nodes, onSelect) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-FRAME, FRAME, FRAME, -FRAME, 1, 700);
  camera.position.set(0, 135, 124);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minZoom = 0.65;
  controls.maxZoom = 3.4;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.48;
  controls.update();
  controls.saveState();

  const stars = pointCloud(dust(), 0);
  const points = plotNodes(nodes);
  const byId = new Map(points.map(point => [point.id, point]));
  const nodeCloud = pointCloud(points, 1);
  const marker = pointCloud([{ x: 0, y: 0, z: 0, color: CORE, size: 36, opacity: 0.9 }], 1);
  marker.visible = false;
  const links = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
    color: 0xa3d9ff, opacity: 0.44, transparent: true, depthTest: false, depthWrite: false,
  }));
  scene.add(stars, links, nodeCloud, marker);

  let frame = 0;
  const invalidate = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderer.render(scene, camera);
    });
  };
  controls.addEventListener('change', invalidate);
  const resize = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width < 1 || height < 1) return;
    const aspect = width / height;
    const span = FRAME / Math.min(1.4, aspect);
    camera.left = -span * aspect;
    camera.right = span * aspect;
    camera.top = span;
    camera.bottom = -span;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    const scale = pixelRatio * Math.min(1.5, Math.max(0.8, height / 390));
    for (const cloud of [stars, nodeCloud, marker]) cloud.material.uniforms.scale.value = scale;
    invalidate();
  });
  resize.observe(host);

  let down;
  const capture = event => { if (event.isPrimary && event.button === 0) down = event; };
  const cancel = () => { down = undefined; };
  const pick = event => {
    if (!down || event.pointerId !== down.pointerId) return;
    const distance = Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY);
    cancel();
    if (distance > 5) return;
    const bounds = canvas.getBoundingClientRect();
    const projected = new THREE.Vector3();
    let hit;
    let nearest = 13;
    for (const point of points) {
      projected.set(point.x, point.y, point.z).project(camera);
      const x = bounds.left + (projected.x + 1) * bounds.width / 2;
      const y = bounds.top + (1 - projected.y) * bounds.height / 2;
      const offset = Math.hypot(event.clientX - x, event.clientY - y);
      if (offset < nearest) { hit = point; nearest = offset; }
    }
    if (hit) onSelect(hit.id);
  };
  canvas.addEventListener('pointerdown', capture);
  canvas.addEventListener('pointerup', pick);
  canvas.addEventListener('pointercancel', cancel);
  invalidate();

  return {
    select(id, edges) {
      const selected = byId.get(id);
      marker.visible = !!selected;
      if (selected) marker.position.set(selected.x, selected.y, selected.z);
      const vertices = [];
      for (const edge of edges) {
        if (edge.source !== id && edge.target !== id) continue;
        const from = byId.get(edge.source), to = byId.get(edge.target);
        if (from && to) vertices.push(from.x, from.y, from.z, to.x, to.y, to.z);
        if (vertices.length >= 32 * 6) break;
      }
      links.geometry.dispose();
      links.geometry = new THREE.BufferGeometry();
      links.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      invalidate();
    },
    zoom(factor) {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom);
      camera.updateProjectionMatrix();
      invalidate();
    },
    reset: () => { controls.reset(); invalidate(); },
    dispose() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.removeEventListener('change', invalidate);
      controls.dispose();
      for (const object of scene.children) {
        object.geometry.dispose();
        object.material.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
