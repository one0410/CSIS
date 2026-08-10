// AI 文件管理 + RAG 問答 API(/api/ai/*)
// 對齊 2026_AI_Specs_0417.md 的 API 設計(projectId 統一改用 siteId)。
// 工地隔離原則:siteId 只從路徑參數取(24-hex 驗證),所有查詢後端強制注入
// siteId filter,不信任前端傳來的 filter;向量檢索由 rag-worker 以
// collection-per-site 隔離。
const express = require('express');
const { GridFSBucket, ObjectId } = require('mongodb');
const multer = require('multer');
const db = require('../dbConnection');
const logger = require('../logger');

const app = express.Router();

const RAG_WORKER_URL = process.env.RAG_WORKER_URL || 'http://127.0.0.1:8010';

// 支援格式與大小限制(AC-1.1 / AC-2.3)
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.md'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB(規格書 3.1)

// 獨立 multer instance —— 既有 gridfs 的是 10MB,不能共用
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const SITE_ID_RE = /^[0-9a-f]{24}$/;

function validateSiteId(req, res) {
  const siteId = req.params.siteId;
  if (!SITE_ID_RE.test(siteId || '')) {
    res.status(400).json({ success: false, message: '無效的 siteId' });
    return null;
  }
  return siteId;
}

function getExt(filename) {
  const idx = (filename || '').lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

// ---------------------------------------------------------------------------
// 文件上傳:存 GridFS + ai_documents(pending)後立即回應,
// 背景轉發 rag-worker 解析索引,完成後更新狀態(AC-1.2 的狀態流轉)。
// ---------------------------------------------------------------------------
app.post('/api/ai/sites/:siteId/documents/upload', upload.single('file'), async (req, res) => {
  try {
    const siteId = validateSiteId(req, res);
    if (!siteId) return;

    if (!req.file) {
      return res.status(400).json({ success: false, message: '沒有檔案被上傳' });
    }

    const originalName = req.file.originalname;
    const ext = getExt(originalName);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({
        success: false,
        message: `不支援的檔案格式 ${ext || '(無副檔名)'},僅支援:${ALLOWED_EXTENSIONS.join(', ')}`,
      });
    }

    // 1) 原檔存 GridFS
    const bucket = new GridFSBucket(db);
    const uniqueFilename = `${Date.now()}_${originalName}`;
    const fileId = await new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(uniqueFilename, {
        contentType: req.file.mimetype,
        metadata: {
          uploadDate: new Date(),
          fileSize: req.file.size,
          originalName,
          siteId,
          docType: 'rag', // 與一般照片/表單附件區隔
        },
      });
      uploadStream.on('error', reject);
      uploadStream.on('finish', () => resolve(uploadStream.id));
      uploadStream.write(req.file.buffer);
      uploadStream.end();
    });

    // 2) ai_documents 插入(pending)
    const now = new Date();
    const doc = {
      siteId,
      filename: originalName,
      fileExt: ext,
      size: req.file.size,
      category: req.body?.category || '',
      tags: [],
      originalFileId: fileId,
      ragDocId: null,
      metadata: { pageCount: null },
      chunkCount: 0,
      embeddingStatus: 'pending',
      errorMessage: null,
      uploadedBy: req.body?.uploadedBy || '',
      createdAt: now,
      updatedAt: now,
    };
    const insertResult = await db.collection('ai_documents').insertOne(doc);
    const documentId = insertResult.insertedId;

    // 3) 立即回應,背景做解析索引(大檔 CPU embedding 可能分鐘級)
    res.json({ success: true, documentId, status: 'pending' });

    indexDocumentAsync(documentId, siteId, originalName, req.file.buffer).catch((e) => {
      logger.error('AI 文件背景索引未預期錯誤:', e.message);
    });
  } catch (error) {
    logger.error('AI 文件上傳失敗:', error.message);
    res.status(500).json({ success: false, message: '上傳失敗', error: error.message });
  }
});

// multer 錯誤(檔案超限等)要回可讀訊息,不能讓它變 500
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? `檔案超過 ${MAX_FILE_SIZE / 1024 / 1024}MB 上限` : err.message;
    return res.status(400).json({ success: false, message });
  }
  next(err);
});

