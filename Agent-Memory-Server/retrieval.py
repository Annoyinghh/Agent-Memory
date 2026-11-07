"""Deterministic lexical query construction and rank fusion (no model loading)."""
import re

RRF_K = 60
MAX_RESULTS = 100
MAX_CANDIDATES = 200


def lexical_query(query: str) -> str:
    # User text is never interpreted as FTS operators/column selectors. Split
    # code identifiers and paths too; unicode61 handles contiguous CJK terms.
    terms = list(dict.fromkeys(re.findall(r"[^\W_]+", query, re.UNICODE)))[:64]
    return " OR ".join('"' + term.replace('"', '""') + '"' for term in terms)


def reciprocal_rank_fusion(rankings: dict[str, list[str]]) -> dict[str, float]:
    """Equal-weight RRF, normalized by TWO rank-1 channels, even on failure.

    The score is ranking evidence, never a probability. A single channel's
    top hit scores 0.5. Duplicates within a channel contribute only once.
    """
    scores: dict[str, float] = {}
    for ids in rankings.values():
        for rank, doc_id in enumerate(dict.fromkeys(ids), 1):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (RRF_K + rank)
    return {doc_id: score / (2.0 / (RRF_K + 1)) for doc_id, score in scores.items()}


def relevance_label(score: float, kind: str) -> str:
    if kind == "rrf":
        return "high" if score >= 0.8 else "medium" if score >= 0.4 else "low"
    return "critical" if score >= 1.5 else "high" if score >= 0.8 else "medium" if score >= 0.5 else "low"
