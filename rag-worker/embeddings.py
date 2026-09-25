"""Embedding 模型管理(移植自 SuperAI python/rag/embeddings.py)。

兩種後端,依模型 ID 自動判斷:
- `@cf/...`(如 `@cf/baai/bge-m3`)→ Cloudflare Workers AI REST API,不載 torch、不佔本機記憶體。
  需 env `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`。外網測試站(8GB 共用機)用這個。
- 其他(如 `BAAI/bge-m3`)→ 本機 sentence-transformers。客戶端 / 離線部署用這個(預設)。

Cloudflare 的 bge-m3 與本機 BAAI/bge-m3 向量 cos = 1.00000(SuperAI 2026-09-25 實測),
兩者互換不必重新索引,見 EQUIVALENT_MODELS 與 rag_server._check_collections_model。
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

import numpy as np
from log import get_logger

logger = get_logger("RAG")

# 模型選擇持久化檔 — 重啟時讀回上次使用的模型。
# 沒有這個的話:env 沒設 → 回到內建預設 → startup 偵測 collection 模型不符
# → 所有 site collection 被清空(SuperAI 2026-07-31 事故:1230 chunks 蒸發)。
_MODEL_STATE_FILE = os.path.join(os.path.dirname(__file__), "data", "embedding_model.txt")

# 可改指向 Cloudflare AI Gateway 或測試用 mock
CF_API_BASE = os.environ.get("CLOUDFLARE_API_BASE", "https://api.cloudflare.com/client/v4")
CF_BATCH = 50  # 每次 API 呼叫的文字數(官方未公布上限,保守取 50)
CF_TIMEOUT = 60

# 向量完全相同的模型名稱(互換時只改 collection metadata,不砍庫)
EQUIVALENT_MODELS = [{"BAAI/bge-m3", "@cf/baai/bge-m3"}]


def models_equivalent(a: str, b: str) -> bool:
    return a == b or any(a in g and b in g for g in EQUIVALENT_MODELS)


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

_model = None  # 本機模式:SentenceTransformer;Cloudflare 模式:None
_loaded = False
_current_model_name: str = DEFAULT_MODEL


def is_cloudflare(model_name: str) -> bool:
    return model_name.startswith("@cf/")


def _cf_embed(model_name: str, texts: list[str]) -> list[list[float]]:
    """呼叫 Workers AI 取向量(分批)。失敗直接拋例外 —— 上傳/查詢要明確失敗,不可靜默。"""
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not account or not token:
        raise RuntimeError("Cloudflare embedding 需要 env CLOUDFLARE_ACCOUNT_ID 與 CLOUDFLARE_API_TOKEN")

    url = f"{CF_API_BASE}/accounts/{account}/ai/run/{model_name}"
    out: list[list[float]] = []
    for i in range(0, len(texts), CF_BATCH):
        body = json.dumps({"text": texts[i:i + CF_BATCH], "truncate_inputs": True}).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=CF_TIMEOUT) as resp:
                data = json.load(resp)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Cloudflare embedding HTTP {e.code}: {e.read()[:300].decode('utf-8', 'replace')}") from e
        if not data.get("success"):
            raise RuntimeError(f"Cloudflare embedding failed: {data.get('errors')}")
        out.extend(data["result"]["data"])

    # 與本機模式一致:L2 正規化(collection 用 cosine)
    arr = np.asarray(out, dtype=np.float32)
    arr /= np.linalg.norm(arr, axis=1, keepdims=True) + 1e-12
    return arr.tolist()


def get_embedding_model():
    """取得(必要時載入)embedding 模型。Cloudflare 模式回傳 None。"""
    if not _loaded:
        load_model(_current_model_name)
    return _model


def load_model(model_name: str):
    """載入指定模型。

    Cloudflare 模式會先實際打一次 API(probe):金鑰錯 / 連不上就在這裡拋例外,
    不寫持久化檔,也還沒走到 collection 檢查,資料不會被誤刪。
    """
    global _model, _loaded, _current_model_name
    logger.info(f"[RAG] Loading embedding model: {model_name}...")
    if is_cloudflare(model_name):
        dim = len(_cf_embed(model_name, ["ping"])[0])
        new_model = None
    else:
        from sentence_transformers import SentenceTransformer  # 只有本機模式才載 torch
        new_model = SentenceTransformer(model_name)
        dim = new_model.get_sentence_embedding_dimension()
    _model, _loaded, _current_model_name = new_model, True, model_name
    _persist_model(model_name)  # 重啟後維持同一模型,避免 collection 被誤清
    logger.info(f"[RAG] Embedding model loaded: {model_name} (dim={dim})")
    return _model


def get_current_model_name() -> str:
    return _current_model_name


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = get_embedding_model()
    if is_cloudflare(_current_model_name):
        return _cf_embed(_current_model_name, texts)
    return model.encode(texts, normalize_embeddings=True).tolist()


def embed_query(query: str) -> list[float]:
    return embed_texts([query])[0]
