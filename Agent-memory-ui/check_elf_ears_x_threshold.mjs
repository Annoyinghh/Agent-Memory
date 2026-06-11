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

  gCloned.scale(scale, scale, scale);

  let affected = 0;
  let maxNewX = 0;
  let maxNewY = -Infinity;
  let minNewZ = Infinity;

  // Let's print out the vertices with highest X to see their new positions
  const deformedList = [];

  console.log("Simulating with: vx > 0.81, vy >= -0.36, vy <= 0.24, vz >= -0.46, vz <= 0.26");

  for (let i = 0; i < count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);

    // Filter ear root by requiring vx > 0.81
    const isLeftEar = (vx > 0.81 && vy >= -0.36 && vy <= 0.24 && vz >= -0.46 && vz <= 0.26);
    if (isLeftEar) {
      const factorX = (vx - 0.81) / 0.18; // normalized X
      const factorY = (vy - (-0.36)) / 0.60;
      const earWeight = Math.pow(Math.max(0.0, factorX), 1.2) * Math.pow(Math.max(0.0, factorY), 1.1);
      
      if (earWeight > 0.0) {
        const newX = vx + 0.25 * earWeight; // slightly larger stretch for elven beauty
        const newY = vy + 0.22 * earWeight; // stretch upwards
        const newZ = vz - 0.22 * earWeight; // sweep back
        
        if (newX > maxNewX) maxNewX = newX;
        if (newY > maxNewY) maxNewY = newY;
        if (newZ < minNewZ) minNewZ = newZ;
        
        deformedList.push({ i, x: vx, y: vy, z: vz, nx: newX, ny: newY, nz: newZ, weight: earWeight });
        affected++;
      }
    }
  }

  console.log(`Deformation simulation results for Left Ear:`);
  console.log(`  Vertices affected: ${affected}`);
  console.log(`  Max X (stretched out): ${maxNewX.toFixed(4)}`);
  console.log(`  Max Y (stretched up): ${maxNewY.toFixed(4)}`);
  console.log(`  Min Z (stretched back): ${minNewZ.toFixed(4)}`);

  // Let's sort by Y coordinate and print top vertices to make sure they are on the ear, not the temple
  deformedList.sort((a,b) => b.ny - a.ny);
  console.log("\nTop 15 highest deformed vertices:");
  deformedList.slice(0, 15).forEach(v => {
    console.log(`  Idx ${v.i.toString().padStart(4)}: Base X:${v.x.toFixed(3)} Y:${v.y.toFixed(3)} Z:${v.z.toFixed(3)} | New X:${v.nx.toFixed(3)} Y:${v.ny.toFixed(3)} Z:${v.nz.toFixed(3)} Weight:${v.weight.toFixed(3)}`);
  });

}, (err) => console.error(err));
