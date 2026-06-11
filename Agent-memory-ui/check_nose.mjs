import * as fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const data = fs.readFileSync('E:/Agent-Memory/Agent-memory-ui/public/female_head_final.glb');
const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

const loader = new GLTFLoader();
loader.parse(ab, '', (gltf) => {
  let headMesh = null;
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

  const g = headMesh.geometry;
  const pos = g.attributes.position;
  const count = pos.count;
  
  const gCloned = g.clone();
  gCloned.rotateX(Math.PI / 2);
  gCloned.center();
  gCloned.computeBoundingBox();
  const bb = gCloned.boundingBox;
  
  const posAttr = gCloned.attributes.position;
  const thresholdY = bb.min.y;
  let minX = Infinity, maxX = -Infinity;
  let keptMinY = Infinity, keptMaxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (let i = 0; i < count; i++) {
    const vy = posAttr.getY(i);
    if (vy >= thresholdY) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      if (vx < minX) minX = vx;
      if (vx > maxX) maxX = vx;
      if (vy < keptMinY) keptMinY = vy;
      if (vy > keptMaxY) keptMaxY = vy;
      if (vz < minZ) minZ = vz;
      if (vz > maxZ) maxZ = vz;
    }
  }
  
  const centerX = (minX + maxX) / 2;
  const centerY = (keptMinY + keptMaxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  
  const headWidth = maxX - minX;
  const headHeight = keptMaxY - keptMinY;
  const headDepth = maxZ - minZ;
  const maxDim = Math.max(headWidth, headHeight, headDepth);
  const scale = 2.45 / maxDim;

  console.log("Inspecting nose vertices (X close to 0, Y in middle of face, Z far forward)...");
  const list = [];
  for (let i = 0; i < count; i++) {
    const vx = (posAttr.getX(i) - centerX) * scale;
    const vy = (posAttr.getY(i) - centerY) * scale;
    const vz = (posAttr.getZ(i) - centerZ) * scale;
    
    // Middle of face: X in [-0.2, 0.2], Y in [-0.5, 0.0], Z > 0.7
    if (Math.abs(vx) < 0.2 && vy >= -0.5 && vy <= 0.0 && vz > 0.7) {
      list.push({ i, x: vx, y: vy, z: vz });
    }
  }

  // Sort by Z coordinate descending (furthest forward point is nose tip!)
  list.sort((a, b) => b.z - a.z);
  console.log(`Top 25 furthest forward nose vertices:`);
  list.slice(0, 25).forEach(v => {
    console.log(`  Index ${v.i.toString().padStart(4)}: X: ${v.x.toFixed(4)} Y: ${v.y.toFixed(4)} Z: ${v.z.toFixed(4)}`);
  });

}, (err) => console.error(err));
