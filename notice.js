const loadingView = document.querySelector("#loadingView");
const invalidView = document.querySelector("#invalidView");
const noticeView = document.querySelector("#noticeView");
const noticeCaseInfo = document.querySelector("#noticeCaseInfo");
const noticeFileView = document.querySelector("#noticeFileView");
const originalFilesView = document.querySelector("#originalFilesView");
const downloadOriginalBtn = document.querySelector("#downloadOriginalBtn");

let currentNotice = null;
let activeModal = null;
let hasAutoOpenedNotice = false;

function setVisible(el, visible) {
  if (el) el.classList.toggle("hidden", !visible);
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

function params() {
  const search = new URLSearchParams(window.location.search);
  return {
    caseId: String(search.get("caseId") || "").trim(),
    token: String(search.get("token") || "").trim()
  };
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
  return merged.filter((file) => file?.previewUrl || file?.downloadUrl || file?.fileName || file?.id || file?.driveFileId);
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
    throw new Error("案件資料回傳不完整，請聯絡承辦人員。");
  }
}

function renderCaseInfo(caseData) {
  noticeCaseInfo.innerHTML = `
    <div><strong>公司名稱</strong><span>${escapeHtml(caseData.companyName)}</span></div>
    <div><strong>求才工作地點</strong><span>${escapeHtml(caseData.workAddress)}</span></div>
    <div><strong>求才時間</strong><span>${escapeHtml(helpers.formatTaiwanDate(caseData.recruitmentDate) || "未提供")}</span></div>
    ${helpers.hasRecruitmentCount(caseData) ? `<div><strong>本次求才人數</strong><span>${escapeHtml(caseData.recruitmentCount)} 人</span></div>` : ""}
  `;
}

function pdfData() {
  return noticeService.pdfData(currentNotice);
}

function qAndAItems() {
  return pdfService.qAndA(pdfData()).map((text) => String(text || "").trim()).filter(Boolean);
}

function closeModal() {
  if (!activeModal) return;
  activeModal.remove();
  activeModal = null;
  document.body.classList.remove("modal-open");
}

function openModal({ title, bodyHtml, wide = false }) {
  closeModal();
  activeModal = document.createElement("div");
  activeModal.className = "file-lightbox";
  activeModal.innerHTML = `
    <div class="content-modal-panel ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <button class="file-lightbox-close" type="button" aria-label="關閉">×</button>
      <header class="content-modal-header"><h2>${escapeHtml(title)}</h2></header>
      <div class="content-modal-body">${bodyHtml}</div>
      <footer class="content-modal-footer"><button class="secondary" type="button" data-modal-close>關閉</button></footer>
    </div>
  `;
  document.body.appendChild(activeModal);
  document.body.classList.add("modal-open");
  activeModal.querySelector(".file-lightbox-close").focus();
}

function openFileModal(file) {
  const kind = fileKind(file);
  const title = file.fileName || "求才登記表";
  const previewUrl = escapeHtml(file.previewUrl || file.downloadUrl || "");
  const preview = kind === "image"
    ? `<div class="file-lightbox-scroll"><img class="file-lightbox-image" src="${previewUrl}" alt="${escapeHtml(title)}"></div>`
    : `<iframe class="file-lightbox-pdf" src="${previewUrl}" title="${escapeHtml(title)}"></iframe><p class="hint">若此瀏覽器無法直接預覽 PDF，請使用頁面下方的「開啟／下載原始求才登記表」。</p>`;
  openModal({
    title,
    wide: true,
    bodyHtml: preview
  });
}

function openFullContentModal() {
  const items = qAndAItems();
  const bodyHtml = items.length
    ? `<ul class="full-content-list">${items.map((item) => {
        const separatorIndex = item.lastIndexOf("：");
        const hasAnswer = separatorIndex > -1 && separatorIndex < item.length - 1;
        const question = hasAnswer ? item.slice(0, separatorIndex + 1) : item;
        const answer = hasAnswer ? item.slice(separatorIndex + 1).trim() : "";
        const normalizedAnswer = answer.replace(/[。．.]+$/u, "").trim();
        return `
          <li>
            <span class="notice-question">${escapeHtml(question)}</span>
            ${answer ? `<span class="notice-answer ${normalizedAnswer === "是" ? "is-yes" : ""}">${escapeHtml(answer)}</span>` : ""}
          </li>
        `;
      }).join("")}</ul>`
    : `<p class="empty">目前尚無完整求才內容。</p>`;
  openModal({ title: "求才通知", bodyHtml });
}

function autoOpenFullContentModalOnce() {
  if (hasAutoOpenedNotice) return;
  hasAutoOpenedNotice = true;
  openFullContentModal();
}

function setOriginalDownload(file) {
  if (!file?.downloadUrl && !file?.previewUrl) {
    downloadOriginalBtn.removeAttribute("href");
    downloadOriginalBtn.classList.add("disabled");
    downloadOriginalBtn.hidden = true;
    return;
  }
  downloadOriginalBtn.href = file.downloadUrl || file.previewUrl;
  downloadOriginalBtn.classList.remove("disabled");
  downloadOriginalBtn.hidden = false;
}

