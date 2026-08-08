let currentCase = null;
let noticeUploadInProgress = false;

const missingView = document.querySelector("#missingView");
const missingTitle = document.querySelector("#missingTitle");
const missingText = document.querySelector("#missingText");
const loadingView = document.querySelector("#loadingView");
const retryLoadBtn = document.querySelector("#retryLoadBtn");
const detailView = document.querySelector("#detailView");
const caseHeader = document.querySelector("#caseHeader");
const latestResponseMeta = document.querySelector("#latestResponseMeta");
const latestResponseContent = document.querySelector("#latestResponseContent");
const submissionHistory = document.querySelector("#submissionHistory");
const uploadTitle = document.querySelector("#uploadTitle");
const uploadCaseInfo = document.querySelector("#uploadCaseInfo");
const noticeDropZone = document.querySelector("#noticeDropZone");
const noticeFileInput = document.querySelector("#noticeFileInput");
const fileSummary = document.querySelector("#fileSummary");
const uploadProgress = document.querySelector("#uploadProgress");
const noticeResult = document.querySelector("#noticeResult");
const noticePreview = document.querySelector("#noticePreview");
const noticeHistory = document.querySelector("#noticeHistory");
const openNoticeLinkBtn = document.querySelector("#openNoticeLinkBtn");
const copyNoticeLinkBtn = document.querySelector("#copyNoticeLinkBtn");
const deleteNoticeBtn = document.querySelector("#deleteNoticeBtn");

function setVisible(el, visible) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
}

function safeCaseIdFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get("caseId")?.trim() || "";
  } catch (error) {
    console.warn("caseId 解析失敗", error);
    return "";
  }
}

function readableError(error, fallback = "案件資料載入失敗，請稍後再試。") {
  return error?.message || String(error || "") || fallback;
}

function showLoading() {
  setVisible(loadingView, true);
  setVisible(missingView, false);
  setVisible(detailView, false);
}

function showMessage(title, message, canRetry = true) {
  missingTitle.textContent = title;
  missingText.textContent = message;
  if (retryLoadBtn) retryLoadBtn.classList.toggle("hidden", !canRetry);
  setVisible(loadingView, false);
  setVisible(detailView, false);
  setVisible(missingView, true);
}

function copyText(text) {
  return navigator.clipboard.writeText(text);
}

function rowsHtml(rows) {
  return rows.map(([key, value]) => `<div><strong>${key}</strong><span>${value || ""}</span></div>`).join("");
}

function responseRows(data) {
  return [
    ["公司", data.companyName],
    ["工作地點", data.workAddress],
    ...(helpers.hasRecruitmentCount(data) ? [["本次求才人數", `${data.recruitmentCount}人`]] : []),
    ["工作時間", pdfService.workTimeText(data)],
    ["班別時間", data.shifts?.length ? data.shifts.map((s) => `${s.name} ${helpers.displayTime(s.start)}～${helpers.displayTime(s.end)}`).join("；") : "無"],
    ["輪班制度", data.rotationMethod || data.shiftType],
    ["部分工時", data.partTimes?.length ? data.partTimes.map((p, index) => `第${index + 1}段 ${helpers.displayTime(p.start)}～${helpers.displayTime(p.end)}`).join("；") : "無"],
    ["休假方式", pdfService.leaveText(data)],
    ["哺乳或集乳室", data.lactationRoom],
    ["托兒服務", pdfService.childcareText(data)],
    ["其他補充說明", data.shiftNote || ""]
  ];
}

function renderHeader() {
  caseHeader.innerHTML = `
    <div>
      <p class="eyebrow">目前處理案件</p>
      <h1>${currentCase.companyName || "未命名公司"}</h1>
    </div>
    <div class="case-header-grid">
      <div><strong>案件編號</strong><span class="breakable">${currentCase.caseId}</span></div>
      <div><strong>工作地點</strong><span>${currentCase.workAddress || ""}</span></div>
      <div><strong>公司送出時間</strong><span>${helpers.displayDateTime(currentCase.submittedAt) || "尚未送出"}</span></div>
      <div><strong>狀態</strong><span>${helpers.statusLabel(currentCase.status)}</span></div>
      <div><strong>回覆查看</strong><span>${helpers.responseBadge(currentCase)}</span></div>
      <div><strong>查看回覆時間</strong><span>${helpers.displayDateTime(currentCase.responseViewedAt) || "尚未查看"}</span></div>
    </div>
  `;
}

