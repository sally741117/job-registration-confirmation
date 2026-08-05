const loadingView = document.querySelector("#loadingView");
const invalidView = document.querySelector("#invalidView");
const noticeView = document.querySelector("#noticeView");
const noticeCaseInfo = document.querySelector("#noticeCaseInfo");
const noticeFileView = document.querySelector("#noticeFileView");
const downloadPdfBtn = document.querySelector("#downloadPdfBtn");
const downloadOriginalBtn = document.querySelector("#downloadOriginalBtn");
const pdfTemplate = document.querySelector("#pdfTemplate");

let currentNotice = null;

function setVisible(el, visible) {
  el.classList.toggle("hidden", !visible);
}

function params() {
  const search = new URLSearchParams(window.location.search);
  return {
    caseId: search.get("caseId") || "",
    token: search.get("token") || ""
  };
}

function renderError(message) {
  setVisible(loadingView, false);
  const text = invalidView.querySelector("p");
  if (text) text.textContent = message || "此通知連結無效或尚未開放。";
  setVisible(noticeView, false);
  setVisible(invalidView, true);
}

function assertNoticeData(result) {
  if (!result?.caseData?.companyName || !result?.caseData?.workAddress) {
    throw new Error("案件資料載入不完整，請聯絡承辦人員。");
  }
  if (!result?.noticeFile?.previewUrl || !result?.noticeFile?.downloadUrl) {
    throw new Error("求才內容預覽載入失敗。");
  }
}

function renderCaseInfo(caseData) {
  noticeCaseInfo.innerHTML = `
    <div><strong>公司名稱</strong><span>${caseData.companyName}</span></div>
    <div><strong>求才工作地點</strong><span>${caseData.workAddress}</span></div>
    ${helpers.hasRecruitmentCount(caseData) ? `<div><strong>本次求才人數</strong><span>${caseData.recruitmentCount}人</span></div>` : ""}
  `;
}

function renderNoticeFile(noticeFile) {
  const isPdf = noticeFile.fileType === "application/pdf";
  if (isPdf) {
    noticeFileView.innerHTML = `
      <iframe class="notice-pdf-preview large" src="${noticeFile.previewUrl}" title="求才內容 PDF"></iframe>
      <p class="hint">若 PDF 預覽未顯示，請使用下方「下載原始求才內容」。</p>
    `;
  } else {
    noticeFileView.innerHTML = `
      <a href="${noticeFile.previewUrl}" target="_blank" rel="noreferrer">
        <img id="noticePreviewImage" class="notice-image" src="${noticeFile.previewUrl}" alt="求才內容預覽">
      </a>
      <p class="hint">點擊圖片可開啟大圖。</p>
    `;
    const image = document.querySelector("#noticePreviewImage");
    image.addEventListener("error", () => {
      noticeFileView.innerHTML = `<p class="empty">求才內容預覽載入失敗。</p>`;
    });
  }
  downloadOriginalBtn.href = noticeFile.downloadUrl;
  downloadOriginalBtn.download = noticeFile.fileName || "求才內容";
}

function validatePdfData(data) {
  const required = [
    ["companyName", "公司名稱"],
    ["contactName", "聯絡人"],
    ["contactPhone", "聯絡電話"],
    ["recruitmentDate", "求才時間"],
    ["industry", "產業類別"],
    ["workAddress", "工作地點"],
    ["agencyCompany", "承辦仲介公司"]
  ];
  const missing = required.filter(([key]) => !String(data[key] || "").trim()).map(([, label]) => label);
  if (!helpers.latestSubmission(data)) missing.push("最新公司回覆");
  if (missing.length) throw new Error(`求才通知單資料尚未完整，請聯絡承辦人員。缺少：${missing.join("、")}`);
}

downloadPdfBtn.addEventListener("click", async () => {
  if (!currentNotice) return;
  downloadPdfBtn.disabled = true;
  downloadPdfBtn.textContent = "產生中...";
  try {
    const pdfData = noticeService.pdfData(currentNotice);
    validatePdfData(pdfData);
    await pdfService.download(pdfData, pdfTemplate);
  } catch (error) {
    console.error("下載求才通知單 PDF 失敗", error);
    alert("求才通知單資料尚未完整，請聯絡承辦人員。");
  } finally {
    downloadPdfBtn.disabled = false;
    downloadPdfBtn.textContent = "下載求才通知單 PDF";
  }
});

async function boot() {
  const { caseId, token } = params();
  if (!caseId || !token) {
    renderError("此通知連結無效或尚未開放。");
    return;
  }
  try {
    const record = await noticeService.getPublicNotice(caseId, token);
    const viewed = await noticeService.recordNoticeView(caseId, token);
    currentNotice = viewed || record;
    assertNoticeData(currentNotice);
    renderCaseInfo(currentNotice.caseData);
    renderNoticeFile(currentNotice.noticeFile);
    setVisible(loadingView, false);
    setVisible(invalidView, false);
    setVisible(noticeView, true);
  } catch (error) {
    console.error("Notice initialization failed:", error);
    renderError(error.message || "目前無法載入求才通知，請稍後再試或聯絡承辦人員。");
  }
}

boot();
