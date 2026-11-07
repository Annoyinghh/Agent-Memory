'use client';

import { useEffect, useRef, useState } from 'react';

export default function GalaxyMap({ nodes, edges, selectedId, onSelect, sample = false, children }) {
  const mount = useRef(null);
  const scene = useRef(null);
  const selection = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    selection.current = { selectedId, edges };
    scene.current?.select(selectedId, edges);
  }, [selectedId, edges]);

  useEffect(() => {
    const host = mount.current;
    let active = true;
    import('@/lib/galaxyScene').then(({ mountGalaxy }) => {
      if (!active) return;
      scene.current = mountGalaxy(host, nodes, onSelect);
      const current = selection.current;
      if (current) scene.current.select(current.selectedId, current.edges);
      setStatus('ready');
    }).catch(() => { if (active) setStatus('unavailable'); });
    return () => {
      active = false;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [nodes, onSelect]);

  return <div className="galaxy-map">
    <div className="galaxy-viewport">
      <div ref={mount} className="galaxy-surface" role="img" aria-label="四旋臂三维星系。带光环的星点代表可选代码节点。" />
      <div className="galaxy-reticle" aria-hidden="true" />
      <div className="galaxy-hud"><span>{sample ? '样例航区' : '项目航区'}</span><span>{String(nodes.length).padStart(2, '0')} 节点</span></div>
      {status !== 'ready' && <p className="galaxy-message" role="status">{status === 'loading' ? '正在绘制旋臂…' : '当前设备无法绘制 3D 星系，请用节点目录查看源码。'}</p>}
    </div>
    <div className="galaxy-command">
      {children}
      <div className="galaxy-controls" role="group" aria-label="星系视角">
        <button className="flight-key" type="button" disabled={status !== 'ready'} onClick={() => scene.current?.zoom(0.8)} aria-label="缩小星系">−</button>
        <button className="flight-key" type="button" disabled={status !== 'ready'} onClick={() => scene.current?.zoom(1.25)} aria-label="放大星系">＋</button>
        <button className="flight-key" type="button" disabled={status !== 'ready'} onClick={() => scene.current?.reset()}>复位</button>
      </div>
    </div>
  </div>;
}
