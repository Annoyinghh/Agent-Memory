import * as fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const data = fs.readFileSync('E:/Agent-Memory/Agent-memory-ui/public/female_head_final.glb');
const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

const loader = new GLTFLoader();
loader.parse(ab, '', (gltf) => {
  console.log('All nodes in GLTF:');
  gltf.scene.traverse(c => {
    if (c.isMesh) {
      console.log(`Mesh Name: "${c.name || 'unnamed'}"`);
      console.log(`  - Geometry vertex count: ${c.geometry.attributes.position.count}`);
      console.log(`  - Morph targets: ${c.morphTargetInfluences ? c.morphTargetInfluences.length : 0}`);
      console.log(`  - Material name: ${c.material ? c.material.name : 'none'}`);
    } else {
      console.log(`Node Name: "${c.name || 'unnamed'}" (${c.type})`);
    }
  });
}, (err) => console.error(err));
