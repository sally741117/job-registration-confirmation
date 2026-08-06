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

function renderError(message, title = "此通知連結無效或尚未開放") {
  setVisible(loadingView, false);
  const heading = invalidView.querySelector("h1");
  if (heading) heading.textContent = title;
  const text = invalidView.querySelector("p");
  if (text) text.textContent = message || "此通知連結無效或尚未開放。";
  setVisible(noticeView, false);
  setVisible(invalidView, true);
}

function assertNoticeData(result) {
  if (!result?.caseData?.companyName || !result?.caseData?.workAddress) {
    console.error("通知頁案件資料缺少必要欄位", {
      caseId: result?.caseData?.caseId || "",
      companyName: result?.caseData?.companyName || "",
      workAddress: result?.caseData?.workAddress || "",
      normalized: result
    });
    throw new Error("案件資料載入不完整，請聯絡承辦人員。");
  }
}

function renderCaseInfo(caseData) {
  noticeCaseInfo.innerHTML = `
    <div><strong>公司名稱</strong><span>${caseData.companyName}</span></div>
    <div><strong>求才工作地點</strong><span>${caseData.workAddress}</span></div>
    <div><strong>求才時間</strong><span>${helpers.formatTaiwanDate(caseData.recruitmentDate) || "待承辦人確認"}</span></div>
    ${helpers.hasRecruitmentCount(caseData) ? `<div><strong>本次求才人數</strong><span>${caseData.recruitmentCount}人</span></div>` : ""}
  `;
}

function setOriginalDownload(noticeFile) {
  if (!noticeFile?.previewUrl || !noticeFile?.downloadUrl) {
    downloadOriginalBtn.removeAttribute("href");
    downloadOriginalBtn.removeAttribute("download");
    downloadOriginalBtn.classList.add("disabled");
    downloadOriginalBtn.hidden = true;
    return;
  }
  downloadOriginalBtn.href = noticeFile.downloadUrl;
  downloadOriginalBtn.download = noticeFile.fileName || "求才內容";
  downloadOriginalBtn.classList.remove("disabled");
  downloadOriginalBtn.hidden = false;
}

function renderTextNotice(caseData) {
  const pdfData = noticeService.pdfData(currentNotice);
  const questions = pdfService.qAndA(pdfData);
  if (!helpers.latestSubmission(pdfData)) {
    noticeFileView.innerHTML = `<p class="empty">求才內容尚未建立。</p>`;
    return;
  }
  noticeFileView.innerHTML = `
    <div class="notice-text-preview">
      <dl>
        <div><dt>產業類別</dt><dd>${caseData.industry || "待承辦人確認"}</dd></div>
        <div><dt>工作時間</dt><dd>${pdfService.workTimeText(pdfData) || "08:00～17:00"}</dd></div>
        <div><dt>公開求才電話</dt><dd>${caseData.publicPhone || "待承辦人確認"}</dd></div>
      </dl>
      <ul>${questions.map((item) => `<li>${item}</li>`).join("")}</ul>
    </div>
  `;
}

function renderNoticeFile(noticeFile, caseData) {
  setOriginalDownload(noticeFile);
  if (!noticeFile?.previewUrl || !noticeFile?.downloadUrl) {
    renderTextNotice(caseData);
    return;
  }
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
      console.warn("求才內容原始附件預覽載入失敗，已改用文字版求才內容。", {
        caseId: caseData.caseId,
        fileType: noticeFile.fileType,
        previewUrl: noticeFile.previewUrl
      });
      renderTextNotice(caseData);
    });
  }
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
    currentNotice = record;
    console.info("通知頁案件載入完成", {
      caseId,
      tokenPresent: Boolean(token),
      apiUrl: CONFIG.GOOGLE_APPS_SCRIPT_URL,
      normalizedCase: currentNotice.caseData,
      noticeFile: currentNotice.noticeFile
    });
    assertNoticeData(currentNotice);
    renderCaseInfo(currentNotice.caseData);
    renderNoticeFile(currentNotice.noticeFile, currentNotice.caseData);
    setVisible(loadingView, false);
    setVisible(invalidView, false);
    setVisible(noticeView, true);
    noticeService.recordNoticeView(caseId, token).catch((error) => {
      console.warn("通知查看紀錄寫入失敗", error);
    });
  } catch (error) {
    console.error("Notice initialization failed:", error);
    const code = error?.code || "";
    const titleMap = {
      CASE_NOT_FOUND: "找不到案件",
      INVALID_TOKEN: "連結已失效或驗證失敗",
      INVALID_RESPONSE: "資料格式錯誤",
      NETWORK_ERROR: "網路或 API 錯誤"
    };
    renderError(error.message || "目前無法載入求才通知，請稍後再試或聯絡承辦人員。", titleMap[code] || "求才通知載入失敗");
  }
}

boot();
