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

  console.log("Analyzing outer side vertices (ears candidates)...");
  let leftEarVerts = [];
  let rightEarVerts = [];

  for (let i = 0; i < count; i++) {
    const px = (posAttr.getX(i) - centerX) * scale;
    const py = (posAttr.getY(i) - centerY) * scale;
    const pz = (posAttr.getZ(i) - centerZ) * scale;
    
    // Ears are on the sides of the head (X is high, Z is slightly negative or close to 0)
    // Left ear is X > 0.60
    if (px > 0.60 && py >= -0.35 && py <= 0.25 && pz >= -0.45 && pz <= 0.25) {
      leftEarVerts.push({ i, x: px, y: py, z: pz });
    }
    // Right ear is X < -0.60
    if (px < -0.60 && py >= -0.35 && py <= 0.25 && pz >= -0.45 && pz <= 0.25) {
      rightEarVerts.push({ i, x: px, y: py, z: pz });
    }
  }

  console.log(`Left ear vertices found: ${leftEarVerts.length}`);
  if (leftEarVerts.length > 0) {
    const minEY = Math.min(...leftEarVerts.map(v => v.y));
    const maxEY = Math.max(...leftEarVerts.map(v => v.y));
    const minEX = Math.min(...leftEarVerts.map(v => v.x));
    const maxEX = Math.max(...leftEarVerts.map(v => v.x));
    const minEZ = Math.min(...leftEarVerts.map(v => v.z));
    const maxEZ = Math.max(...leftEarVerts.map(v => v.z));
    console.log(`Left Ear boundaries:`);
    console.log(`  X: ${minEX.toFixed(3)} to ${maxEX.toFixed(3)}`);
    console.log(`  Y: ${minEY.toFixed(3)} to ${maxEY.toFixed(3)}`);
    console.log(`  Z: ${minEZ.toFixed(3)} to ${maxEZ.toFixed(3)}`);
  }

  console.log(`Right ear vertices found: ${rightEarVerts.length}`);
  if (rightEarVerts.length > 0) {
    const minEY = Math.min(...rightEarVerts.map(v => v.y));
    const maxEY = Math.max(...rightEarVerts.map(v => v.y));
    const minEX = Math.min(...rightEarVerts.map(v => v.x));
    const maxEX = Math.max(...rightEarVerts.map(v => v.x));
    const minEZ = Math.min(...rightEarVerts.map(v => v.z));
    const maxEZ = Math.max(...rightEarVerts.map(v => v.z));
    console.log(`Right Ear boundaries:`);
    console.log(`  X: ${minEX.toFixed(3)} to ${maxEX.toFixed(3)}`);
    console.log(`  Y: ${minEY.toFixed(3)} to ${maxEY.toFixed(3)}`);
    console.log(`  Z: ${minEZ.toFixed(3)} to ${maxEZ.toFixed(3)}`);
  }

}, (err) => console.error(err));
