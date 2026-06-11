import * as fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const data = fs.readFileSync('E:/Agent-Memory/Agent-memory-ui/public/female_head_final.glb');
const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

const loader = new GLTFLoader();
loader.parse(ab, '', (gltf) => {
  let mesh;
  gltf.scene.traverse(c => {
    if (c.isMesh && c.morphTargetInfluences && c.morphTargetInfluences.length > 0) mesh = c;
  });
  
  const g = mesh.geometry.clone();
  g.rotateX(Math.PI / 2);
  g.center();
  g.computeBoundingBox();
  const bb = g.boundingBox;
  
  const pos = g.attributes.position;
  const count = pos.count;
  const thresholdY = bb.min.y;
  
  let minX = Infinity, maxX = -Infinity;
  let keptMinY = Infinity, keptMaxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (let i = 0; i < count; i++) {
    const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
    if (vy >= thresholdY) {
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
  
  let lowerMatches = [];
  let upperMatches = [];
  
  for (let i = 0; i < count; i++) {
    const baseX = (pos.getX(i) - centerX) * scale;
    const baseY = (pos.getY(i) - centerY) * scale;
    const baseZ = (pos.getZ(i) - centerZ) * scale;
    
    const distFromCenter = Math.abs(baseX);
    if (distFromCenter < 0.25 && baseZ > 0.8) {
      if (baseY >= -0.78 && baseY < -0.62) {
        lowerMatches.push({ idx: i, x: baseX, y: baseY, z: baseZ });
      } else if (baseY >= -0.62 && baseY < -0.54) {
        upperMatches.push({ idx: i, x: baseX, y: baseY, z: baseZ });
      }
    }
  }
  
  console.log(`Lower Lip matches (Y in [-0.78, -0.62]): ${lowerMatches.length}`);
  lowerMatches.slice(0, 10).forEach(m => console.log(`  idx=${m.idx} x=${m.x.toFixed(3)} y=${m.y.toFixed(3)} z=${m.z.toFixed(3)}`));
  
  console.log(`\nUpper Lip matches (Y in [-0.62, -0.54]): ${upperMatches.length}`);
  upperMatches.slice(0, 10).forEach(m => console.log(`  idx=${m.idx} x=${m.x.toFixed(3)} y=${m.y.toFixed(3)} z=${m.z.toFixed(3)}`));
  
}, (err) => console.error(err));