function renderLatestResponse() {
  const latest = helpers.latestSubmission(currentCase);
  if (!latest) {
    latestResponseMeta.innerHTML = `<p class="empty">尚未收到公司回覆。</p>`;
    latestResponseContent.innerHTML = "";
    return;
  }
  const data = submissionService.mergeCaseAndResponse(currentCase);
  latestResponseMeta.innerHTML = rowsHtml([
    ["公司", currentCase.companyName],
    ["案件編號", currentCase.caseId],
    ["回覆編號", latest.submissionId],
    ["回覆時間", helpers.displayDateTime(latest.submittedAt)],
    ["版本", latest.isLatest === false ? "舊版回覆" : "最新回覆"]
  ]);
  latestResponseContent.innerHTML = rowsHtml(responseRows(data));
}

function renderSubmissionHistory() {
  const submissions = [...(currentCase.submissions || [])].reverse();
  if (!submissions.length) {
    submissionHistory.innerHTML = `<p class="empty">尚未有回覆版本。</p>`;
    return;
  }
  submissionHistory.innerHTML = submissions.map((item) => `
    <article class="version-item ${item.isLatest ? "latest" : ""}">
      <strong>${item.submissionId}</strong>
      <span>${helpers.displayDateTime(item.submittedAt)}</span>
      <em>${item.isLatest ? "最新回覆" : "舊版回覆"}</em>
    </article>
  `).join("");
}

function renderUploadSection() {
  const latest = helpers.latestSubmission(currentCase);
  uploadTitle.textContent = `為「${currentCase.companyName || "未命名公司"}」公司上傳求才內容`;
  uploadCaseInfo.innerHTML = `
    <strong>案件編號：${currentCase.caseId}</strong>
    <span>本次上傳的求才內容將綁定至此案件及此筆公司回覆，提供公司後續查看與下載。</span>
    <span>預設對應回覆：${latest?.submissionId || "尚未綁定"}</span>
  `;
}

function renderNoticeData() {
  const hasNotice = Boolean(currentCase.noticeFileUrl || currentCase.noticeFileKey);
  openNoticeLinkBtn.href = hasNotice ? helpers.buildNoticeUrl(currentCase) : "#";
  copyNoticeLinkBtn.disabled = !hasNotice;
  deleteNoticeBtn.disabled = !hasNotice;
  openNoticeLinkBtn.classList.toggle("disabled", !hasNotice);
  if (hasNotice) {
    noticeResult.innerHTML = rowsHtml([
      ["公司", currentCase.companyName],
      ["案件編號", currentCase.caseId],
      ["對應回覆", currentCase.noticeSubmissionId || "尚未綁定"],
      ["檔案名稱", currentCase.noticeFileName],
      ["上傳時間", helpers.displayDateTime(currentCase.noticeUploadedAt)],
      ["檔案格式", currentCase.noticeFileType],
      ["檔案大小", helpers.fileSizeText(currentCase.noticeFileSize)],
      ["上傳者", currentCase.noticeUploadedBy || "仲介端"],
      ["公司查看連結", helpers.buildNoticeUrl(currentCase)]
    ]);
    const isPdf = currentCase.noticeFileType === "application/pdf";
    noticePreview.innerHTML = currentCase.noticeFileUrl ? (isPdf
      ? `<iframe class="notice-pdf-preview" src="${currentCase.noticeFileUrl}" title="求才內容"></iframe>`
      : `<img class="notice-thumb" src="${currentCase.noticeFileUrl}" alt="求才內容">`) : `<p class="hint">求才內容已儲存，請由公司查看頁預覽。</p>`;
  } else {
    noticeResult.innerHTML = `<p class="empty">尚未上傳求才內容。</p>`;
    noticePreview.innerHTML = "";
  }
  const oldNotices = currentCase.noticeHistory || [];
  noticeHistory.innerHTML = oldNotices.length
    ? `<h3>舊版通知</h3>${oldNotices.slice().reverse().map((item) => `<article class="version-item old"><strong>${item.noticeFileName}</strong><span>對應回覆：${item.submissionId || ""}</span><em>${item.versionStatus || "舊版"}</em></article>`).join("")}`
    : "";
}

function resetUploadState(clearMessage = true) {
  noticeFileInput.value = "";
  noticeFileInput.disabled = false;
  noticeDropZone.classList.remove("dragging", "uploading");
  noticeDropZone.removeAttribute("aria-busy");
  fileSummary.innerHTML = "";
  setVisible(fileSummary, false);
  if (clearMessage) uploadProgress.textContent = "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("FileReader 讀取檔案失敗。"));
    reader.readAsDataURL(file);
  });
}

