# 使用官方的 Bun 映像
FROM oven/bun:1.2.18 AS builder

# 設定工作目錄
WORKDIR /app

# 複製 package.json 和 yarn.lock
COPY package.json yarn.lock ./

# 安裝相依套件
RUN bun install --frozen-lockfile

# 複製所有原始碼
COPY . .

# 建立最終映像
FROM oven/bun:1.2.18

# 安裝必要的系統套件（Bun.Image 內建,不再需要 libvips）
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 從 builder 階段複製檔案
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .

# 建立必要的目錄
RUN mkdir -p logs uploads

# 設定環境變數
ENV NODE_ENV=production

# 暴露預設埠號
EXPOSE 3000 443

# 啟動應用程式
CMD ["bun", "run", "index.ts"] 