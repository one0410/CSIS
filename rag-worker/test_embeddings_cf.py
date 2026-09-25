r"""Cloudflare embedding 後端 + 等價模型遷移自檢(mock server,不需真金鑰、不打外網)。

執行:cd rag-worker && venv\Scripts\python test_embeddings_cf.py
"""

import json
import os
import shutil
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

calls: list[dict] = []


class Mock(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        calls.append({"path": self.path, "n": len(body["text"])})
        if self.headers["Authorization"] != "Bearer good":
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b'{"success":false,"errors":[{"message":"Authentication error"}]}')
            return
        data = [[3.0, 4.0] + [0.0] * 1022 for _ in body["text"]]  # 未正規化,範數 5
        out = json.dumps({"success": True, "result": {"shape": [len(data), 1024], "data": data}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


srv = HTTPServer(("127.0.0.1", 0), Mock)
threading.Thread(target=srv.serve_forever, daemon=True).start()
tmp = tempfile.mkdtemp()
os.environ["CLOUDFLARE_API_BASE"] = f"http://127.0.0.1:{srv.server_port}"
os.environ["EMBEDDING_MODEL"] = "@cf/baai/bge-m3"
os.environ["CHROMA_DIR"] = os.path.join(tmp, "chromadb")
os.environ["ENABLE_RERANKER"] = "0"
os.environ.pop("CLOUDFLARE_ACCOUNT_ID", None)
os.environ.pop("CLOUDFLARE_API_TOKEN", None)

import sys  # noqa: E402

import embeddings as E  # noqa: E402  (env 要先設好)

E._MODEL_STATE_FILE = os.path.join(tmp, "embedding_model.txt")

# 1) 沒設金鑰 → 明確拋錯,且不寫持久化檔
try:
    E.load_model("@cf/baai/bge-m3")
    raise AssertionError("missing credentials should raise")
except RuntimeError as e:
    assert "CLOUDFLARE_ACCOUNT_ID" in str(e)
assert not os.path.exists(E._MODEL_STATE_FILE)

# 2) 金鑰錯 → HTTP 401 拋錯
os.environ["CLOUDFLARE_ACCOUNT_ID"] = "acct123"
os.environ["CLOUDFLARE_API_TOKEN"] = "bad"
try:
    E.load_model("@cf/baai/bge-m3")
    raise AssertionError("bad token should raise")
except RuntimeError as e:
    assert "401" in str(e)
assert not os.path.exists(E._MODEL_STATE_FILE)

# 3) 正確金鑰 → probe、URL、分批 50/50/20、L2 正規化、持久化
os.environ["CLOUDFLARE_API_TOKEN"] = "good"
calls.clear()
assert E.load_model("@cf/baai/bge-m3") is None
assert calls[0]["path"] == "/accounts/acct123/ai/run/@cf/baai/bge-m3"
calls.clear()
vecs = E.embed_texts([f"t{i}" for i in range(120)])
assert [c["n"] for c in calls] == [50, 50, 20], calls
assert len(vecs) == 120 and len(vecs[0]) == 1024
assert abs(vecs[0][0] - 0.6) < 1e-6 and abs(vecs[0][1] - 0.8) < 1e-6
with open(E._MODEL_STATE_FILE, encoding="utf-8") as f:
    assert f.read() == "@cf/baai/bge-m3"
assert "sentence_transformers" not in sys.modules, "Cloudflare 模式不應載入 torch"

# 4) 等價模型遷移:本機 BAAI/bge-m3 建的 collection → 啟動檢查只改名,不砍庫;非等價的照舊刪
import chromadb  # noqa: E402

import rag_server as R  # noqa: E402

R.chroma_client = chromadb.PersistentClient(path=os.environ["CHROMA_DIR"])
old = R.chroma_client.create_collection("site_" + "a" * 24, metadata={"hnsw:space": "cosine", "embedding_model": "BAAI/bge-m3"})
old.add(ids=["x1", "x2"], documents=["甲", "乙"], embeddings=[[1.0] + [0.0] * 1023, [0.0, 1.0] + [0.0] * 1022])
R.chroma_client.create_collection("site_" + "b" * 24, metadata={"hnsw:space": "cosine", "embedding_model": "BAAI/bge-small-zh-v1.5"})
R._check_collections_model("@cf/baai/bge-m3")
names = sorted(c.name for c in R.chroma_client.list_collections())
assert names == ["site_" + "a" * 24], names
kept = R.chroma_client.get_collection("site_" + "a" * 24)
assert kept.metadata["embedding_model"] == "@cf/baai/bge-m3" and kept.count() == 2
# 遷移後以 get_or_create 帶 hnsw:space 重開仍可查,且距離仍是 cosine(同方向距離 0)
R._collections.clear()
col = R._get_collection("a" * 24)
res = col.query(query_embeddings=[[2.0] + [0.0] * 1023], n_results=1)
assert res["ids"][0] == ["x1"] and abs(res["distances"][0][0]) < 1e-5, res

del R, col, kept, old
srv.shutdown()
shutil.rmtree(tmp, ignore_errors=True)
print("OK: cloudflare embedding backend + equivalent-model migration")
