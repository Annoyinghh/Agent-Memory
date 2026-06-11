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
  if (!mesh) {
    gltf.scene.traverse(c => { if (c.isMesh && !mesh) mesh = c; });
  }
  
  const g = mesh.geometry.clone();
  const pos = g.attributes.position;
  
  console.log('--- Step 1: Raw Geometry Vertex 1601 ---');
  console.log(`x: ${pos.getX(1601).toFixed(4)}, y: ${pos.getY(1601).toFixed(4)}, z: ${pos.getZ(1601).toFixed(4)}`);
  
  g.rotateX(Math.PI / 2);
  console.log('\n--- Step 2: After rotateX(Math.PI / 2) ---');
  console.log(`x: ${pos.getX(1601).toFixed(4)}, y: ${pos.getY(1601).toFixed(4)}, z: ${pos.getZ(1601).toFixed(4)}`);
  
  g.center();
  console.log('\n--- Step 3: After center() ---');
  console.log(`x: ${pos.getX(1601).toFixed(4)}, y: ${pos.getY(1601).toFixed(4)}, z: ${pos.getZ(1601).toFixed(4)}`);
  
  g.computeBoundingBox();
  const bb = g.boundingBox;
  console.log('BBox min:', bb.min.x.toFixed(1), bb.min.y.toFixed(1), bb.min.z.toFixed(1));
  console.log('BBox max:', bb.max.x.toFixed(1), bb.max.y.toFixed(1), bb.max.z.toFixed(1));
  
  const thresholdY = bb.min.y;
  let minX = Infinity, maxX = -Infinity;
  let keptMinY = Infinity, keptMaxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (let i = 0; i < pos.count; i++) {
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
  
  console.log('\n--- Step 4: Computed Center Offset ---');
  console.log(`centerX: ${centerX.toFixed(4)}, centerY: ${centerY.toFixed(4)}, centerZ: ${centerZ.toFixed(4)}`);
  
  const headWidth = maxX - minX;
  const headHeight = keptMaxY - keptMinY;
  const headDepth = maxZ - minZ;
  const maxDim = Math.max(headWidth, headHeight, headDepth);
  const scale = 2.45 / maxDim;
  
  console.log('\n--- Step 5: BBox Dimensions & Scale ---');
  console.log(`Width: ${headWidth.toFixed(1)}, Height: ${headHeight.toFixed(1)}, Depth: ${headDepth.toFixed(1)}`);
  console.log(`maxDim: ${maxDim.toFixed(1)}, scale: ${scale.toFixed(6)}`);
  
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) - centerX);
    pos.setY(i, pos.getY(i) - centerY);
    pos.setZ(i, pos.getZ(i) - centerZ);
  }
  
  console.log('\n--- Step 6: After manual centering offset ---');
  console.log(`x: ${pos.getX(1601).toFixed(4)}, y: ${pos.getY(1601).toFixed(4)}, z: ${pos.getZ(1601).toFixed(4)}`);
  
  g.scale(scale, scale, scale);
  console.log('\n--- Step 7: After scale() ---');
  console.log(`x: ${pos.getX(1601).toFixed(4)}, y: ${pos.getY(1601).toFixed(4)}, z: ${pos.getZ(1601).toFixed(4)}`);

}, (err) => console.error(err));
