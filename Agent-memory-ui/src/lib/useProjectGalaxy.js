import { useEffect, useState } from 'react';
import { api } from './api';

export const GALAXY_LIMIT = 200;

export function useProjectGalaxy(namespace, includeStats = false) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!namespace || namespace === 'all') return;
    let active = true;
    Promise.all([api.getGraphData(namespace, GALAXY_LIMIT), includeStats ? api.graphStats(namespace) : null])
      .then(([graph, stats]) => { if (active) setResult({ namespace, data: { ...graph, stats } }); })
      .catch(failure => { if (active) setResult({ namespace, error: failure.message }); });
    return () => { active = false; };
  }, [namespace, includeStats]);

  return result?.namespace === namespace ? result : null;
}
