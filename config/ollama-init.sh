#!/bin/bash

# 等待 Ollama 服務啟動
echo "Waiting for Ollama to start..."
until curl -f http://csis-ollama:11434/api/tags > /dev/null 2>&1; do
    echo "Ollama is not ready yet, waiting..."
    sleep 5
done

echo "Ollama is ready!"

# 檢查是否已經有 gemma2:9b 模型
echo "Checking for existing models..."
MODELS=$(curl -s http://csis-ollama:11434/api/tags)

if echo "$MODELS" | grep -q "gemma2:9b"; then
    echo "Model gemma2:9b already exists"
else
    echo "Pulling gemma2:9b model (this may take several minutes)..."
    # 使用流式響應來顯示下載進度
    curl -X POST http://csis-ollama:11434/api/pull \
         -H "Content-Type: application/json" \
         -d '{"name": "gemma2:9b", "stream": true}' \
         --no-buffer
    echo ""
    echo "Model gemma2:9b pulled successfully"
fi

echo "Ollama initialization completed!" 