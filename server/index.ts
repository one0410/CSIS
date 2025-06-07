const express = require('express');
const fs = require('fs');
const path = require('path');
const confighelper = require('./config');
const mysocket = require('./mysocket');
// 為了 pkg 不支援ESM, 改為 require axios prebuild 版本
// const axios = require('axios');
// const axios = require('axios/dist/node/axios.cjs');
// const axios = require('axios').default;
const bodyParser = require('body-parser');

const logger = require('./logger');

const app = express();
mysocket.attachWebSocket(app);

// 移除全域的 body parsers，它們可能會干擾 multer
// app.use(express.text({ limit: '2gb' }));
// app.use(express.json());
// app.use(bodyParser.urlencoded({ extended: false, limit: '2gb' }));
// app.use(express.raw({ type: '*/*', limit: '2gb' }));

// 設定 CORS
app.use(function (req: any, res: any, next: any) {
  const allowedOrigins = ['http://localhost:4200', 'http://localhost:3000'];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, username, Authorization');
  res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Expose-Headers', 'X-Pagination, X-Content-Range');
  
  // 處理 OPTIONS 請求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// API路由
// 載入認證路由 - 在這裡添加需要的 body parser
const authRoutes = require('./routes/auth');
app.use('/auth', express.json(), bodyParser.urlencoded({ extended: false }), authRoutes);

// 設定其他路由
const mongodbApi = require('./routes/mongodbApi');
// 為 mongodbApi 添加需要的 body parser
app.use('/', express.json(), bodyParser.urlencoded({ extended: false }), mongodbApi);

const mongodbGridfsApi = require('./routes/mongodbGridfsApi');
// GridFS 路由不需要額外的 body parser，multer 會處理
app.use('/', mongodbGridfsApi);

const photosApi = require('./routes/photosApi');
// photosApi 路由可能不需要 body parser，取決於其內部實現
app.use('/', photosApi);

const fileApi = require('./routes/fileApi');
// fileApi 路由可能需要特定的 body parser，例如 express.raw()
// 需要根據 fileApi 的具體需求來配置
app.use('/', fileApi);


// 設定靜態資料夾
// let wwwrootPath = path.join(__dirname, 'wwwroot/browser');
// if (process.pkg) {
//   wwwrootPath = path.join(path.dirname(process.execPath), 'wwwroot/browser');
// }
let wwwrootPath = path.join(process.cwd(), 'wwwroot/browser');
app.use(express.static(wwwrootPath));

app.get('*', (req: any, res: any) => {
  res.sendFile(path.join(wwwrootPath, 'index.html'));
});

// 讀取參數, 檢查有沒有 -p 參數, 有的話就是指定的 port, 有 -h 參數就是顯示說明
let params = process.argv.slice(2);
let port = confighelper.get('httpPort') || 3000;
if (params.includes('-h') || params.includes('--help') || params.includes('/?')) {
  console.log('Usage: ipwa [-p port] [-h]');
  console.log('-p port: 指定 port, 預設是 3000');
  console.log('-h: 顯示說明');
  process.exit(0);
}
if (params.includes('-p')) {
  let index = params.indexOf('-p');
  port = parseInt(params[index + 1]);
}

// 處理未找到的路由
app.use((req: any, res: any) => {
  res.status(404).json({ error: '找不到請求的資源' });
});

// 錯誤處理中間件
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err.stack);
  res.status(500).json({ error: '伺服器內部錯誤' });
});

// 啟動伺服器
app.listen(port, () => {
  logger.info(`=================server is running on port ${port}====================`);
  logger.info(`認證 API 可在 /api/auth 路徑訪問`);
});

