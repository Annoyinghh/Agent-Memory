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

  const dict = headMesh.morphTargetDictionary || {};
  console.log("Morph Target Dictionary:", dict);
  
  const blinkLeftIdx = dict['eyeBlink_L'];
  const blinkRightIdx = dict['eyeBlink_R'];
  const morphPos = g.morphAttributes.position;

  if (blinkLeftIdx !== undefined && morphPos[blinkLeftIdx]) {
    const attr = morphPos[blinkLeftIdx];
    let minPX = Infinity, maxPX = -Infinity;
    let minPY = Infinity, maxPY = -Infinity;
    let minPZ = Infinity, maxPZ = -Infinity;
    let affectedCount = 0;

    for (let i = 0; i < count; i++) {
      const dx = attr.getX(i);
      const dy = attr.getY(i);
      const dz = attr.getZ(i);
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist > 0.01) { // Any movement
        const px = (posAttr.getX(i) - centerX) * scale;
        const py = (posAttr.getY(i) - centerY) * scale;
        const pz = (posAttr.getZ(i) - centerZ) * scale;
        
        if (px < minPX) minPX = px;
        if (px > maxPX) maxPX = px;
        if (py < minPY) minPY = py;
        if (py > maxPY) maxPY = py;
        if (pz < minPZ) minPZ = pz;
        if (pz > maxPZ) maxPZ = pz;
        affectedCount++;
      }
    }
    console.log(`\nLeft Eye (eyeBlink_L) Affected Vertices (Total: ${affectedCount}):`);
    console.log(`  X range: ${minPX.toFixed(4)} to ${maxPX.toFixed(4)}`);
    console.log(`  Y range: ${minPY.toFixed(4)} to ${maxPY.toFixed(4)}`);
    console.log(`  Z range: ${minPZ.toFixed(4)} to ${maxPZ.toFixed(4)}`);
  }

  if (blinkRightIdx !== undefined && morphPos[blinkRightIdx]) {
    const attr = morphPos[blinkRightIdx];
    let minPX = Infinity, maxPX = -Infinity;
    let minPY = Infinity, maxPY = -Infinity;
    let minPZ = Infinity, maxPZ = -Infinity;
    let affectedCount = 0;

    for (let i = 0; i < count; i++) {
      const dx = attr.getX(i);
      const dy = attr.getY(i);
      const dz = attr.getZ(i);
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist > 0.01) {
        const px = (posAttr.getX(i) - centerX) * scale;
        const py = (posAttr.getY(i) - centerY) * scale;
        const pz = (posAttr.getZ(i) - centerZ) * scale;
        
        if (px < minPX) minPX = px;
        if (px > maxPX) maxPX = px;
        if (py < minPY) minPY = py;
        if (py > maxPY) maxPY = py;
        if (pz < minPZ) minPZ = pz;
        if (pz > maxPZ) maxPZ = pz;
        affectedCount++;
      }
    }
    console.log(`\nRight Eye (eyeBlink_R) Affected Vertices (Total: ${affectedCount}):`);
    console.log(`  X range: ${minPX.toFixed(4)} to ${maxPX.toFixed(4)}`);
    console.log(`  Y range: ${minPY.toFixed(4)} to ${maxPY.toFixed(4)}`);
    console.log(`  Z range: ${minPZ.toFixed(4)} to ${maxPZ.toFixed(4)}`);
  }

  // Also let's check jawOpen and mouthClose target ranges!
  const jawOpenIdx = dict['jawOpen'];
  if (jawOpenIdx !== undefined && morphPos[jawOpenIdx]) {
    const attr = morphPos[jawOpenIdx];
    let minPX = Infinity, maxPX = -Infinity;
    let minPY = Infinity, maxPY = -Infinity;
    let minPZ = Infinity, maxPZ = -Infinity;
    let affectedCount = 0;

    for (let i = 0; i < count; i++) {
      const dx = attr.getX(i);
      const dy = attr.getY(i);
      const dz = attr.getZ(i);
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist > 0.01) {
        const px = (posAttr.getX(i) - centerX) * scale;
        const py = (posAttr.getY(i) - centerY) * scale;
        const pz = (posAttr.getZ(i) - centerZ) * scale;
        
        if (px < minPX) minPX = px;
        if (px > maxPX) maxPX = px;
        if (py < minPY) minPY = py;
        if (py > maxPY) maxPY = py;
        if (pz < minPZ) minPZ = pz;
        if (pz > maxPZ) maxPZ = pz;
        affectedCount++;
      }
    }
    console.log(`\nJaw Open (jawOpen) Affected Vertices (Total: ${affectedCount}):`);
    console.log(`  X range: ${minPX.toFixed(4)} to ${maxPX.toFixed(4)}`);
    console.log(`  Y range: ${minPY.toFixed(4)} to ${maxPY.toFixed(4)}`);
    console.log(`  Z range: ${minPZ.toFixed(4)} to ${maxPZ.toFixed(4)}`);
  }

}, (err) => console.error(err));
