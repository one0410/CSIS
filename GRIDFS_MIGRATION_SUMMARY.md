# Worker 圖片存儲 GridFS 遷移總結

## 概述
為了解決 MongoDB 16MB 文檔大小限制問題，我們將 Worker 系統中的圖片存儲方式進行了重構。除了大頭貼（profilePicture）繼續使用 base64 格式外，其他所有圖片都改為存儲到 MongoDB GridFS。

## 修改的檔案

### 1. 模型定義 (worker.model.ts)
- 更新了 `Worker` 介面的註釋，明確標示哪些欄位使用 base64，哪些使用 GridFS URL
- 更新了 `Certification` 介面的圖片欄位註釋

**圖片欄位分類：**
- **Base64 格式：** `profilePicture` (大頭貼)
- **GridFS URL 格式：** 
  - `idCardFrontPicture` (身份證正面)
  - `idCardBackPicture` (身份證反面)
  - `laborInsurancePicture` (勞保證明)
  - `sixHourTrainingFrontPicture` (六小時證明正面)
  - `sixHourTrainingBackPicture` (六小時證明反面)
  - `medicalExamPicture` (體檢報告)
  - `certifications[].frontPicture` (證照正面)
  - `certifications[].backPicture` (證照反面)

### 2. Worker 詳細頁面組件 (worker-detail.component.ts)
- 導入 `GridFSService`
- 更新所有圖片上傳處理方法（除大頭貼外）使用 GridFS
- 移除 `resizeImageFile` 方法：因為 GridFS 沒有大小限制，不需要調整圖片大小
- 保留 `resizeAndConvertToBase64` 方法：專門用於大頭貼的 base64 轉換（調整為 100px）
- 新增 `removeImage` 方法：處理圖片刪除，包括從 GridFS 刪除檔案

**更新的上傳方法：**
- `handleCertificateImageUpload` - 證照圖片上傳（直接上傳原始檔案）
- `handleLaborInsuranceProofUpload` - 勞保證明上傳（直接上傳原始檔案）
- `handleIdCardFrontUpload` - 身份證正面上傳（直接上傳原始檔案）
- `handleIdCardBackUpload` - 身份證反面上傳（直接上傳原始檔案）
- `handleSixHourTrainingFrontUpload` - 六小時證明正面上傳（直接上傳原始檔案）
- `handleSixHourTrainingBackUpload` - 六小時證明反面上傳（直接上傳原始檔案）
- `handleMedicalExamUpload` - 體檢報告上傳（直接上傳原始檔案）

### 3. Worker 列表組件 (worker-list.component.ts)
- 導入 `GridFSService`
- 更新 `loadWorkerImagesFromZip` 方法：
  - 大頭貼繼續使用 base64 存儲並調整為 100px
  - 其他圖片直接上傳原始檔案到 GridFS 並存儲 URL
- 移除 `resizeImageFile` 方法：不再需要調整圖片大小

### 4. Worker 詳細頁面模板 (worker-detail.component.html)
- 更新所有移除圖片按鈕（除大頭貼外）使用新的 `removeImage` 方法
- 大頭貼的移除按鈕保持原有的直接清空邏輯

## 技術實作細節

### 圖片處理流程
1. **上傳時：**
   - 大頭貼：調整為 100px → 轉換為 base64 → 存儲到 MongoDB 文檔
   - 其他圖片：**直接上傳原始檔案** → 上傳到 GridFS → 存儲 URL 到 MongoDB 文檔

2. **顯示時：**
   - HTML 模板使用 `[src]` 綁定，自動處理 base64 和 URL 兩種格式

3. **刪除時：**
   - 大頭貼：直接清空欄位
   - 其他圖片：先從 GridFS 刪除檔案，再清空欄位

### GridFS 元數據
上傳到 GridFS 的檔案包含以下元數據：
- `workerId`: 工人 ID
- `workerName`: 工人姓名
- `imageType`: 圖片類型（如 'idCardFront', 'laborInsurance' 等）
- `originalFileName`: 原始檔案名稱（ZIP 匯入時）
- `uploadSource`: 上傳來源（'manual' 或 'zipImport'）

### ZIP 匯入增強
- 支援從 ZIP 檔案中自動匯入工人圖片
- 圖片檔名格式：`{身份證號}_{姓名}_{代碼}.jpg/jpeg/png`
- 支援的圖片代碼：
  - `P`: 大頭照 (profilePicture) - **調整為 100px 並轉為 base64**
  - `IDF`: 身份證正面 (idCardFrontPicture) - **原始檔案上傳到 GridFS**
  - `IDR`: 身份證反面 (idCardBackPicture) - **原始檔案上傳到 GridFS**
  - `L`/`G`: 勞保證明 (laborInsurancePicture) - **原始檔案上傳到 GridFS**
  - `6F`: 六小時證明正面 (sixHourTrainingFrontPicture) - **原始檔案上傳到 GridFS**
  - `6R`: 六小時證明反面 (sixHourTrainingBackPicture) - **原始檔案上傳到 GridFS**
  - `H`: 體檢報告 (medicalExamPicture) - **原始檔案上傳到 GridFS**

## 優點

1. **解決文檔大小限制：** 避免 MongoDB 16MB 文檔限制問題
2. **效能優化：** 大型圖片不會影響文檔查詢效能
3. **存儲效率：** GridFS 自動處理大檔案的分塊存儲
4. **保持原始品質：** GridFS 中的圖片保持原始解析度和品質
5. **向後相容：** 大頭貼保持 base64 格式，確保現有功能正常運作
6. **自動清理：** 刪除圖片時自動從 GridFS 移除檔案
7. **無大小限制：** GridFS 沒有檔案大小限制，可存儲任意大小的圖片

## 注意事項

1. **大頭貼特殊處理：** 由於大頭貼通常較小且需要在列表中快速顯示，保持使用 base64 格式並調整為 100px
2. **錯誤處理：** 即使 GridFS 刪除失敗，也會清空資料庫欄位，避免資料不一致
3. **圖片品質：** 除了大頭貼外，所有圖片都保持原始品質和格式
4. **檔案類型：** 支援 JPG、JPEG、PNG 等常見圖片格式，不強制轉換格式

## 測試建議

1. 測試新增工人並上傳各種類型的圖片
2. 測試編輯現有工人的圖片
3. 測試刪除圖片功能
4. 測試 ZIP 匯入功能，包含圖片檔案
5. 驗證 GridFS 中的檔案是否正確存儲和刪除
6. 確認圖片在前端正確顯示
7. 測試大型圖片檔案的上傳和顯示 