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

  if (!headMesh) {
    console.log("No mesh found");
    return;
  }

  console.log("Morph Target Dictionary:", headMesh.morphTargetDictionary);
  
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

  console.log(`Processed coords - Center: (${centerX.toFixed(2)}, ${centerY.toFixed(2)}, ${centerZ.toFixed(2)}), Scale: ${scale.toFixed(6)}`);

  // Print geometry coordinates of morph targets if they exist in morphAttributes
  const morphPos = g.morphAttributes.position;
  if (!morphPos) {
    console.log("No morphAttributes.position found in geometry!");
    return;
  }
  
  console.log(`Found ${morphPos.length} morph attributes.`);
  
  // Let's identify the indices for eyeBlinkLeft, eyeBlinkRight, jawOpen
  const dict = headMesh.morphTargetDictionary || {};
  const blinkLeftIdx = dict['eyeBlinkLeft'] !== undefined ? dict['eyeBlinkLeft'] : dict['eyeBlink_L'];
  const blinkRightIdx = dict['eyeBlinkRight'] !== undefined ? dict['eyeBlinkRight'] : dict['eyeBlink_R'];
  const jawOpenIdx = dict['jawOpen'] !== undefined ? dict['jawOpen'] : dict['mouthOpen'];

  console.log(`Target Indices - blinkLeftIdx: ${blinkLeftIdx}, blinkRightIdx: ${blinkRightIdx}, jawOpenIdx: ${jawOpenIdx}`);

  // Let's find vertices affected by eyeBlinkLeft
  if (blinkLeftIdx !== undefined && morphPos[blinkLeftIdx]) {
    const attr = morphPos[blinkLeftIdx];
    let affectedVerts = [];
    for (let i = 0; i < count; i++) {
      const dx = attr.getX(i);
      const dy = attr.getY(i);
      const dz = attr.getZ(i);
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist > 1.0) { // arbitrary threshold for units (original space)
        // Get the processed, centered, scaled coordinate
        const px = (posAttr.getX(i) - centerX) * scale;
        const py = (posAttr.getY(i) - centerY) * scale;
        const pz = (posAttr.getZ(i) - centerZ) * scale;
        affectedVerts.push({ i, px, py, pz, dist });
      }
    }
    
    console.log(`\nVertices affected by eyeBlinkLeft (Count: ${affectedVerts.length}):`);
    if (affectedVerts.length > 0) {
      const xs = affectedVerts.map(v => v.px);
      const ys = affectedVerts.map(v => v.py);
      const zs = affectedVerts.map(v => v.pz);
      console.log(`  X range: ${Math.min(...xs).toFixed(3)} to ${Math.max(...xs).toFixed(3)}`);
      console.log(`  Y range: ${Math.min(...ys).toFixed(3)} to ${Math.max(...ys).toFixed(3)}`);
      console.log(`  Z range: ${Math.min(...zs).toFixed(3)} to ${Math.max(...zs).toFixed(3)}`);
    }
  }

  // Let's find vertices affected by jawOpen
  if (jawOpenIdx !== undefined && morphPos[jawOpenIdx]) {
    const attr = morphPos[jawOpenIdx];
    let affectedVerts = [];
    for (let i = 0; i < count; i++) {
      const dx = attr.getX(i);
      const dy = attr.getY(i);
      const dz = attr.getZ(i);
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist > 1.0) {
        const px = (posAttr.getX(i) - centerX) * scale;
        const py = (posAttr.getY(i) - centerY) * scale;
        const pz = (posAttr.getZ(i) - centerZ) * scale;
        affectedVerts.push({ i, px, py, pz, dist });
      }
    }
    
    console.log(`\nVertices affected by jawOpen (Count: ${affectedVerts.length}):`);
    if (affectedVerts.length > 0) {
      const xs = affectedVerts.map(v => v.px);
      const ys = affectedVerts.map(v => v.py);
      const zs = affectedVerts.map(v => v.pz);
      console.log(`  X range: ${Math.min(...xs).toFixed(3)} to ${Math.max(...xs).toFixed(3)}`);
      console.log(`  Y range: ${Math.min(...ys).toFixed(3)} to ${Math.max(...ys).toFixed(3)}`);
      console.log(`  Z range: ${Math.min(...zs).toFixed(3)} to ${Math.max(...zs).toFixed(3)}`);
    }
  }

}, (err) => console.error(err));
