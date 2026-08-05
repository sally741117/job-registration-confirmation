const caseForm = document.querySelector("#caseForm");
const createdPanel = document.querySelector("#createdPanel");
const createdInfo = document.querySelector("#createdInfo");
const copyCreatedLink = document.querySelector("#copyCreatedLink");
const openCreatedLink = document.querySelector("#openCreatedLink");
const resetFormBtn = document.querySelector("#resetFormBtn");
const caseList = document.querySelector("#caseList");
const modeBanner = document.querySelector("#modeBanner");
const refreshListBtn = document.querySelector("#refreshListBtn");
const lastUpdatedText = document.querySelector("#lastUpdatedText");
const testConnectionBtn = document.querySelector("#testConnectionBtn");
const useLocalModeBtn = document.querySelector("#useLocalModeBtn");
const connectionResult = document.querySelector("#connectionResult");
const caseFormStatus = document.querySelector("#caseFormStatus");
const createCaseButton = caseForm?.querySelector('button[type="submit"]');

let createdCase = null;
let createInProgress = false;
let createRequestId = "";
let highlightedCaseId = "";
let caseListLoadSerial = 0;
let caseListLoading = false;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function selected(name, root = caseForm) {
  return $(`[name="${name}"]:checked`, root)?.value || "";
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
  target.closest("label").appendChild(error);
}

function messageOf(error, fallback = "操作失敗，請稍後再試。") {
  return error?.message || String(error || "") || fallback;
}

function setFormStatus(message, type = "") {
  if (!caseFormStatus) return;
  caseFormStatus.textContent = message || "";
  caseFormStatus.className = `hint form-status ${type ? `form-status--${type}` : ""}`.trim();
}

function setCreateBusy(isBusy) {
  createInProgress = isBusy;
  if (!createCaseButton) return;
  createCaseButton.disabled = isBusy;
  createCaseButton.textContent = isBusy ? "建立中..." : "建立案件並產生連結";
}

