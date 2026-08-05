let currentCase = null;
let pendingFile = null;
let pendingFileData = null;
let pendingUploadCaseId = "";

const missingView = document.querySelector("#missingView");
const missingTitle = document.querySelector("#missingTitle");
const missingText = document.querySelector("#missingText");
const detailView = document.querySelector("#detailView");
const caseHeader = document.querySelector("#caseHeader");
const progressPanel = document.querySelector("#progressPanel");
const latestResponseMeta = document.querySelector("#latestResponseMeta");
const latestResponseContent = document.querySelector("#latestResponseContent");
const submissionHistory = document.querySelector("#submissionHistory");
const editCaseForm = document.querySelector("#editCaseForm");
const uploadTitle = document.querySelector("#uploadTitle");
const uploadCaseInfo = document.querySelector("#uploadCaseInfo");
const noticeDropZone = document.querySelector("#noticeDropZone");
const noticeFileInput = document.querySelector("#noticeFileInput");
const fileSummary = document.querySelector("#fileSummary");
const uploadProgress = document.querySelector("#uploadProgress");
const confirmUploadBtn = document.querySelector("#confirmUploadBtn");
const noticeResult = document.querySelector("#noticeResult");
const noticePreview = document.querySelector("#noticePreview");
const noticeHistory = document.querySelector("#noticeHistory");
const openNoticeLinkBtn = document.querySelector("#openNoticeLinkBtn");
const copyNoticeLinkBtn = document.querySelector("#copyNoticeLinkBtn");
const deleteNoticeBtn = document.querySelector("#deleteNoticeBtn");
const openFormLink = document.querySelector("#openFormLink");
const copyFormLinkBtn = document.querySelector("#copyFormLinkBtn");
const reopenBtn = document.querySelector("#reopenBtn");
const downloadInternalPdfBtn = document.querySelector("#downloadInternalPdfBtn");
const pdfTemplate = document.querySelector("#pdfTemplate");

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function setVisible(el, visible) {
  el.classList.toggle("hidden", !visible);
}

function copyText(text) {
  return navigator.clipboard.writeText(text);
}

function clearErrors(root = document) {
  $$(".error-text", root).forEach((el) => el.remove());
  $$(".field-error", root).forEach((el) => el.classList.remove("field-error"));
}

function addError(target, message) {
  target.classList.add("field-error");
  const error = document.createElement("div");
  error.className = "error-text";
  error.textContent = message;
  (target.closest("label") || target.parentElement).appendChild(error);
}

function selected(name, root = editCaseForm) {
  return $(`[name="${name}"]:checked`, root)?.value || "";
}

function collectCaseInput(root = editCaseForm) {
  return {
    companyName: root.companyName.value.trim(),
    workAddress: root.workAddress.value.trim(),
    recruitmentCount: root.recruitmentCount.value.trim(),
    contactName: root.contactName.value.trim(),
    contactPhone: root.contactPhone.value.trim(),
    extension: root.extension.value.trim(),
    recruitmentDate: root.recruitmentDate.value,
    industry: root.industry.value.trim(),
    salaryMin: root.salaryMin.value.trim(),
    salaryMax: root.salaryMax.value.trim(),
    publicPhone: root.publicPhone.value.trim(),
    agencyCompany: selected("agencyCompany", root)
  };
}

function validateCaseInput(input, root = editCaseForm) {
  clearErrors(root);
  let valid = true;
  const fail = (target, message) => {
    valid = false;
    addError(target, message);
  };
  if (!input.companyName) fail(root.companyName, "請填寫公司名稱。");
  if (!input.workAddress) fail(root.workAddress, "請填寫工作地點。");
  if (input.recruitmentCount && !helpers.isPositiveInteger(input.recruitmentCount)) fail(root.recruitmentCount, "求才人數有輸入時只能是正整數。");
  if (input.salaryMin && !/^\d+$/.test(input.salaryMin)) fail(root.salaryMin, "薪資下限只能輸入數字。");
  if (input.salaryMax && !/^\d+$/.test(input.salaryMax)) fail(root.salaryMax, "薪資上限只能輸入數字。");
  if (input.salaryMin && input.salaryMax && Number(input.salaryMin) > Number(input.salaryMax)) fail(root.salaryMax, "薪資上限不可低於薪資下限。");
  return valid;
}

