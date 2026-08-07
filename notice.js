const loadingView = document.querySelector("#loadingView");
const invalidView = document.querySelector("#invalidView");
const noticeView = document.querySelector("#noticeView");
const noticeCaseInfo = document.querySelector("#noticeCaseInfo");
const noticeFileView = document.querySelector("#noticeFileView");
const originalFilesView = document.querySelector("#originalFilesView");
const downloadPdfBtn = document.querySelector("#downloadPdfBtn");
const downloadOriginalBtn = document.querySelector("#downloadOriginalBtn");
const pdfTemplate = document.querySelector("#pdfTemplate");

let currentNotice = null;
let activeLightbox = null;

function setVisible(el, visible) {
  el.classList.toggle("hidden", !visible);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function fileKind(file = {}) {
  const type = String(file.mimeType || file.fileType || "").toLowerCase();
  const name = String(file.fileName || "").toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(name)) return "image";
  return "other";
}

function noticeFiles(record = currentNotice) {
  const files = Array.isArray(record?.noticeFiles) ? record.noticeFiles : [];
  const single = record?.noticeFile;
  const merged = files.length ? files : (single ? [single] : []);
  return merged.filter((file) => file?.previewUrl || file?.downloadUrl || file?.fileName);
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

function closeLightbox() {
  if (!activeLightbox) return;
  activeLightbox.remove();
  activeLightbox = null;
  document.body.classList.remove("modal-open");
}

function openLightbox(file) {
  closeLightbox();
  const kind = fileKind(file);
  const title = escapeHtml(file.fileName || "求才登記表");
  const previewUrl = escapeHtml(file.previewUrl || file.downloadUrl || "");
  const downloadUrl = escapeHtml(file.downloadUrl || file.previewUrl || "");
  const content = kind === "image"
    ? `<div class="file-lightbox-scroll"><img class="file-lightbox-image" src="${previewUrl}" alt="${title}"></div>`
    : `<iframe class="file-lightbox-pdf" src="${previewUrl}" title="${title}"></iframe><p class="hint">若此瀏覽器無法直接預覽 PDF，請開啟原始檔。</p>`;
  activeLightbox = document.createElement("div");
  activeLightbox.className = "file-lightbox";
  activeLightbox.innerHTML = `
    <div class="file-lightbox-panel" role="dialog" aria-modal="true" aria-label="${title}">
      <button class="file-lightbox-close" type="button" aria-label="關閉">×</button>
      <div class="file-lightbox-header">
        <strong>${title}</strong>
        <a class="secondary link-button" href="${downloadUrl}" target="_blank" rel="noreferrer">開啟原始檔</a>
      </div>
      ${content}
    </div>
  `;
  document.body.appendChild(activeLightbox);
  document.body.classList.add("modal-open");
  activeLightbox.querySelector(".file-lightbox-close").focus();
}

function renderOriginalFiles(files, caseData) {
  const firstAvailable = files.find((file) => file.previewUrl || file.downloadUrl);
  setOriginalDownload(firstAvailable);
  if (!files.length) {
    originalFilesView.innerHTML = `<p class="empty">尚未上傳求才登記表。</p>`;
    return;
  }
  originalFilesView.innerHTML = files.map((file, index) => {
    const kind = fileKind(file);
    const title = escapeHtml(file.fileName || `求才登記表 ${index + 1}`);
    const previewUrl = escapeHtml(file.previewUrl || file.downloadUrl || "");
    const downloadUrl = escapeHtml(file.downloadUrl || file.previewUrl || "");
    if (!previewUrl && !downloadUrl) {
      return `<article class="notice-file-card"><strong>${title}</strong><p class="empty">檔案預覽載入失敗</p></article>`;
    }
    const preview = kind === "image"
      ? `<button class="notice-file-preview zoomable" data-file-index="${index}" type="button" aria-label="放大查看 ${title}"><img src="${previewUrl}" alt="${title}"><span>點擊放大查看</span></button>`
      : kind === "pdf"
        ? `<div class="notice-file-pdf"><iframe src="${previewUrl}" title="${title}"></iframe><button class="secondary" data-file-index="${index}" type="button">放大查看</button></div>`
        : `<p class="hint">此檔案格式無法直接預覽。</p>`;
    return `
      <article class="notice-file-card">
        <div class="notice-file-card-title">
          <strong>${title}</strong>
          <span>${escapeHtml(file.mimeType || file.fileType || "")}</span>
        </div>
        ${preview}
        <div class="action-row">
          <a class="secondary link-button" href="${downloadUrl}" target="_blank" rel="noreferrer">開啟求才登記表</a>
          <a class="secondary link-button" href="${downloadUrl}" download>下載原始檔</a>
        </div>
        <p class="file-fallback hidden">檔案預覽載入失敗</p>
      </article>
    `;
  }).join("");
  originalFilesView.querySelectorAll("img, iframe").forEach((item) => {
    item.addEventListener("error", () => {
      const card = item.closest(".notice-file-card");
      if (card) card.querySelector(".file-fallback")?.classList.remove("hidden");
      console.warn("原始求才登記表預覽載入失敗", {
        caseId: caseData.caseId,
        src: item.getAttribute("src")
      });
    });
  });
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

originalFilesView.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-file-index]");
  if (!trigger) return;
  const file = noticeFiles()[Number(trigger.dataset.fileIndex)];
  if (file) openLightbox(file);
});

document.addEventListener("click", (event) => {
  if (!activeLightbox) return;
  if (event.target === activeLightbox || event.target.closest(".file-lightbox-close")) closeLightbox();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeLightbox();
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
      noticeFile: currentNotice.noticeFile,
      noticeFiles: currentNotice.noticeFiles
    });
    assertNoticeData(currentNotice);
    renderCaseInfo(currentNotice.caseData);
    renderTextNotice(currentNotice.caseData);
    renderOriginalFiles(noticeFiles(currentNotice), currentNotice.caseData);
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
      HEALTH_RESPONSE: "服務請求錯誤",
      NETWORK_ERROR: "網路或 API 錯誤"
    };
    renderError(error.message || "目前無法載入求才通知，請稍後再試或聯絡承辦人員。", titleMap[code] || "求才通知載入失敗");
  }
}

boot();
