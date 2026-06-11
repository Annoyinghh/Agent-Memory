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

  // Apply scale
  gCloned.scale(scale, scale, scale);

  let affected = 0;
  let maxNewX = 0;
  let maxNewY = -Infinity;
  let minNewZ = Infinity;

  for (let i = 0; i < count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);

    const isLeftEar = (vx > 0.74 && vy >= -0.36 && vy <= 0.24 && vz >= -0.46 && vz <= 0.26);
    if (isLeftEar) {
      const factorX = (vx - 0.74) / 0.25;
      const factorY = (vy - (-0.36)) / 0.60;
      const earWeight = Math.pow(Math.max(0.0, factorX), 1.2) * Math.pow(Math.max(0.0, factorY), 1.1);
      
      if (earWeight > 0.0) {
        const newX = vx + 0.22 * earWeight;
        const newY = vy + 0.18 * earWeight;
        const newZ = vz - 0.18 * earWeight;
        
        if (newX > maxNewX) maxNewX = newX;
        if (newY > maxNewY) maxNewY = newY;
        if (newZ < minNewZ) minNewZ = newZ;
        affected++;
      }
    }
  }

  console.log(`Deformation simulation results for Left Ear:`);
  console.log(`  Vertices affected: ${affected}`);
  console.log(`  Max X (stretched out): ${maxNewX.toFixed(4)} (was ~0.989)`);
  console.log(`  Max Y (stretched up): ${maxNewY.toFixed(4)} (was ~0.232)`);
  console.log(`  Min Z (stretched back): ${minNewZ.toFixed(4)} (was ~-0.447)`);

}, (err) => console.error(err));
