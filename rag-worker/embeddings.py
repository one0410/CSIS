"""Embedding 模型管理(移植自 SuperAI python/rag/embeddings.py)。

CSIS 預設模型 BAAI/bge-m3(1024 維,多語言,支援長文本)。
"""

from __future__ import annotations

import os
from sentence_transformers import SentenceTransformer
from log import get_logger

logger = get_logger("RAG")

# 模型選擇持久化檔 — 重啟時讀回上次使用的模型。
# 沒有這個的話:env 沒設 → 回到內建預設 → startup 偵測 collection 模型不符
# → 所有 site collection 被清空(SuperAI 2026-07-31 事故:1230 chunks 蒸發)。
_MODEL_STATE_FILE = os.path.join(os.path.dirname(__file__), "data", "embedding_model.txt")


def _read_persisted_model() -> str | None:
    try:
        with open(_MODEL_STATE_FILE, encoding="utf-8") as f:
            name = f.read().strip()
            return name or None
    except OSError:
        return None


def _persist_model(model_name: str) -> None:
    try:
        os.makedirs(os.path.dirname(_MODEL_STATE_FILE), exist_ok=True)
        with open(_MODEL_STATE_FILE, "w", encoding="utf-8") as f:
            f.write(model_name)
    except OSError as e:
        logger.warning(f"[RAG] Failed to persist embedding model choice: {e}")


# 優先序:env EMBEDDING_MODEL > 持久化檔 > 內建預設
DEFAULT_MODEL = (
    os.environ.get("EMBEDDING_MODEL")
    or _read_persisted_model()
    or "BAAI/bge-m3"
)

_model: SentenceTransformer | None = None
_current_model_name: str = DEFAULT_MODEL


def get_embedding_model() -> SentenceTransformer:
    global _model
    if _model is None:
        load_model(_current_model_name)
    return _model  # type: ignore


def load_model(model_name: str) -> SentenceTransformer:
    global _model, _current_model_name
    logger.info(f"[RAG] Loading embedding model: {model_name}...")
    _model = SentenceTransformer(model_name)
    _current_model_name = model_name
    _persist_model(model_name)  # 重啟後維持同一模型,避免 collection 被誤清
    logger.info(f"[RAG] Embedding model loaded: {model_name} (dim={_model.get_sentence_embedding_dimension()})")
    return _model


def get_current_model_name() -> str:
    return _current_model_name


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = get_embedding_model()
    embeddings = model.encode(texts, normalize_embeddings=True)
    return embeddings.tolist()


def embed_query(query: str) -> list[float]:
    model = get_embedding_model()
    embedding = model.encode([query], normalize_embeddings=True)
    return embedding[0].tolist()
