// OpenAI 相容 LLM streaming client(Groq 現在 / 地端 vLLM 之後,只差 env)。
// 移植自 SuperAI groq-llm.ts,改用原生 fetch + ReadableStream(Bun 環境)。
// env:GROQ_API_KEY、LLM_BASE_URL(預設 Groq)、LLM_MODEL(預設 openai/gpt-oss-120b)
const logger = require('../logger');

const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'openai/gpt-oss-120b';

/**
 * Streaming chat completion。
 * @param {Array} messages OpenAI 格式(可含 tool_calls / tool_call_id / role:'tool')
 * @param {(text: string) => void} onDelta 每段文字 delta 回呼
 * @param {{ tools?: Array, signal?: AbortSignal }} options
 * @returns {Promise<{ text: string, toolCalls: Array }>}
 */
async function streamChat(messages, onDelta, { tools, signal } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    // 不設 status:設定缺失不是瞬時錯誤,呼叫端不需退避重試
    throw new Error('GROQ_API_KEY 未設定,請在伺服器 .env 設定後重啟');
  }

  const body = { model: LLM_MODEL, messages, stream: true };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  // 總時限 180s(streaming 全程),外加呼叫端的 abort signal
  const signals = [AbortSignal.timeout(180000)];
  if (signal) signals.push(signal);

  const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any(signals),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const err = new Error(`LLM API ${response.status}: ${errText.slice(0, 300)}`);
    err.status = response.status;
    // 429 時 Groq 會在 header retry-after 或訊息「try again in 1.97s / 600ms」告知等待時間,交給呼叫端退避
    const ra = Number(response.headers.get('retry-after'));
    const m = errText.match(/try again in ([\d.]+)\s*(ms|s)\b/i);
    err.retryAfterMs = Number.isFinite(ra) && ra > 0
      ? ra * 1000
      : m ? Math.ceil(parseFloat(m[1]) * (m[2].toLowerCase() === 'ms' ? 1 : 1000)) : 0;
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  // tool call delta 累積:index -> {id, name, arguments}
  const toolCallAccumulator = new Map();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta;
        if (!delta) continue;

        // gpt-oss 系列會另外吐 delta.reasoning(思考過程)—— 只取 content 即自然忽略
        if (delta.content) {
          fullText += delta.content;
          if (onDelta) onDelta(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallAccumulator.has(idx)) {
              toolCallAccumulator.set(idx, { id: tc.id || '', name: tc.function?.name || '', arguments: '' });
            }
            const acc = toolCallAccumulator.get(idx);
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          }
        }
      } catch {
        // 略過畸形 SSE frame
      }
    }
  }

  const toolCalls = [];
  for (const [, tc] of toolCallAccumulator) {
    toolCalls.push({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } });
  }
  return { text: fullText, toolCalls };
}

module.exports = { streamChat, LLM_MODEL, LLM_BASE_URL };