async function uploadFile(file) {
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!file || !allowed.includes(file.type)) {
    resetUploadState(false);
    uploadProgress.textContent = "請選擇 JPG、PNG、WEBP 或 PDF 檔案。";
    return;
  }
  if (!currentCase?.caseId || noticeUploadInProgress) return;
  const uploadCaseId = currentCase.caseId;
  const latest = helpers.latestSubmission(currentCase);
  const fileData = { name: file.name, type: file.type, size: file.size, blob: file };
  noticeUploadInProgress = true;
  noticeFileInput.disabled = true;
  noticeDropZone.classList.add("uploading");
  noticeDropZone.setAttribute("aria-busy", "true");
  fileSummary.innerHTML = rowsHtml([
    ["公司名稱", currentCase.companyName],
    ["案件編號", uploadCaseId],
    ["公司送出時間", helpers.displayDateTime(latest?.submittedAt) || "尚未送出"],
    ["對應回覆", latest?.submissionId || "尚未綁定"],
    ["上傳檔名", file.name],
    ["檔案格式", file.type],
    ["檔案大小", helpers.fileSizeText(file.size)]
  ]);
  setVisible(fileSummary, true);
  uploadProgress.textContent = "正在準備檔案...";
  try {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") fileData.dataUrl = await fileToDataUrl(file);
    uploadProgress.textContent = "上傳中...";
    const pageCaseId = helpers.getCaseIdFromUrl();
    const latestRecord = await caseService.getCase(pageCaseId);
    if (!latestRecord || latestRecord.caseId !== uploadCaseId || pageCaseId !== uploadCaseId) throw new Error("目前案件已切換，請重新選擇檔案。");
    const latestSubmission = helpers.latestSubmission(latestRecord);
    currentCase = await caseService.uploadNoticeFile(latestRecord.caseId, fileData, {
      expectedCaseId: uploadCaseId,
      submissionId: latestSubmission?.submissionId || "",
      uploadedBy: "仲介端"
    });
    fileSummary.innerHTML = "";
    setVisible(fileSummary, false);
    renderAll();
    uploadProgress.textContent = "求才內容已成功上傳。";
  } catch (error) {
    console.error("正式通知上傳失敗", error);
    uploadProgress.textContent = error.message || "上傳失敗，請重新選擇檔案。";
  } finally {
    noticeUploadInProgress = false;
    noticeFileInput.disabled = false;
    noticeFileInput.value = "";
    noticeDropZone.classList.remove("uploading");
    noticeDropZone.removeAttribute("aria-busy");
  }
}

function renderAll() {
  renderHeader();
  renderLatestResponse();
  renderSubmissionHistory();
  renderUploadSection();
  renderNoticeData();
}

async function initDetailPage() {
  showLoading();
  try {
    const caseId = safeCaseIdFromUrl();
    if (!caseId) {
      showMessage("缺少案件編號", "請從案件列表進入案件詳情，或確認網址中包含 caseId。", false);
      return;
    }
    currentCase = await caseService.getCase(caseId);
    if (!currentCase) {
      showMessage("案件不存在", "找不到此案件，案件可能已刪除或連結錯誤。", true);
      return;
    }
    if (currentCase.caseId && currentCase.caseId !== caseId) {
      console.warn("案件編號回傳不一致", { requestedCaseId: caseId, returnedCaseId: currentCase.caseId });
    }
    if (currentCase.hasUnreadResponse) {
      try {
        currentCase = await caseService.markResponseViewed(currentCase.caseId);
      } catch (markError) {
        console.warn("回覆查看狀態更新失敗", markError);
      }
    }
    resetUploadState();
    renderAll();
    setVisible(missingView, false);
    setVisible(detailView, true);
  } catch (error) {
    console.warn("案件資料載入失敗", error);
    const summary = readableError(error);
    if (/不存在|失效|404/.test(summary)) {
      showMessage("案件不存在", "找不到此案件，案件可能已刪除或連結錯誤。", true);
    } else {
      showMessage("案件資料載入失敗", summary, true);
    }
  } finally {
    setVisible(loadingView, false);
  }
}

noticeFileInput.addEventListener("change", () => uploadFile(noticeFileInput.files[0]));
noticeDropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  noticeDropZone.classList.add("dragging");
});
noticeDropZone.addEventListener("dragleave", () => noticeDropZone.classList.remove("dragging"));
noticeDropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  noticeDropZone.classList.remove("dragging");
  uploadFile(event.dataTransfer.files[0]);
});
copyNoticeLinkBtn.addEventListener("click", () => currentCase.noticeFileUrl && copyText(helpers.buildNoticeUrl(currentCase)));
deleteNoticeBtn.addEventListener("click", async () => {
  currentCase = await caseService.deleteNoticeFile(currentCase.caseId);
  resetUploadState();
  renderAll();
});

retryLoadBtn?.addEventListener("click", initDetailPage);

initDetailPage().catch((error) => {
  console.warn("案件詳情初始化失敗", error);
  showMessage("案件資料載入失敗", readableError(error), true);
  setVisible(loadingView, false);
});
