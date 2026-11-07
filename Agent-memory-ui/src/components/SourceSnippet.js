'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function SourceSnippet({ namespace, nodeId, contextLines = 6, loadingText = '正在读取源码…' }) {
  const requestKey = JSON.stringify([namespace, nodeId, contextLines]);
  const [response, setResponse] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api.getCodeSnippet(namespace, nodeId, null, contextLines, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setResponse({ requestKey, result });
      })
      .catch(error => {
        if (!controller.signal.aborted) setResponse({ requestKey, result: { error: error.message } });
      });
    return () => controller.abort();
  }, [namespace, nodeId, contextLines, requestKey]);

  const result = response?.requestKey === requestKey ? response.result : null;
  const text = result ? result.snippet || result.message || result.error || '当前没有可读源码' : loadingText;
  return <pre className="source-reader">{text}</pre>;
}
