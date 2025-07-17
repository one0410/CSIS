# Word模板佔位符說明

## 工作許可單模板 (帆宣-ee-4404-01工作許可單.docx)

為了使用docxtemplater自動填充表單資料，請在Word模板中的相應位置添加以下佔位符：

### 基本資料佔位符

```
{applyDate}          - 申請日期
{applyDateYear}      - 申請日期（年份）
{applyDateMonth}     - 申請日期（月份）
{applyDateDay}       - 申請日期（日期）
{workContent}        - 工作內容
{workSite}           - 施工區域
{workArea}           - 工作區域  
{workStartTimeYear}  - 預計施工開始時間（年份）
{workStartTimeMonth} - 預計施工開始時間（月份）
{workStartTimeDay}   - 預計施工開始時間（日期）
{workStartTimeHour}  - 預計施工開始時間（小時）
{workStartTimeMinute}- 預計施工開始時間（分鐘）
{workEndTimeYear}    - 預計施工結束時間（年份）
{workEndTimeMonth}   - 預計施工結束時間（月份）
{workEndTimeDay}     - 預計施工結束時間（日期）
{workEndTimeHour}    - 預計施工結束時間（小時）
{workEndTimeMinute}  - 預計施工結束時間（分鐘）
{supervisor}         - 監工單位
{supervisorContact}  - 監工姓名
{supervisorPhone}    - 監工電話
{projectNo}          - 工程編號
{projectName}        - 工程名稱
{applicant}          - 申請人
{remarks}            - 備註
```

### 作業類別勾選框佔位符

```
{isNo1}              - 動火作業（true/false）
{isNo2}              - 高架作業（true/false）
{isNo3}              - 局限空間作業（true/false）
{isNo4}              - 電力作業（true/false）
{isNo5}              - 吊籠作業（true/false）
{isNo6}              - 起重吊掛作業（true/false）
{isNo7}              - 施工架組裝作業（true/false）
{isNo8}              - 管線拆離作業（true/false）
{isNo9}              - 開口作業（true/false）
{isNo10}             - 化學作業（true/false）
{isNo11}             - 其他（true/false）
```

### 簽名區域佔位符

```
{%applicantSignatureImage}         - 申請人簽名圖片
{applicantName}                     - 申請人姓名
{applicantSignDate}                 - 申請人簽名日期

{%departmentManagerSignatureImage} - 申請單位主管簽名圖片
{departmentManagerName}             - 申請單位主管姓名
{departmentManagerSignDate}         - 申請單位主管簽名日期

{%reviewSignatureImage}             - 審核簽名圖片
{reviewName}                        - 審核人姓名
{reviewSignDate}                    - 審核日期

{%approvalSignatureImage}           - 核准簽名圖片
{approvalName}                      - 核准人姓名
{approvalSignDate}                  - 核准日期
```

### 使用方式

1. **文字佔位符**：在Word文檔中，將需要填入動態資料的地方替換為對應的佔位符
   - 格式為 `{變數名稱}`，例如：`{applyDate}`
   - 確保佔位符的大括號是英文字符 `{}`，不是中文字符

2. **圖片佔位符**：簽名圖片使用特殊格式
   - 格式為 `{%變數名稱}`，例如：`{%applicantSignatureImage}`
   - 注意圖片佔位符前面有百分號 `%`

3. **條件佔位符**：勾選框使用true/false值
   - 格式為 `{變數名稱}`，例如：`{isNo1}`
   - 可以配合Word的IF條件語法使用

### 範例

**文字佔位符：**
- 原本：申請日期：_____________
- 修改為：申請日期：{applyDate}

**圖片佔位符：**
- 原本：[簽名區域]
- 修改為：{%applicantSignatureImage}

**條件佔位符（勾選框）：**
- 在Word中可以使用IF語法：`{ IF {isNo1} "☑" "☐" }` 來顯示勾選狀態

### 條件性內容 (進階功能)

如果需要根據條件顯示不同內容，可以使用：

```
{#workTypes}
  {.}
{/workTypes}
```

這會遍歷工作類別陣列並顯示每個項目。

### 測試流程

1. **編輯Word模板，添加佔位符**
   - 文字佔位符：將 `申請日期：___` 改為 `申請日期：{applyDate}`
   - 圖片佔位符：將簽名區域替換為 `{%applicantSignatureImage}` 
   - 作業類別：使用條件佔位符 `{ IF {isNo1} "☑" "☐" }`

2. **在系統中創建一個工地許可單表單**
3. **填入測試資料**（包括添加簽名）
4. **點擊「下載Word」按鈕**
5. **檢查生成的文件是否正確填入資料**

### 常見問題排解

如果遇到問題，請檢查：
- 佔位符是否使用正確的英文大括號 `{}`，不是中文大括號 `｛｝`
- 圖片佔位符是否包含百分號 `{%變數名稱}`
- 變數名稱是否與程式中定義的一致
- Word文檔是否已儲存為 .docx 格式
- 瀏覽器控制台是否有錯誤訊息

### 調試技巧

打開瀏覽器開發者工具(F12)，在下載DOCX時查看控制台輸出：
- 檢查「ImageModule 是否存在」應該為 true
- 檢查「ImageModule 初始化成功」是否出現
- 檢查「模組數量」應該大於 0
- 檢查簽名圖片數據是否正確載入 