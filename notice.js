const invalidView = document.querySelector("#invalidView");
const noticeView = document.querySelector("#noticeView");
const noticeCaseInfo = document.querySelector("#noticeCaseInfo");
const noticeFileView = document.querySelector("#noticeFileView");
const downloadPdfBtn = document.querySelector("#downloadPdfBtn");
const downloadOriginalBtn = document.querySelector("#downloadOriginalBtn");
const pdfTemplate = document.querySelector("#pdfTemplate");

let currentRecord = null;

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

function renderCaseInfo(record) {
  noticeCaseInfo.innerHTML = `
    <div><strong>公司名稱</strong><span>${record.companyName}</span></div>
    <div><strong>求才工作地點</strong><span>${record.workAddress}</span></div>
    ${helpers.hasRecruitmentCount(record) ? `<div><strong>本次求才人數</strong><span>${record.recruitmentCount}人</span></div>` : ""}
  `;
}

function renderNoticeFile(record) {
  const isPdf = record.noticeFileType === "application/pdf";
  if (isPdf) {
    noticeFileView.innerHTML = `<iframe class="notice-pdf-preview large" src="${record.noticeFileUrl}" title="求才內容 PDF"></iframe>`;
  } else {
    noticeFileView.innerHTML = `<a href="${record.noticeFileUrl}" target="_blank" rel="noreferrer"><img class="notice-image" src="${record.noticeFileUrl}" alt="求才內容第 1 頁"></a><p class="hint">第 1 頁，點擊圖片可開啟大圖。</p>`;
  }
  downloadOriginalBtn.href = record.noticeFileUrl;
  downloadOriginalBtn.download = record.noticeFileName || "求才內容";
}

downloadPdfBtn.addEventListener("click", async () => {
  if (!currentRecord?.caseId) return;
  downloadPdfBtn.disabled = true;
  downloadPdfBtn.textContent = "產生中...";
  try {
    await pdfService.downloadForCase(currentRecord.caseId, pdfTemplate);
  } catch (error) {
    console.error("下載求才通知單 PDF 失敗", { caseId: currentRecord.caseId, error });
  } finally {
    downloadPdfBtn.disabled = false;
    downloadPdfBtn.textContent = "下載求才通知單 PDF";
  }
});

async function boot() {
  const { caseId, token } = params();
  if (!caseId || !token) {
    setVisible(invalidView, true);
    return;
  }
  const record = await caseService.validateNoticeAccess(caseId, token);
  if (!record) {
    setVisible(invalidView, true);
    return;
  }
  const viewed = await caseService.recordNoticeView(caseId, token);
  const latest = viewed || record;
  currentRecord = latest;
  renderCaseInfo(latest);
  renderNoticeFile(latest);
  setVisible(noticeView, true);
}

boot();
