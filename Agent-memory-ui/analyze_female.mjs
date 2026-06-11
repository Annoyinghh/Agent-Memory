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
  
  const g = headMesh.geometry.clone();
  // Align as done in DigitalAvatar.js:
  g.rotateX(Math.PI / 2);
  g.center();
  g.computeBoundingBox();
  const bb = g.boundingBox;
  
  console.log('Original Centered BBox min:', bb.min.x.toFixed(3), bb.min.y.toFixed(3), bb.min.z.toFixed(3));
  console.log('Original Centered BBox max:', bb.max.x.toFixed(3), bb.max.y.toFixed(3), bb.max.z.toFixed(3));
  
  const pos = g.attributes.position;
  const count = pos.count;
  
  // Crop as done in code
  const thresholdY = bb.min.y; // Keep all vertices since thresholdY is bb.min.y for facecap model
  
  let minX = Infinity, maxX = -Infinity;
  let keptMinY = Infinity, keptMaxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (let i = 0; i < count; i++) {
    const vy = pos.getY(i);
    const visible = vy >= thresholdY;
    if (visible) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
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
  
  console.log('\nProcessed Coordinates (After Center & Scale):');
  console.log('Center offset:', centerX.toFixed(4), centerY.toFixed(4), centerZ.toFixed(4));
  console.log('Scale factor:', scale.toFixed(4));
  
  // Analyze front-facing vertices:
  let frontVerts = [];
  for (let i = 0; i < count; i++) {
    const x = (pos.getX(i) - centerX) * scale;
    const y = (pos.getY(i) - centerY) * scale;
    const z = (pos.getZ(i) - centerZ) * scale;
    
    // Front face: z > 0.4
    if (z > 0.4) {
      frontVerts.push({ i, x, y, z });
    }
  }
  
  console.log('Total front-facing vertices (z > 0.4):', frontVerts.length);
  
  // Print Y distribution in bins of 0.1
  const bins = {};
  frontVerts.forEach(v => {
    const b = Math.floor(v.y * 10) / 10;
    bins[b] = (bins[b] || 0) + 1;
  });
  
  console.log('\nY coordinate distribution of front face:');
  Object.keys(bins).sort((a,b) => parseFloat(a) - parseFloat(b)).forEach(k => {
    const val = parseFloat(k);
    const label = `${val.toFixed(1).padStart(5)} to ${(val + 0.1).toFixed(1)}`;
    const bar = '█'.repeat(Math.min(40, Math.floor(bins[k] / 5)));
    console.log(`  ${label}: ${bins[k].toString().padStart(4)} verts ${bar}`);
  });

}, (err) => console.error(err));