function generateRequestId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `REQ-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderListError(error) {
  const message = messageOf(error, "案件列表載入失敗，請稍後再試。");
  caseList.innerHTML = `
    <div class="empty">
      <p>案件列表更新失敗：${message}</p>
      <button class="secondary" data-action="retryList" type="button">重新載入</button>
    </div>
  `;
}

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isRetryableListError(error) {
  const message = messageOf(error);
  return /逾時|Failed to fetch|NetworkError|Load failed|AbortError|暫時|新建立案件尚未出現在列表/.test(message);
}

function collectCaseInput(root = caseForm) {
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

function validate(input, root = caseForm) {
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

function renderModeBanner() {
  const suffix = CONFIG.ACTIVE_STORAGE_MODE === "local"
    ? "<span>本機測試模式無法跨裝置使用，正式傳給公司前需完成線上後端設定。</span>"
    : "";
  modeBanner.innerHTML = `<strong>${helpers.modeMessage()}</strong>${suffix}`;
  modeBanner.className = `mode-banner ${CONFIG.ACTIVE_STORAGE_MODE}`;
  useLocalModeBtn.classList.toggle("hidden", CONFIG.ACTIVE_STORAGE_MODE === "local");
}

function renderCreated(caseRecord) {
  const url = helpers.formUrl(caseRecord);
  createdInfo.innerHTML = `
    <div><strong>案件編號</strong><span>${caseRecord.caseId}</span></div>
    <div><strong>公司名稱</strong><span>${caseRecord.companyName}</span></div>
    <div><strong>公司填寫連結</strong><span class="breakable">${url}</span></div>
    <div><strong>目前狀態</strong><span>${helpers.statusLabel(caseRecord.status)}</span></div>
  `;
  openCreatedLink.href = url;
  createdPanel.classList.remove("hidden");
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function detailUrl(caseId) {
  const url = new URL(`case-detail.html?caseId=${encodeURIComponent(caseId)}`, window.location.href);
  url.searchParams.set("detailVersion", "20260805-detailfix2");
  if (CONFIG.ACTIVE_STORAGE_MODE === "local") url.searchParams.set("storage", "local");
  return url.href;
}

function workflowText(item) {
  if (item.status === CASE_STATUS.pending) return "待公司填寫";
  if (item.status === CASE_STATUS.submitted) return "公司已回覆，待整理與上傳求才內容";
  if (item.status === CASE_STATUS.preparing_notice) return "求才通知製作中";
  if (item.status === CASE_STATUS.notice_ready) return item.noticeViewed ? "公司已查看通知" : "通知已上傳，待公司查看";
  if (item.status === CASE_STATUS.revision_open) return "已重新開放修改，待公司重新送出";
  return helpers.statusLabel(item.status);
}

function latestSubmissionForList(item) {
  const submissions = Array.isArray(item.submissions)
    ? item.submissions.filter((submission) => submission.caseId === item.caseId)
    : [];
  const linked = item.latestSubmissionId
    ? submissions.find((submission) => submission.submissionId === item.latestSubmissionId)
    : null;
  if (linked) return linked;
  if (![CASE_STATUS.submitted, CASE_STATUS.preparing_notice, CASE_STATUS.notice_ready].includes(item.status)) return null;
  return submissions.find((submission) => submission.isLatest) || submissions[submissions.length - 1] || null;
}

function responseBadgeForList(item, latest) {
  if (!latest) return "尚未回覆";
  return item.hasUnreadResponse ? "新回覆" : "已查看";
}

function noticeStatusForList(item, latest) {
  if (!latest) return "尚未回覆";
  if (item.noticeViewed) return "公司已查看通知";
  if (item.noticeFileUrl) return "通知已上傳";
  return "已回覆，待上傳通知";
}

async function renderCaseList(options = {}) {
  if (caseListLoading && !options.force) return false;
  caseListLoading = true;
  const loadSerial = ++caseListLoadSerial;
  try {
  let cases = [];
  caseList.innerHTML = `<p class="empty">案件資料載入中...</p>`;
  if (
    CONFIG.ACTIVE_STORAGE_MODE === "remote"
    && typeof remoteClient !== "undefined"
    && !remoteClient.isSessionUsable(remoteClient.getAdminSession())
  ) {
    renderListError(new Error("請先登入管理員後重新載入案件列表。建立案件時會開啟登入視窗。"));
    return false;
  }
  try {
    const result = await caseService.listCases();
    if (!Array.isArray(result.cases)) throw new Error("案件列表回傳格式錯誤。");
    cases = result.cases.filter((item) => item.status !== CASE_STATUS.deleted && !item.deletedAt);
    if (options.expectedCaseId && !cases.some((item) => item.caseId === options.expectedCaseId)) {
      throw new Error("新建立案件尚未出現在列表，正在重新讀取。");
    }
  } catch (error) {
    if (loadSerial !== caseListLoadSerial) return false;
    console.error("案件列表更新失敗", error);
    renderListError(error);
    return false;
  }
  if (loadSerial !== caseListLoadSerial) return false;
  lastUpdatedText.textContent = `最後更新：${helpers.displayDateTime(new Date().toISOString())}`;
  if (!cases.length) {
    caseList.innerHTML = `<p class="empty">目前尚未建立案件。</p>`;
    return true;
  }
  caseList.innerHTML = cases.map((item) => {
    const latest = latestSubmissionForList(item);
    const isNew = highlightedCaseId && item.caseId === highlightedCaseId;
    return `
      <article class="case-item admin-list-item ${isNew ? "newly-created" : ""}" data-case-id="${item.caseId}">
        <div><small>公司名稱</small><strong>${item.companyName}</strong></div>
        <div><small>案件編號</small><span class="breakable">${item.caseId}</span></div>
        <div><small>工作地點</small><span>${item.workAddress || ""}</span></div>
        <div><small>建立時間</small><span>${helpers.displayDateTime(item.createdAt)}</span></div>
        <div><small>最新回覆時間</small><span>${helpers.displayDateTime(latest?.submittedAt) || "尚未回覆"}</span></div>
        <div><small>回覆查看</small><span class="unread-badge ${latest && item.hasUnreadResponse ? "new" : ""}">${responseBadgeForList(item, latest)}</span></div>
        <div><small>正式通知狀態</small><span>${noticeStatusForList(item, latest)}</span></div>
        <div><small>目前狀態</small><span class="status ${item.status}">${helpers.statusLabel(item.status)}</span></div>
        <div class="action-row">
          <details class="more-actions">
            <summary>更多操作</summary>
            <div class="more-actions-menu">
              <button class="danger" data-action="deleteCase" data-id="${item.caseId}" type="button">刪除案件</button>
            </div>
          </details>
          ${(item.status === CASE_STATUS.pending || item.status === CASE_STATUS.revision_open) ? `<button class="secondary" data-action="copyForm" data-id="${item.caseId}" type="button">複製填寫連結</button><a class="secondary link-button" href="${helpers.formUrl(item)}" target="_blank" rel="noreferrer">開啟公司填寫頁</a>` : ""}
          <a class="primary link-button" href="${detailUrl(item.caseId)}">開啟案件詳情</a>
          ${item.status === CASE_STATUS.notice_ready ? `<button class="secondary" data-action="copyNotice" data-id="${item.caseId}" type="button">複製通知查看網址</button><a class="secondary link-button" href="${helpers.noticeUrl(item)}" target="_blank" rel="noreferrer">開啟通知頁</a>` : ""}
        </div>
      </article>
    `;
  }).join("");
  if (highlightedCaseId) {
    [...caseList.querySelectorAll("[data-case-id]")]
      .find((element) => element.dataset.caseId === highlightedCaseId)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return true;
  } finally {
    if (loadSerial === caseListLoadSerial) caseListLoading = false;
  }
}

async function renderCaseListWithRetry(options = {}) {
  const delays = [0, 500, 1000, 2000];
  let lastRetryableError = null;
  for (let index = 0; index < delays.length; index += 1) {
    if (delays[index]) await delay(delays[index]);
    const updated = await renderCaseList(options);
    if (updated) return true;
    const currentText = caseList.textContent || "";
    lastRetryableError = new Error(currentText || "案件列表更新失敗。");
    if (!isRetryableListError(lastRetryableError)) return false;
  }
  if (lastRetryableError) renderListError(lastRetryableError);
  return false;
}

caseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (createInProgress) return;
  const input = collectCaseInput();
  if (!validate(input)) return;
  if (!createRequestId) createRequestId = generateRequestId();
  setCreateBusy(true);
  setFormStatus("正在建立案件，請稍候。", "loading");
  try {
    createdCase = await withTimeout(
      caseService.createCase({ ...input, requestId: createRequestId }),
      70000,
      "線上服務回應逾時，請重新整理案件列表確認是否已建立。"
    );
    highlightedCaseId = createdCase.caseId || "";
    renderCreated(createdCase);
    setFormStatus("案件建立成功。", "success");
    createRequestId = "";
    setCreateBusy(false);
    let listUpdated = false;
    try {
      listUpdated = await renderCaseListWithRetry({ expectedCaseId: highlightedCaseId, force: true });
    } catch (listError) {
      console.error("案件已建立，但列表更新失敗", listError);
      renderListError(listError);
    }
    if (!listUpdated) {
      setFormStatus("案件已建立成功，但案件列表更新失敗，請按重新載入。", "warning");
    }
  } catch (error) {
    console.error("建立案件失敗", error);
    setFormStatus(`建立案件失敗：${messageOf(error, "請確認 Google Apps Script URL 是否已設定。")}`, "error");
    useLocalModeBtn.classList.remove("hidden");
  } finally {
    setCreateBusy(false);
  }
});

copyCreatedLink.addEventListener("click", async () => {
  if (!createdCase) return;
  await copyText(helpers.formUrl(createdCase));
});

resetFormBtn.addEventListener("click", () => {
  caseForm.reset();
  createdPanel.classList.add("hidden");
  createdCase = null;
});

caseList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "retryList") {
    await renderCaseList();
    return;
  }
  let caseRecord = null;
  try {
    caseRecord = await caseService.getCase(button.dataset.id);
  } catch (error) {
    console.error("案件資料讀取失敗", error);
    alert(`案件資料讀取失敗：${messageOf(error)}`);
    return;
  }
  if (!caseRecord) {
    alert("找不到案件資料，請重新載入列表後再試。");
    return;
  }
  if (button.dataset.action === "copyForm") await copyText(helpers.formUrl(caseRecord));
  if (button.dataset.action === "copyNotice") await copyText(helpers.noticeUrl(caseRecord));
  if (button.dataset.action === "deleteCase") {
    const confirmed = await deleteCaseDialog.confirm(caseRecord);
    if (!confirmed) return;
    try {
      await caseService.deleteCase(caseRecord.caseId);
      if (createdCase?.caseId === caseRecord.caseId) {
        createdCase = null;
        createdPanel.classList.add("hidden");
      }
      await renderCaseList();
    } catch (error) {
      console.error("刪除案件失敗", error);
      alert(error.message || "刪除案件失敗，請稍後再試。");
    }
  }
});

refreshListBtn.addEventListener("click", renderCaseList);
testConnectionBtn.addEventListener("click", async () => {
  testConnectionBtn.disabled = true;
  connectionResult.textContent = "正在測試連線...";
  try {
    const result = await remoteClient.testConnection();
    connectionResult.textContent = result.status;
  } finally {
    testConnectionBtn.disabled = false;
  }
});
useLocalModeBtn.addEventListener("click", () => {
  const url = new URL(window.location.href);
  url.searchParams.set("storage", "local");
  window.location.href = url.href;
});

const requestedCaseId = helpers.getCaseIdFromUrl();
try {
  if (requestedCaseId) {
    window.location.replace(detailUrl(requestedCaseId));
  }
} catch (error) {
  console.error("案件詳情轉址失敗", error);
}

if (!requestedCaseId) {
  try {
    renderModeBanner();
  } catch (error) {
    console.error("模式提示初始化失敗", error);
    if (modeBanner) modeBanner.textContent = helpers.modeMessage();
  }

  try {
    renderCaseList();
  } catch (error) {
    console.error("案件列表初始化失敗", error);
    renderListError(error);
  }

  try {
    window.setInterval(() => {
      renderCaseList().catch((error) => {
        console.error("案件列表定時更新失敗", error);
        renderListError(error);
      });
    }, 45000);
  } catch (error) {
    console.error("案件列表定時更新初始化失敗", error);
  }
}
