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
  
  const pos = mesh.geometry.attributes.position;
  console.log('Position attribute class:', pos.constructor.name);
  console.log('Is interleaved:', pos.isInterleavedBufferAttribute ? 'YES' : 'NO');
  if (pos.isInterleavedBufferAttribute) {
    console.log('Interleaved Buffer details:');
    console.log('  - Stride (bytes):', pos.data.stride);
    console.log('  - Count:', pos.count);
    console.log('  - Stride (floats):', pos.data.stride);
    console.log('  - Array length:', pos.data.array.length);
  }
}, (err) => console.error(err));