function fillEditForm(caseRecord) {
  editCaseForm.caseId.value = caseRecord.caseId;
  editCaseForm.companyName.value = caseRecord.companyName || "";
  editCaseForm.workAddress.value = caseRecord.workAddress || "";
  editCaseForm.recruitmentCount.value = helpers.hasRecruitmentCount(caseRecord) ? caseRecord.recruitmentCount : "";
  editCaseForm.contactName.value = caseRecord.contactName || "";
  editCaseForm.contactPhone.value = caseRecord.contactPhone || "";
  editCaseForm.extension.value = caseRecord.extension || "";
  editCaseForm.recruitmentDate.value = caseRecord.recruitmentDate || "";
  editCaseForm.industry.value = caseRecord.industry || "";
  editCaseForm.salaryMin.value = Number(caseRecord.salaryMin) > 0 ? caseRecord.salaryMin : "";
  editCaseForm.salaryMax.value = Number(caseRecord.salaryMax) > 0 ? caseRecord.salaryMax : "";
  editCaseForm.publicPhone.value = caseRecord.publicPhone || "";
  const agency = $(`[name="agencyCompany"][value="${caseRecord.agencyCompany}"]`, editCaseForm);
  if (agency) agency.checked = true;
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

function renderProgress() {
  const steps = [
    ["待公司填寫", currentCase.status !== CASE_STATUS.pending],
    ["公司已回覆", Boolean(helpers.latestSubmission(currentCase))],
    ["補齊案件資料", helpers.hasCompleteSalary(currentCase) || currentCase.status === CASE_STATUS.notice_ready],
    ["上傳求才內容", Boolean(currentCase.noticeFileUrl)],
    ["公司查看通知", Boolean(currentCase.noticeViewed)]
  ];
  progressPanel.innerHTML = steps.map(([label, done], index) => `<div class="${done ? "done" : ""}"><b>${index + 1}</b><span>${label}</span></div>`).join("");
  const hasSubmission = Boolean(helpers.latestSubmission(currentCase));
  reopenBtn.disabled = !hasSubmission || currentCase.status === CASE_STATUS.revision_open;
  downloadInternalPdfBtn.disabled = !hasSubmission;
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
  confirmUploadBtn.disabled = false;
}

function renderNoticeData() {
  const hasNotice = Boolean(currentCase.noticeFileUrl || currentCase.noticeFileKey);
  openNoticeLinkBtn.href = hasNotice ? helpers.noticeUrl(currentCase) : "#";
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
      ["公司查看連結", helpers.noticeUrl(currentCase)]
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

function renderViewRecord() {
  viewRecord.innerHTML = rowsHtml([
    ["查看狀態", currentCase.noticeViewed ? "已查看" : "尚未查看"],
    ["首次查看時間", helpers.displayDateTime(currentCase.firstViewedAt) || "尚未查看"],
    ["最後查看時間", helpers.displayDateTime(currentCase.lastViewedAt) || "尚未查看"],
    ["查看次數", currentCase.viewCount ? `${currentCase.viewCount}次` : "0次"]
  ]);
}

function resetPendingFile() {
  pendingFile = null;
  pendingFileData = null;
  pendingUploadCaseId = "";
  noticeFileInput.value = "";
  fileSummary.innerHTML = "";
  setVisible(fileSummary, false);
  setVisible(confirmUploadBtn, false);
  uploadProgress.textContent = "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("FileReader 讀取檔案失敗。"));
    reader.readAsDataURL(file);
  });
}

async function prepareFile(file) {
  const latest = helpers.latestSubmission(currentCase);
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!file || !allowed.includes(file.type)) {
    uploadProgress.textContent = "請選擇 JPG、PNG、WEBP 或 PDF 檔案。";
    return;
  }
  pendingFile = file;
  pendingUploadCaseId = currentCase.caseId;
  pendingFileData = { name: file.name, type: file.type, size: file.size, blob: file };
  if (CONFIG.ACTIVE_STORAGE_MODE === "remote") {
    try {
      pendingFileData.dataUrl = await fileToDataUrl(file);
    } catch (error) {
      console.error("FileReader 讀取求才內容檔案失敗", { fileName: file.name, fileSize: file.size, error });
      uploadProgress.textContent = "檔案讀取失敗，請重新選擇檔案。";
      resetPendingFile();
      return;
    }
  }
  fileSummary.innerHTML = rowsHtml([
    ["公司名稱", currentCase.companyName],
    ["案件編號", currentCase.caseId],
    ["公司送出時間", helpers.displayDateTime(latest?.submittedAt) || "尚未送出"],
    ["對應回覆", latest?.submissionId || "尚未綁定"],
    ["上傳檔名", file.name],
    ["檔案格式", file.type],
    ["檔案大小", helpers.fileSizeText(file.size)]
  ]);
  setVisible(fileSummary, true);
  setVisible(confirmUploadBtn, true);
  uploadProgress.textContent = CONFIG.ACTIVE_STORAGE_MODE === "local"
    ? "已選擇檔案。本機測試模式會將檔案暫存在此瀏覽器。"
    : "已選擇檔案。確認後會上傳至 Google Drive。";
}