// 背景索引:轉發 rag-worker /upload,依結果更新 ai_documents 狀態
async function indexDocumentAsync(documentId, siteId, filename, buffer) {
  const col = db.collection('ai_documents');
  try {
    await col.updateOne({ _id: documentId }, { $set: { embeddingStatus: 'processing', updatedAt: new Date() } });

    const formData = new FormData();
    formData.append('site_id', siteId);
    formData.append('file', new Blob([buffer]), filename);

    const resp = await fetch(`${RAG_WORKER_URL}/upload`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(240000), // timeout 階梯:nginx 300s > Bun 255s > 這裡 240s
    });
    const result = await resp.json();

    if (!resp.ok || result.error) {
      throw new Error(result.error || result.detail || `worker 回應 ${resp.status}`);
    }

    await col.updateOne(
      { _id: documentId },
      {
        $set: {
          embeddingStatus: 'completed',
          ragDocId: result.doc_id,
          chunkCount: result.chunks || 0,
          'metadata.pageCount': result.page_count ?? null,
          errorMessage: null,
          updatedAt: new Date(),
        },
      }
    );
    logger.info(`AI 文件索引完成: ${filename} (site=${siteId}, chunks=${result.chunks})`);
  } catch (error) {
    logger.error(`AI 文件索引失敗: ${filename} (site=${siteId}):`, error.message);
    await col.updateOne(
      { _id: documentId },
      { $set: { embeddingStatus: 'failed', errorMessage: error.message, updatedAt: new Date() } }
    );
  }
}

