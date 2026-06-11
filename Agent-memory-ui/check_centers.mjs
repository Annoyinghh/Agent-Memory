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
  
  // Align as in page.js/DigitalAvatar.js
  const gCloned = g.clone();
  gCloned.rotateX(Math.PI / 2);
  gCloned.center();
  gCloned.computeBoundingBox();
  const bb = gCloned.boundingBox;
  
  const posAttr = gCloned.attributes.position;
  
  // Crop & Scale parameters calculation
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

  const dict = headMesh.morphTargetDictionary || {};
  const blinkLeftIdx = dict['eyeBlink_L'];
  const jawOpenIdx = dict['jawOpen'];
  const mouthCloseIdx = dict['mouthClose'];
  const mouthSmileLeftIdx = dict['mouthSmile_L'];

  const morphPos = g.morphAttributes.position;

  // Let's compute displacement-weighted average for eyeBlink_L (left eye)
  if (blinkLeftIdx !== undefined && morphPos[blinkLeftIdx]) {
    const attr = morphPos[blinkLeftIdx];
    let sumX = 0, sumY = 0, sumZ = 0, sumW = 0;
    for (let i = 0; i < count; i++) {
      const dx = attr.getX(i);
      const dy = attr.getY(i);
      const dz = attr.getZ(i);
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist > 0.1) { // use any significant movement
        const w = dist * dist; // weight by square of displacement
        const px = (posAttr.getX(i) - centerX) * scale;
        const py = (posAttr.getY(i) - centerY) * scale;
        const pz = (posAttr.getZ(i) - centerZ) * scale;
        sumX += px * w;
        sumY += py * w;
        sumZ += pz * w;
        sumW += w;
      }
    }
    console.log(`\nLeft Eye Center (weighted by eyeBlink_L):`);
    console.log(`  X: ${(sumX / sumW).toFixed(4)}`);
    console.log(`  Y: ${(sumY / sumW).toFixed(4)}`);
    console.log(`  Z: ${(sumZ / sumW).toFixed(4)}`);
  }

  // Let's find vertices with large displacement for mouthSmile_L or mouthClose to locate mouth center
  if (mouthSmileLeftIdx !== undefined && morphPos[mouthSmileLeftIdx]) {
    const attr = morphPos[mouthSmileLeftIdx];
    let sumX = 0, sumY = 0, sumZ = 0, sumW = 0;
    for (let i = 0; i < count; i++) {
      const dx = attr.getX(i);
      const dy = attr.getY(i);
      const dz = attr.getZ(i);
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist > 0.1) {
        const w = dist * dist;
        const px = (posAttr.getX(i) - centerX) * scale;
        const py = (posAttr.getY(i) - centerY) * scale;
        const pz = (posAttr.getZ(i) - centerZ) * scale;
        sumX += px * w;
        sumY += py * w;
        sumZ += pz * w;
        sumW += w;
      }
    }
    console.log(`\nMouth Corner Left (weighted by mouthSmile_L):`);
    console.log(`  X: ${(sumX / sumW).toFixed(4)}`);
    console.log(`  Y: ${(sumY / sumW).toFixed(4)}`);
    console.log(`  Z: ${(sumZ / sumW).toFixed(4)}`);
  }

  // Let's compute displacement-weighted average for mouthClose
  if (mouthCloseIdx !== undefined && morphPos[mouthCloseIdx]) {
    const attr = morphPos[mouthCloseIdx];
    let sumX = 0, sumY = 0, sumZ = 0, sumW = 0;
    for (let i = 0; i < count; i++) {
      const dx = attr.getX(i);
      const dy = attr.getY(i);
      const dz = attr.getZ(i);
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist > 0.1) {
        const w = dist * dist;
        const px = (posAttr.getX(i) - centerX) * scale;
        const py = (posAttr.getY(i) - centerY) * scale;
        const pz = (posAttr.getZ(i) - centerZ) * scale;
        sumX += px * w;
        sumY += py * w;
        sumZ += pz * w;
        sumW += w;
      }
    }
    console.log(`\nMouth Center (weighted by mouthClose):`);
    console.log(`  X: ${(sumX / sumW).toFixed(4)}`);
    console.log(`  Y: ${(sumY / sumW).toFixed(4)}`);
    console.log(`  Z: ${(sumZ / sumW).toFixed(4)}`);
  }

}, (err) => console.error(err));
