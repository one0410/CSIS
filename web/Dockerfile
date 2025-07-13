# 建構階段
FROM node:20-alpine AS builder

# 設定工作目錄
WORKDIR /app

# 安裝 bun
RUN npm install -g bun

# 複製 package.json 和 yarn.lock
COPY package.json yarn.lock ./

# 安裝相依套件
RUN yarn install --frozen-lockfile

# 複製所有原始碼
COPY . .

# 建構 Angular 應用程式
RUN yarn build

# 執行階段
FROM nginx:alpine

# 複製 nginx 設定檔
COPY nginx.conf /etc/nginx/nginx.conf

# 從建構階段複製建構好的檔案
COPY --from=builder /app/dist/csis/browser/* /usr/share/nginx/html/

# 暴露 80 埠號
EXPOSE 80

# 啟動 nginx
CMD ["nginx", "-g", "daemon off;"] 