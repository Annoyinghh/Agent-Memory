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
  const count = g.attributes.position.count;
  
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
  const blinkLeftIdx = dict['eyeBlink_L'];
  const jawOpenIdx = dict['jawOpen'];
  const morphPos = g.morphAttributes.position;

  if (blinkLeftIdx !== undefined && morphPos[blinkLeftIdx]) {
    console.log("Samples for eyeBlink_L:");
    const attr = morphPos[blinkLeftIdx];
    let printed = 0;
    for (let i = 0; i < count && printed < 5; i++) {
      const dx = attr.getX(i);
      const dy = attr.getY(i);
      const dz = attr.getZ(i);
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist > 50.0) { // arbitrary threshold for GLTF units
        const px = (posAttr.getX(i) - centerX) * scale;
        const py = (posAttr.getY(i) - centerY) * scale;
        const pz = (posAttr.getZ(i) - centerZ) * scale;
        console.log(`Vertex ${i}:`);
        console.log(`  Base Position (scaled/centered): X:${px.toFixed(4)} Y:${py.toFixed(4)} Z:${pz.toFixed(4)}`);
        console.log(`  Raw Morph Delta: dx:${dx.toFixed(1)} dy:${dy.toFixed(1)} dz:${dz.toFixed(1)}`);
        // Let's test the rotated morph delta
        const rdx = dx * scale;
        const rdy = -dz * scale;
        const rdz = dy * scale;
        console.log(`  Rotated & Scaled Delta: dx:${rdx.toFixed(4)} dy:${rdy.toFixed(4)} dz:${rdz.toFixed(4)}`);
        printed++;
      }
    }
  }

}, (err) => console.error(err));