async function uploadPendingFile() {
  if (!pendingFileData || !pendingUploadCaseId) return;
  const pageCaseId = helpers.getCaseIdFromUrl();
  const latestRecord = await caseService.getCase(pageCaseId);
  const latest = helpers.latestSubmission(latestRecord);
  if (!latestRecord || latestRecord.caseId !== pendingUploadCaseId || pageCaseId !== pendingUploadCaseId) {
    resetPendingFile();
    uploadProgress.textContent = "目前案件已切換，請重新選擇檔案。";
    return;
  }
  confirmUploadBtn.disabled = true;
  uploadProgress.textContent = "上傳中...";
  try {
    currentCase = await caseService.uploadNoticeFile(latestRecord.caseId, pendingFileData, {
      expectedCaseId: pendingUploadCaseId,
      submissionId: latest?.submissionId || "",
      uploadedBy: "仲介端"
    });
    resetPendingFile();
    renderAll();
    uploadProgress.textContent = "求才內容已成功上傳。";
  } catch (error) {
    console.error("正式通知上傳失敗", error);
    uploadProgress.textContent = error.message || "上傳失敗，請重新選擇檔案。";
  } finally {
    confirmUploadBtn.disabled = false;
  }
}

async function reloadCase() {
  const caseId = helpers.getCaseIdFromUrl();
  if (!caseId) {
    missingTitle.textContent = "缺少案件編號";
    missingText.textContent = "請從案件列表進入案件詳情，或確認網址包含 caseId。";
    setVisible(missingView, true);
    return;
  }
  currentCase = await caseService.getCase(caseId);
  if (!currentCase) {
    missingTitle.textContent = "案件不存在";
    missingText.textContent = "找不到此案件，請返回管理後台確認案件編號。";
    setVisible(missingView, true);
    return;
  }
  if (currentCase.hasUnreadResponse) {
    currentCase = await caseService.markResponseViewed(currentCase.caseId);
  }
  resetPendingFile();
  fillEditForm(currentCase);
  openFormLink.href = helpers.formUrl(currentCase);
  setVisible(detailView, true);
  renderAll();
}

function renderAll() {
  renderHeader();
  renderProgress();
  renderLatestResponse();
  renderSubmissionHistory();
  renderUploadSection();
  renderNoticeData();
  renderViewRecord();
}

editCaseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = collectCaseInput();
  if (!validateCaseInput(input)) return;
  currentCase = await caseService.updateCaseDetails(currentCase.caseId, input);
  fillEditForm(currentCase);
  renderAll();
});

noticeFileInput.addEventListener("change", () => prepareFile(noticeFileInput.files[0]));
noticeDropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  noticeDropZone.classList.add("dragging");
});
noticeDropZone.addEventListener("dragleave", () => noticeDropZone.classList.remove("dragging"));
noticeDropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  noticeDropZone.classList.remove("dragging");
  prepareFile(event.dataTransfer.files[0]);
});
confirmUploadBtn.addEventListener("click", uploadPendingFile);
copyFormLinkBtn.addEventListener("click", () => copyText(helpers.formUrl(currentCase)));
copyNoticeLinkBtn.addEventListener("click", () => currentCase.noticeFileUrl && copyText(helpers.noticeUrl(currentCase)));
reopenBtn.addEventListener("click", async () => {
  currentCase = await caseService.reopenForRevision(currentCase.caseId);
  resetPendingFile();
  renderAll();
});
deleteNoticeBtn.addEventListener("click", async () => {
  currentCase = await caseService.deleteNoticeFile(currentCase.caseId);
  resetPendingFile();
  renderAll();
});
downloadInternalPdfBtn.addEventListener("click", async () => {
  const latest = helpers.latestSubmission(currentCase);
  if (!latest) {
    uploadProgress.textContent = "尚未有公司回覆，無法產生內部預覽。";
    return;
  }
  await pdfService.download(submissionService.mergeCaseAndResponse(currentCase), pdfTemplate);
});

reloadCase();
