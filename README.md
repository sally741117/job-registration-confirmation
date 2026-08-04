# 求才確認系統

這是求才確認系統，包含仲介端建立案件、公司端填寫確認、案件狀態回寫、未讀回覆提示、正式求才通知上傳與公司通知查看頁。

## 本機測試方式

1. 在專案資料夾啟動靜態伺服器。
2. 開啟 `admin.html` 建立案件。
3. 建立後複製 `form.html?caseId=...` 專屬連結。
4. 在同一台電腦、同一個瀏覽器開啟公司填寫連結並送出。
5. 回到 `admin.html` 查看案件狀態與回覆內容。

`localStorage` 只適合本機測試，同一筆資料只能在同一台電腦與同一個瀏覽器看到。若要讓公司手機送出後，仲介在自己的電腦後台看到回覆，必須使用 Google Apps Script 或其他線上後端。

## 正式使用前需要設定

設定位置在 `services.js`：

```js
const CONFIG = {
  STORAGE_MODE: "auto",
  GOOGLE_APPS_SCRIPT_URL: ""
};
```

`auto` 模式會自動判斷：

- `GOOGLE_APPS_SCRIPT_URL` 空白或格式無效：使用本機測試模式。
- `GOOGLE_APPS_SCRIPT_URL` 為有效 Apps Script URL：使用線上模式。

正式上線時需：

1. 部署 `google-apps-script.js` 為 Google Apps Script Web App。
2. 將 Web App URL 填入 `services.js` 的 `GOOGLE_APPS_SCRIPT_URL`。
3. 保持 `STORAGE_MODE` 為 `"auto"`，或在確認 URL 可用後改為 `"remote"`。
4. 確認網頁部署在公司與仲介都能開啟的網址。
5. 求才內容檔案線上模式需由 Apps Script 搭配 Google Drive 儲存；可在 `google-apps-script.js` 的 `SCRIPT_CONFIG.NOTICE_DRIVE_FOLDER_ID` 指定資料夾。

## Google 試算表欄位格式

Apps Script 目前使用工作表 `案件資料`，欄位如下：

`caseId`, `status`, `createdAt`, `updatedAt`, `submittedAt`, `revisionOpenedAt`, `companyName`, `workAddress`, `recruitmentCount`, `contactName`, `contactPhone`, `extension`, `recruitmentDate`, `industry`, `salaryMin`, `salaryMax`, `publicPhone`, `agencyCompany`, `submissionsJson`, `latestSubmissionId`, `responseJson`, `pdfFileName`, `pdfUrl`, `hasUnreadResponse`, `responseViewedAt`, `noticeAccessToken`, `noticeFileId`, `noticeFileName`, `noticeFileType`, `noticeFileUrl`, `noticeUploadedAt`, `noticeSubmissionId`, `noticeUploadedBy`, `noticeHistoryJson`, `noticeViewed`, `firstViewedAt`, `lastViewedAt`, `viewCount`

`status` 至少包含：

- `pending`：待公司填寫
- `submitted`：公司已回覆，待整理
- `preparing_notice`：求才通知製作中
- `notice_ready`：求才通知已完成
- `revision_open`：已重新開放修改

`responseJson` 以 JSON 字串儲存公司端填寫的工時、輪班、休假、哺乳室與托兒服務資料。

`submissionsJson` 會保留每次公司送出的回覆版本，每筆都有 `submissionId`。`latestSubmissionId` 指向最新回覆。

`hasUnreadResponse` 在公司送出時為 `true`，仲介第一次進入案件詳情頁後改為 `false`，並記錄 `responseViewedAt`。

`recruitmentCount` 可為空值/null。尚未確認求才人數時，不要寫入 0；畫面、通知單與 Q&A 只會在求才人數大於 0 時顯示人數內容。

## 重新開放修改

仲介端在公司已回覆後，可於案件詳情頁按「重新開放修改」。系統會將案件狀態改為 `revision_open`，保留原本回覆版本。公司再次開啟原連結時，表單會自動帶入最新一次填寫內容，可修改後再次送出。再次送出會產生新的 `submissionId`，舊通知若已存在會移入 `noticeHistoryJson` 並標記為舊版。

## PDF 產生方式

公司通知頁的「下載求才通知單 PDF」會依 `caseId` 重新讀取最新案件與最新公司回覆，直接產生一頁式 A4 文字 PDF，不使用目前網頁截圖。檔名格式為 `求才通知單_公司名稱_YYYYMMDD.pdf`。

內部產生的求才通知單使用一頁式公版內容：雇主、聯絡人、求才時間、正文、就業中心 Q&A、固定提醒與仲介公司署名。給公司的正式通知單不輸出薪資欄、薪資問答，也不輸出哺乳室、托兒服務、公司本次確認資料等內部確認內容。

## 求才內容上傳與下載

仲介端可上傳 PDF、JPG、PNG、WEBP 作為「求才內容檔案」。公司 `notice.html` 會預覽上傳檔案，並提供兩個不同用途的下載：

- `下載原始求才內容`：下載仲介上傳的原始 PDF/圖片檔。
- `下載求才通知單 PDF`：系統依案件資料與最新公司回覆即時產生 PDF。

local 模式下，案件文字資料存在 `localStorage`，檔案 Blob 存在 IndexedDB，`localStorage` 只保存檔案 metadata 與 `fileKey`。remote 模式下，Apps Script 會將檔案存入 Google Drive，並回寫檔案 ID、檔名、格式、大小與 URL。

## 後台更新

系統已移除 Email 通知。公司送出後只更新案件資料、狀態、送出時間與未讀標記。`admin.html` 會在開啟時重新取得案件列表，並每 45 秒自動更新一次，也提供「重新整理」按鈕與最後更新時間。
