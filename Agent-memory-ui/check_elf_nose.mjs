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
  const deformedList = [];

  for (let i = 0; i < count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);

    // Bounding box for nose tip region
    const isNoseTip = (Math.abs(vx) <= 0.15 && vy >= -0.38 && vy <= -0.16 && vz >= 1.0 && vz <= 1.23);
    if (isNoseTip) {
      const dx = vx / 0.14;
      const dy = (vy - (-0.27)) / 0.11;
      const dz = (vz - 1.225) / 0.225;
      const distSq = dx * dx + dy * dy + dz * dz;
      
      if (distSq < 1.0) {
        const noseWeight = Math.pow(1.0 - Math.sqrt(distSq), 1.5);
        if (noseWeight > 0.0) {
          const newX = vx * (1.0 - 0.20 * noseWeight);
          const newY = vy + 0.012 * noseWeight;
          const newZ = vz + 0.038 * noseWeight;
          
          deformedList.push({ i, x: vx, y: vy, z: vz, nx: newX, ny: newY, nz: newZ, weight: noseWeight });
          affected++;
        }
      }
    }
  }

  console.log(`Nose tip deformation simulation results:`);
  console.log(`  Vertices affected: ${affected}`);
  
  // Sort by new Z descending
  deformedList.sort((a,b) => b.nz - a.nz);
  console.log("\nTop 15 furthest forward nose vertices after deformation:");
  deformedList.slice(0, 15).forEach(v => {
    console.log(`  Idx ${v.i.toString().padStart(4)}: Base X:${v.x.toFixed(3)} Y:${v.y.toFixed(3)} Z:${v.z.toFixed(3)} | New X:${v.nx.toFixed(3)} Y:${v.ny.toFixed(3)} Z:${v.nz.toFixed(3)} Weight:${v.weight.toFixed(3)}`);
  });

}, (err) => console.error(err));