function renderTextNotice(caseData) {
  const data = pdfData();
  if (!helpers.latestSubmission(data)) {
    noticeFileView.innerHTML = `<p class="empty">求才內容尚未建立。</p>`;
    return;
  }
  const summaryRows = [
    ["產業類別", caseData.industry || "未提供"],
    ["工作時間", pdfService.workTimeText(data) || "08:00～17:00"],
    ["公開求才電話", caseData.publicPhone || "未提供"],
    ["求才工作地點", caseData.workAddress || "未提供"],
    ["求才時間", helpers.formatTaiwanDate(caseData.recruitmentDate) || "未提供"]
  ];
  noticeFileView.innerHTML = `
    <div class="notice-text-preview summary-only">
      <dl>
        ${summaryRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
      </dl>
      <div class="action-row">
        <button id="openFullContentBtn" class="primary" type="button">再次查看求才通知</button>
      </div>
    </div>
  `;
  document.querySelector("#openFullContentBtn")?.addEventListener("click", openFullContentModal);
}

async function hydrateNoticeFiles(files) {
  const { caseId, token } = params();
  const results = await Promise.allSettled(files.map(async (file) => {
    const fileId = file.id || file.noticeFileId || file.fileId || file.driveFileId || "";
    if ((file.previewUrl || "").startsWith("data:")) {
      return file;
    }
    const loaded = await noticeService.getNoticeFile(caseId, token, fileId);
    return { ...file, ...loaded };
  }));
  const hydrated = results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const file = files[index];
    const error = result.reason;
    const fileId = file.id || file.noticeFileId || file.fileId || file.driveFileId || "";
    console.warn("求才登記表檔案讀取失敗", {
      caseId,
      fileName: file.fileName,
      fileId,
      code: error?.code || "",
      message: error?.message || String(error)
    });
    return { ...file, previewError: true };
  });
  currentNotice.noticeFiles = hydrated;
  currentNotice.noticeFile = hydrated[0] || currentNotice.noticeFile || {};
  return hydrated;
}

function renderOriginalFilesLoading(files) {
  setOriginalDownload(null);
  if (!files.length) {
    originalFilesView.innerHTML = `<p class="empty">尚未上傳求才登記表。</p>`;
    return;
  }
  originalFilesView.innerHTML = files.map((file, index) => `
    <article class="notice-file-card" aria-busy="true">
      <div class="notice-file-card-title">
        <strong>${escapeHtml(file.fileName || `求才登記表 ${index + 1}`)}</strong>
        <span>${escapeHtml(file.mimeType || file.fileType || "")}</span>
      </div>
      <p class="file-fallback" role="status">檔案載入中……</p>
    </article>
  `).join("");
}

async function loadNoticeFiles(files, caseData) {
  if (!files.length) return;
  const hydrated = await hydrateNoticeFiles(files);
  renderOriginalFiles(hydrated, caseData);
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
    if (file.previewError || (!previewUrl && !downloadUrl)) {
      return `
        <article class="notice-file-card">
          <div class="notice-file-card-title"><strong>${title}</strong><span>${escapeHtml(file.mimeType || file.fileType || "")}</span></div>
          <p class="file-fallback">檔案預覽載入失敗</p>
        </article>
      `;
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
        srcType: item.getAttribute("src")?.startsWith("data:") ? "data-url" : "url"
      });
    });
  });
}

originalFilesView.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-file-index]");
  if (!trigger) return;
  const file = noticeFiles()[Number(trigger.dataset.fileIndex)];
  if (file) openFileModal(file);
});

document.addEventListener("click", (event) => {
  if (!activeModal) return;
  if (event.target === activeModal || event.target.closest(".file-lightbox-close") || event.target.closest("[data-modal-close]")) {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

async function boot() {
  const { caseId, token } = params();
  if (!caseId || !token) {
    renderError("通知連結缺少必要參數。");
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
      noticeFiles: currentNotice.noticeFiles
    });
    assertNoticeData(currentNotice);
    renderCaseInfo(currentNotice.caseData);
    renderTextNotice(currentNotice.caseData);
    const files = noticeFiles(currentNotice);
    renderOriginalFilesLoading(files);
    setVisible(invalidView, false);
    setVisible(noticeView, true);
    autoOpenFullContentModalOnce();
    loadNoticeFiles(files, currentNotice.caseData).catch((error) => {
      console.warn("求才登記表附件區載入失敗", {
        caseId,
        code: error?.code || "",
        message: error?.message || String(error)
      });
      renderOriginalFiles(files.map((file) => ({ ...file, previewError: true })), currentNotice.caseData);
    });
    noticeService.recordNoticeView(caseId, token).catch((error) => {
      console.warn("通知瀏覽紀錄寫入失敗", error);
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
  } finally {
    setVisible(loadingView, false);
  }
}

boot();
