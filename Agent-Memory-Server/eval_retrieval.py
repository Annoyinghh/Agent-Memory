"""Evaluate real default embeddings on an isolated corpus, with legacy baseline.

Run with the project interpreter. First run may download Chroma's embedding model.
The bundled seed is synthetic regression data, not evidence of production gains.
"""
import argparse
import json
import math
import os
from pathlib import Path
import statistics
import tempfile
import time
from memory_engine import MemoryEngine


def legacy_search(engine, namespace, query, top_k=20):
    # Frozen pre-upgrade candidate/scoring behavior. New corpus timestamps are
    # equal and stats neutral, so old decay/importance cannot change its order.
    scores = {}
    try:
        expression = f'namespace:"{namespace}" AND content:"{query}"'
        rows = engine.conn.execute('SELECT id FROM memory_fts WHERE memory_fts MATCH ? LIMIT ?', (expression,top_k*2))
        scores.update((r[0],1.0) for r in rows)
    except Exception:
        pass
    result = engine.collection.query(query_texts=[query], n_results=top_k*2, where={'namespace':namespace})
    for doc_id, distance in zip(result['ids'][0],result['distances'][0]):
        scores[doc_id] = scores.get(doc_id,0) + max(0,1-distance/2)
    return sorted(scores,key=lambda doc_id:-scores[doc_id])[:top_k]


def summarize(rows):
    positive = [r for r in rows if r['relevant_ids']]
    negative = [r for r in rows if not r['relevant_ids']]
    metrics = {'queries':len(rows)}
    for k in (5,20):
        metrics[f'recall@{k}'] = statistics.mean(len(set(r['ids'][:k]) & set(r['relevant_ids']))/len(r['relevant_ids']) for r in positive) if positive else None
    reciprocal, ndcg = [], []
    for row in positive:
        gains = [int(i in row['relevant_ids']) for i in row['ids'][:10]]
        reciprocal.append(next((1/(i+1) for i,g in enumerate(gains) if g),0))
        dcg = sum(g/math.log2(i+2) for i,g in enumerate(gains))
        ideal = sum(1/math.log2(i+2) for i in range(min(10,len(row['relevant_ids']))))
        ndcg.append(dcg/ideal)
    metrics['mrr@10'] = statistics.mean(reciprocal) if reciprocal else None
    metrics['ndcg@10'] = statistics.mean(ndcg) if ndcg else None
    # No confidence gate exists yet: returning candidates isn't accepting an answer.
    metrics['no_answer_nonempty_rate'] = statistics.mean(bool(r['ids']) for r in negative) if negative else None
    latencies=sorted(r['ms'] for r in rows)
    metrics['p50_ms']=statistics.median(latencies)
    metrics['p95_ms']=latencies[max(0,math.ceil(len(latencies)*.95)-1)]
    return metrics


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset',type=Path,default=Path(__file__).parent/'evaluation/seed.json')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    dataset=json.loads(args.dataset.read_text(encoding='utf-8'))
    report={'dataset':str(args.dataset),'description':dataset.get('description'),'embedding':'Chroma default', 'results':{}}
    with tempfile.TemporaryDirectory(prefix='agent-memory-eval-') as folder:
        engine=MemoryEngine(folder)
        try:
            start=time.perf_counter()
            for doc in dataset['corpus']:
                engine.insert_memory(doc['id'],doc['namespace'],doc['content'],doc['source'])
                if engine.pending_vector_sync():
                    raise RuntimeError('Embedding/indexing failed; refusing a misleading quality benchmark')
            report['index_seconds']=time.perf_counter()-start
            engine.collection.query(query_texts=['warmup'],n_results=1)
            for method in ['legacy','bm25','dense','rrf']:
                os.environ['MEMORY_SEARCH_MODE']=method if method!='legacy' else 'rrf'
                rows=[]
                for case in dataset['queries']:
                    start=time.perf_counter()
                    if method=='legacy':
                        ids=legacy_search(engine,case['namespace'],case['query'])
                    else:
                        results,diagnostics=engine.search_with_diagnostics(case['namespace'],case['query'],20)
                        if diagnostics['degraded_channels']:
                            raise RuntimeError(f'Degraded evaluation: {diagnostics}')
                        ids=[r.id for r in results]
                    rows.append({**case,'ids':ids,'ms':(time.perf_counter()-start)*1000})
                report['results'][method]={
                    split:summarize([r for r in rows if r['split']==split]) for split in ['dev','holdout']
                }
                report['results'][method]['details']=rows
        finally:
            engine.close()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({m:{k:v for k,v in r.items() if k!='details'} for m,r in report['results'].items()},indent=2))


if __name__=='__main__':
    main()