// ---------------------------------------------------------------------------
// 文件列表(AC-1.3:檔名、上傳者、時間、狀態、頁數)
// ---------------------------------------------------------------------------
app.get('/api/ai/sites/:siteId/documents', async (req, res) => {
  try {
    const siteId = validateSiteId(req, res);
    if (!siteId) return;

    const docs = await db
      .collection('ai_documents')
      .find({ siteId })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, documents: docs });
  } catch (error) {
    logger.error('AI 文件列表查詢失敗:', error.message);
    res.status(500).json({ success: false, message: '查詢失敗', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// 刪除文件:GridFS 原檔 + worker 索引 + ai_documents
// ---------------------------------------------------------------------------
app.delete('/api/ai/sites/:siteId/documents/:id', async (req, res) => {
  try {
    const siteId = validateSiteId(req, res);
    if (!siteId) return;

    let docId;
    try {
      docId = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ success: false, message: '無效的文件 ID' });
    }

    // siteId 一併當查詢條件 —— A 工地的 id 從 B 工地的路徑打過來會查不到(404)
    const doc = await db.collection('ai_documents').findOne({ _id: docId, siteId });
    if (!doc) {
      return res.status(404).json({ success: false, message: '文件不存在' });
    }

    // 刪 GridFS 原檔(best effort)
    if (doc.originalFileId) {
      try {
        await new GridFSBucket(db).delete(new ObjectId(doc.originalFileId));
      } catch (e) {
        logger.warn(`GridFS 原檔刪除失敗(續行): ${e.message}`);
      }
    }

    // 刪 worker 向量索引(best effort;worker 掛掉時文件記錄仍要刪得掉)
    if (doc.ragDocId) {
      try {
        await fetch(`${RAG_WORKER_URL}/documents/${siteId}/${doc.ragDocId}`, {
          method: 'DELETE',
          signal: AbortSignal.timeout(30000),
        });
      } catch (e) {
        logger.warn(`worker 索引刪除失敗(續行): ${e.message}`);
      }
    }

    await db.collection('ai_documents').deleteOne({ _id: docId });
    res.json({ success: true });
  } catch (error) {
    logger.error('AI 文件刪除失敗:', error.message);
    res.status(500).json({ success: false, message: '刪除失敗', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// 出處原檔檢視(AC-4.1):以 ai_documents 的 _id 反查 GridFS,inline 讓
// 瀏覽器直接開(PDF 可用 URL fragment #page=N 跳頁)。
// 不直接收 GridFS id —— 必須經過 ai_documents 這一層。
// ---------------------------------------------------------------------------
const MEDIA_TYPES = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

app.get('/api/ai/documents/:id/file', async (req, res) => {
  try {
    let docId;
    try {
      docId = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ success: false, message: '無效的文件 ID' });
    }

    const doc = await db.collection('ai_documents').findOne({ _id: docId });
    if (!doc || !doc.originalFileId) {
      return res.status(404).json({ success: false, message: '文件不存在' });
    }

    res.set('Content-Type', MEDIA_TYPES[doc.fileExt] || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${encodeURIComponent(doc.filename)}"`);

    const downloadStream = new GridFSBucket(db).openDownloadStream(new ObjectId(doc.originalFileId));
    downloadStream.on('error', (error) => {
      logger.error('AI 文件下載失敗:', error.message);
      if (!res.headersSent) res.status(404).json({ success: false, message: '原檔遺失' });
    });
    downloadStream.pipe(res);
  } catch (error) {
    logger.error('AI 文件下載失敗:', error.message);
    res.status(500).json({ success: false, message: '下載失敗', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// RAG 問答(SSE)
// 流程:query rewrite(多輪)→ worker 檢索(site 隔離)→ 先發 citations →
// tool-calling 迴圈呼叫 LLM(文件 context 與工地查詢工具並存)→ clause 串流
// → done 後寫入 ai_conversations。
// ---------------------------------------------------------------------------
const { streamChat } = require('./aiLlm');
const { getToolDefinitions, executeToolCall } = require('./aiTools');

const MAX_TOOL_ITERATIONS = 3;

const CHAT_SYSTEM_PROMPT = `你是工地專案管理系統的 AI 助理,協助使用者查詢「本工地」的文件內容與即時狀態,一律使用繁體中文回答。

回答守則:
1. 文件類問題依據「知識庫參考資料」準確回應,不要編造內容。若參考資料不足以回答,直接說「知識庫中沒有足夠的文件依據」,不要用你自己的知識硬答。
2. 絕對禁止捏造出處:不可提及參考資料中不存在的檔名、頁碼或內容。使用者要求引用不存在的文件時,照實說明知識庫中沒有該文件。
3. 工地「即時狀態」問題(工程進度、出工人數、在冊工人、許可單、工期等)必須使用提供的查詢工具取得即時數據,不可依文件中的舊資訊或自行推測回答。
4. 釐清優先:當參考資料中出現多個相似但數值/條件/適用對象不同的候選答案時,不要自己挑一個,而是列出候選(標明各自來自哪份文件)並反問使用者要哪一個。
5. 每段參考資料前的【來源 N:檔名 第X頁】標註是給你判斷出處用的;回答時用自然口語敘述,不要把【來源 N】寫進回覆,系統會自動顯示引用來源。
6. 回覆以純文字顯示:用短段落與「-」開頭的條列,不要使用 Markdown 表格、標題(#)或粗體(**)語法。`;

const QUERY_REWRITE_PROMPT = `你是知識庫檢索的查詢改寫器。根據對話脈絡,把使用者「最新訊息」改寫成一句可以獨立用於關鍵字+語意檢索的查詢。
規則:
- 只輸出改寫後的查詢字串本身,一行,不要任何解釋、不要加引號、不要前綴。
- 補回對話中被省略的主體與關鍵術語。
- 若最新訊息本身已是完整、可獨立檢索的問題,原樣輸出即可。
- 一律用繁體中文。`;

// 多輪對話時把當下訊息改寫成可獨立檢索的查詢(首輪直接回傳原句,省一次 LLM 呼叫)
async function rewriteQueryWithContext(userMessage, history, signal) {
  if (!history.length) return userMessage;

  const ctx = history
    .slice(-4)
    .map(h => `${h.role === 'user' ? '使用者' : '助理'}:${(h.content || '').slice(0, 500)}`)
    .join('\n');
  const lastUserQ = [...history].reverse().find(h => h.role === 'user')?.content || '';
  const concatFallback = `${lastUserQ} ${userMessage}`.trim();

  try {
    const result = await streamChat(
      [
        { role: 'system', content: QUERY_REWRITE_PROMPT },
        { role: 'user', content: `[對話脈絡]\n${ctx}\n使用者:${userMessage}   ← 最新訊息\n\n改寫後查詢:` },
      ],
      null,
      { signal }
    );
    const rewritten = (result.text || '')
      .trim()
      .split('\n')[0]
      .replace(/^改寫後查詢[:：]\s*/, '')
      .replace(/^["「『]+|["」』]+$/g, '')
      .trim();
    return rewritten.length >= 2 ? rewritten : concatFallback;
  } catch (e) {
    if (signal?.aborted) throw e;
    logger.warn(`AI chat query rewrite 失敗,改用併接 fallback: ${e.message}`);
    return concatFallback || userMessage;
  }
}

app.post('/api/ai/sites/:siteId/chat', express.json({ limit: '1mb' }), async (req, res) => {
  const siteId = validateSiteId(req, res);
  if (!siteId) return;

  const userMessage = (req.body?.message || '').trim();
  if (!userMessage) {
    return res.status(400).json({ success: false, message: '訊息不可為空' });
  }
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  const sessionId = (req.body?.sessionId || '').trim();

  // 全鏈路 abort:client 斷線(關頁、按中止)→ 停止 LLM 生成與檢索。
  // 注意必須聽 res 的 close(req 的 close 在 body 解析完就會觸發,會誤殺 pipeline)
  const pipelineAbort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) pipelineAbort.abort();
  });

  // 1) 多輪時先改寫檢索查詢
  let searchQuery = userMessage;
  try {
    searchQuery = await rewriteQueryWithContext(userMessage, history, pipelineAbort.signal);
    if (searchQuery !== userMessage) {
      logger.info(`AI chat query rewrite: "${userMessage}" -> "${searchQuery}"`);
    }
  } catch {
    searchQuery = userMessage; // 只有 client 已斷線會走到這,後續各自優雅收尾
  }

  // 2) 檢索該工地知識庫(top-8 給 LLM,citations 只顯示前 4)
  let ragChunks = [];
  let ragError = null;
  try {
    const resp = await fetch(`${RAG_WORKER_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId, query: searchQuery, n_results: 8 }),
      signal: AbortSignal.any([pipelineAbort.signal, AbortSignal.timeout(30000)]),
    });
    const data = await resp.json();
    ragChunks = (data?.results || []).filter(r => r?.text && r.metadata?.doc_id && r.metadata?.filename);
  } catch (err) {
    ragError = err.message || 'RAG query failed';
    logger.warn(`AI chat 檢索失敗: ${ragError}`);
  }

  // 3) 組 context(每段帶來源標註,LLM 才能判斷出處與分歧)
  const ragContext = ragChunks
    .map((r, i) => {
      const pg = r.metadata.page != null ? ` 第 ${r.metadata.page} 頁` : '';
      return `【來源 ${i + 1}:${r.metadata.filename}${pg}】\n${r.text}`;
    })
    .join('\n\n---\n\n');

  // citations:同文件同頁去重,取前 4;score 用 worker 的 rerank_score
  // ragDocId → ai_documents._id 對照,前端點擊才能開原檔
  const ragDocIds = [...new Set(ragChunks.map(r => r.metadata.doc_id))];
  const docIdMap = new Map(); // ragDocId -> ai_documents._id
  if (ragDocIds.length) {
    try {
      const docs = await db
        .collection('ai_documents')
        .find({ siteId, ragDocId: { $in: ragDocIds } })
        .project({ ragDocId: 1 })
        .toArray();
      for (const d of docs) docIdMap.set(d.ragDocId, d._id.toString());
    } catch (e) {
      logger.warn(`AI chat citations 對照查詢失敗: ${e.message}`);
    }
  }
  const seenCite = new Set();
  const citationItems = [];
  for (const r of ragChunks) {
    const key = `${r.metadata.doc_id}#${r.metadata.page ?? ''}`;
    if (seenCite.has(key)) continue;
    seenCite.add(key);
    citationItems.push({
      documentId: docIdMap.get(r.metadata.doc_id) || null,
      filename: r.metadata.filename,
      fileExt: r.metadata.file_ext || null,
      page: r.metadata.page ?? null,
      score: r.rerank_score ?? 0,
      preview: (r.text || '').slice(0, 200),
    });
    if (citationItems.length >= 4) break;
  }

  // 4) SSE 開始
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no', // 阻止 nginx buffer
  });
  const sendEvent = evt => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(evt)}\n\n`);
  };

  sendEvent({ type: 'citations', items: citationItems });
  if (ragError) sendEvent({ type: 'rag_unavailable', details: ragError });

  // 5) 組 messages + tool-calling 迴圈
  let systemContent = CHAT_SYSTEM_PROMPT;
  if (ragContext) {
    systemContent += `\n\n以下是本工地知識庫的參考資料(可能含 Markdown 格式),請理解內容後用口語回答:\n${ragContext}`;
  } else {
    systemContent += '\n\n(本次檢索沒有找到相關的知識庫文件;文件類問題請明講知識庫中無相關依據。)';
  }
  const messages = [
    { role: 'system', content: systemContent },
    ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ];

  const tools = getToolDefinitions();
  const toolsUsed = [];
  const collectedLinks = []; // tool 產生的 UI 連結(如許可單表單頁),隨訊息落庫
  let fullText = '';

  try {
    let clausesSent = 0;
    const onDelta = text => {
      clausesSent++;
      sendEvent({ type: 'clause', text });
    };

    toolLoop: for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      if (pipelineAbort.signal.aborted) break;

      // Groq 偶發空回應 / 429 / 5xx:尚未送出任何 clause 時退避重試(不會造成前端重複內容)
      let result = { text: '', toolCalls: [] };
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          result = await streamChat(messages, onDelta, { tools, signal: pipelineAbort.signal });
        } catch (llmErr) {
          const status = llmErr?.status;
          const transient = status === 429 || (status >= 500 && status < 600);
          if (transient && attempt < 3 && clausesSent === 0 && !pipelineAbort.signal.aborted) {
            // 4s/8s:Groq 429 多為每分鐘額度限流,更短的間隔跨不過限流窗
            logger.warn(`AI chat LLM ${status}(attempt ${attempt}),${attempt * 4000}ms 後重試`);
            await new Promise(r => setTimeout(r, attempt * 4000));
            continue;
          }
          throw llmErr;
        }
        const hasContent = (result.text || '').trim() || result.toolCalls.length > 0 || clausesSent > 0;
        if (hasContent || pipelineAbort.signal.aborted) break;
        logger.warn(`AI chat LLM 空回應(attempt ${attempt}),自動重試`);
      }

      fullText += result.text;

      if (!result.toolCalls.length) break; // 沒有工具呼叫 → 回答完成

      messages.push({ role: 'assistant', content: result.text, tool_calls: result.toolCalls });
      for (const tc of result.toolCalls) {
        if (pipelineAbort.signal.aborted) break toolLoop;
        const toolName = tc.function?.name || 'unknown';
        sendEvent({ type: 'tool', name: toolName });
        toolsUsed.push(toolName);
        logger.info(`AI chat 執行工具: ${toolName} (site=${siteId})`);
        const toolResult = await executeToolCall(siteId, tc);
        messages.push({ role: 'tool', content: toolResult.content, tool_call_id: tc.id });
        if (toolResult.links?.length) {
          collectedLinks.push(...toolResult.links);
          sendEvent({ type: 'links', items: toolResult.links });
        }
      }
      // 迴圈回 LLM 消化工具結果
    }

    sendEvent({ type: 'done', text: fullText });

    // 6) 對話落庫(ai_conversations,依 sessionId 分組)
    if (sessionId && fullText && !pipelineAbort.signal.aborted) {
      try {
        const now = new Date();
        await db.collection('ai_conversations').updateOne(
          { siteId, sessionId },
          {
            $push: {
              messages: {
                $each: [
                  { role: 'user', content: userMessage, timestamp: now },
                  {
                    role: 'assistant',
                    content: fullText,
                    sources: citationItems,
                    links: collectedLinks,
                    toolsUsed,
                    timestamp: now,
                  },
                ],
              },
            },
            $set: { updatedAt: now },
            $setOnInsert: { siteId, sessionId, userId: req.body?.userId || null, createdAt: now },
          },
          { upsert: true }
        );
      } catch (e) {
        logger.warn(`AI chat 對話落庫失敗: ${e.message}`);
      }
    }
  } catch (err) {
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError' || pipelineAbort.signal.aborted) {
      logger.info('AI chat 已被 client 中止');
    } else {
      logger.error(`AI chat 失敗: ${err.message}`);
      sendEvent({ type: 'error', error: err.message });
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});

// ---------------------------------------------------------------------------
// 健康檢查:聚合 rag-worker 狀態 + LLM 設定
// ---------------------------------------------------------------------------
app.get('/api/ai/health', async (req, res) => {
  let worker = null;
  try {
    const resp = await fetch(`${RAG_WORKER_URL}/health`, { signal: AbortSignal.timeout(5000) });
    worker = await resp.json();
  } catch (e) {
    worker = { status: 'unreachable', error: e.message };
  }
  res.json({
    status: 'ok',
    worker,
    llm: {
      configured: !!process.env.GROQ_API_KEY,
      model: process.env.LLM_MODEL || 'openai/gpt-oss-120b',
      baseUrl: process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1',
    },
  });
});

module.exports = app;
