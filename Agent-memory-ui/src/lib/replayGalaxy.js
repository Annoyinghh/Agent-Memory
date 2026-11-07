import replay from '../components/demo-replay.json';

const file = {
  id: 'source_files.py', label: 'source_files.py', node_type: 'file', source_file: 'source_files.py',
  source_location: replay.hits.map(hit => hit.source.split(':').at(-1)).join('、'),
};
const symbols = replay.hits.map(hit => ({
  ...hit,
  label: hit.content.match(/^def (\w+)\(/)?.[1] || hit.source,
  node_type: 'function',
  source_file: file.source_file,
  source_location: hit.source.split(':').at(-1),
}));

export const replayGalaxy = {
  nodes: [file, ...symbols],
  edges: symbols.map(symbol => ({ source: file.id, target: symbol.id, relation: 'contains' })),
};

export const nodeLabel = node => node.label || (node.content || node.id).split('\n')[0].replace(/^label:\s*/, '');
