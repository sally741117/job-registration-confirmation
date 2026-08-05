const URL_PARAMS = typeof window === "undefined" ? new URLSearchParams("") : new URLSearchParams(window.location.search);

const CONFIG = {
  STORAGE_MODE: "remote",
  GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbw5O0YNav0Ioec2fwTbnyGRp_CTincrdNaOV_OHpQSMJmhzZJkR_4AnCWFyV9sJlC2b/exec",
  PUBLIC_APP_BASE_URL: "https://sally741117.github.io/job-registration-confirmation"
};

function isValidAppsScriptUrl(value) {
  if (!value || !String(value).trim()) return false;
  try {
    const url = new URL(String(value).trim());
    return url.protocol === "https:" && /script\.google\.com$/.test(url.hostname);
  } catch {
    return false;
  }
}

function resolveStorageMode() {
  const forced = URL_PARAMS.get("storage");
  if (forced === "local") return "local";
  if (forced === "remote" && isValidAppsScriptUrl(CONFIG.GOOGLE_APPS_SCRIPT_URL)) return "remote";
  if (CONFIG.STORAGE_MODE === "remote" && isValidAppsScriptUrl(CONFIG.GOOGLE_APPS_SCRIPT_URL)) return "remote";
  if (CONFIG.STORAGE_MODE === "auto") return isValidAppsScriptUrl(CONFIG.GOOGLE_APPS_SCRIPT_URL) ? "remote" : "local";
  return "local";
}

CONFIG.ACTIVE_STORAGE_MODE = resolveStorageMode();

const CASE_STATUS = {
  pending: "pending",
  submitted: "submitted",
  preparing_notice: "preparing_notice",
  notice_ready: "notice_ready",
  revision_open: "revision_open",
  deleted: "deleted"
};

const STORE_KEYS = {
  cases: "job-registration-cases"
};

const NOTICE_FILE_DB = {
  name: "job-registration-notice-files",
  version: 1,
  storeName: "files"
};

const helpers = {
  pad(value) {
    return String(value).padStart(2, "0");
  },
  todayStamp(date = new Date()) {
    return `${date.getFullYear()}${this.pad(date.getMonth() + 1)}${this.pad(date.getDate())}`;
  },
  timeStamp(date = new Date()) {
    return `${this.pad(date.getHours())}${this.pad(date.getMinutes())}${this.pad(date.getSeconds())}`;
  },
  generateSubmissionId(date = new Date()) {
    const random = Math.random().toString(16).slice(2, 6).toUpperCase().padEnd(4, "0");
    return `SUB-${this.todayStamp(date)}-${this.timeStamp(date)}-${random}`;
  },
  displayDateTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("zh-TW", { hour12: false });
  },
  displayTime(value) {
    return value ? value.replace(":", "：") : "";
  },
  formatMoney(value) {
    return Number(value || 0).toLocaleString("zh-TW");
  },
  hasCompleteSalary(data) {
    return Number(data.salaryMin) > 0 && Number(data.salaryMax) > 0;
  },
  hasRecruitmentCount(data) {
    return Number(data.recruitmentCount) > 0 && Number.isInteger(Number(data.recruitmentCount));
  },
  recruitmentCountText(data) {
    return this.hasRecruitmentCount(data) ? `${Number(data.recruitmentCount)}人` : "待承辦人確認";
  },
  salaryText(data) {
    return this.hasCompleteSalary(data) ? `${this.formatMoney(data.salaryMin)}元～${this.formatMoney(data.salaryMax)}元` : "待承辦人確認";
  },
  salaryAdminText(data) {
    return this.hasCompleteSalary(data) ? this.salaryText(data) : "薪資資料尚未完成";
  },
  safeFilePart(value) {
    return String(value || "未命名公司").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "").slice(0, 40) || "未命名公司";
  },
  isPositiveInteger(value) {
    return /^[1-9]\d*$/.test(String(value || "").trim());
  },
  getCaseIdFromUrl() {
    return new URLSearchParams(window.location.search).get("caseId") || "";
  },
  publicBaseUrl() {
    return String(CONFIG.PUBLIC_APP_BASE_URL || window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "")).replace(/\/$/, "");
  },
  isValidPublicValue(value) {
    const text = String(value || "").trim();
    return Boolean(text && text !== "undefined" && text !== "null");
  },
  formUrl(caseRecordOrId) {
    const caseId = typeof caseRecordOrId === "object" ? caseRecordOrId.caseId : caseRecordOrId;
    const token = typeof caseRecordOrId === "object" ? caseRecordOrId.formAccessToken : "";
    if (!this.isValidPublicValue(caseId) || (CONFIG.ACTIVE_STORAGE_MODE === "remote" && !this.isValidPublicValue(token))) {
      throw new Error("公司填寫連結資料不完整，缺少有效案件編號或填寫 token。");
    }
    const url = new URL(`${this.publicBaseUrl()}/form.html`);
    url.searchParams.set("caseId", caseId);
    if (token) url.searchParams.set("token", token);
    if (CONFIG.ACTIVE_STORAGE_MODE === "local") url.searchParams.set("storage", "local");
    return url.href;
  },
  noticeUrl(caseRecord) {
    if (!this.isValidPublicValue(caseRecord.caseId) || !this.isValidPublicValue(caseRecord.noticeAccessToken)) {
      throw new Error("通知查看連結資料不完整，缺少有效案件編號或通知 token。");
    }
    const url = new URL(`${this.publicBaseUrl()}/notice.html`);
    url.searchParams.set("caseId", caseRecord.caseId);
    url.searchParams.set("token", caseRecord.noticeAccessToken || "");
    if (CONFIG.ACTIVE_STORAGE_MODE === "local") url.searchParams.set("storage", "local");
    return url.href;
  },
  statusLabel(status) {
    if (status === CASE_STATUS.submitted) return "公司已回覆，待整理";
    if (status === CASE_STATUS.preparing_notice) return "求才通知製作中";
    if (status === CASE_STATUS.notice_ready) return "求才通知已完成";
    if (status === CASE_STATUS.revision_open) return "已重新開放修改";
    if (status === CASE_STATUS.deleted) return "已刪除";
    return "待公司填寫";
  },
  modeMessage() {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return "目前為線上模式，資料將儲存至 Google 試算表。";
    return "目前為本機測試模式，資料僅儲存在此瀏覽器。";
  },
  latestSubmission(caseRecord = {}) {
    const submissions = Array.isArray(caseRecord.submissions) ? caseRecord.submissions : [];
    const latest = submissions.find((item) => item.submissionId === caseRecord.latestSubmissionId) || submissions[submissions.length - 1];
    if (latest) return latest;
    if (caseRecord.response) {
      return {
        caseId: caseRecord.caseId,
        submissionId: caseRecord.latestSubmissionId || "",
        submittedAt: caseRecord.submittedAt,
        response: caseRecord.response,
        responseJson: caseRecord.response,
        isLatest: true
      };
    }
    return null;
  },
  noticeStatusLabel(caseRecord = {}) {
    if (!caseRecord.response && !this.latestSubmission(caseRecord)) return "尚未回覆";
    if (caseRecord.noticeViewed) return "公司已查看通知";
    if (caseRecord.noticeFileUrl) return "通知已上傳";
    return "已回覆，待上傳通知";
  },
  responseBadge(caseRecord = {}) {
    if (!this.latestSubmission(caseRecord)) return "尚未回覆";
    return caseRecord.hasUnreadResponse ? "新回覆" : "已查看";
  },
  fileSizeText(bytes) {
    const size = Number(bytes || 0);
    if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
    if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${size} B`;
  },
  displayDateSlash(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).replace(/-/g, "/");
    return `${date.getFullYear()}/${this.pad(date.getMonth() + 1)}/${this.pad(date.getDate())}`;
  },
  contactPhoneText(data = {}) {
    const phone = String(data.contactPhone || "").trim();
    const extension = String(data.extension || "").trim();
    if (!phone) return "＿＿＿＿＿＿";
    return extension ? `${phone} 分機 ${extension}` : phone;
  }
};

const deleteCaseDialog = {
  confirm(caseRecord = {}) {
    return new Promise((resolve) => {
      const companyName = String(caseRecord.companyName || "").trim();
      const caseId = String(caseRecord.caseId || "").trim();
      const overlay = document.createElement("div");
      overlay.className = "delete-dialog-backdrop";
      overlay.innerHTML = `
        <section class="delete-dialog" role="dialog" aria-modal="true" aria-labelledby="deleteCaseTitle">
          <h2 id="deleteCaseTitle">刪除案件</h2>
          <div class="delete-dialog-summary">
            <p><strong>公司名稱：</strong><span>${companyName}</span></p>
            <p><strong>案件編號：</strong><span class="breakable">${caseId}</span></p>
          </div>
          <p class="delete-warning">刪除後將同步移除公司回覆、上傳檔案、填寫連結及通知連結，且無法復原。</p>
          <label class="delete-confirm-label">請輸入公司名稱「${companyName}」確認。
            <input id="deleteCaseConfirmInput" type="text" autocomplete="off">
          </label>
          <div class="delete-dialog-actions">
            <button type="button" class="secondary" data-cancel>取消</button>
            <button type="button" class="danger" data-confirm disabled>確認刪除</button>
          </div>
        </section>
      `;
      const input = overlay.querySelector("#deleteCaseConfirmInput");
      const confirmBtn = overlay.querySelector("[data-confirm]");
      const cleanup = (value) => {
        overlay.remove();
        resolve(value);
      };
      input.addEventListener("input", () => {
        confirmBtn.disabled = input.value.trim() !== companyName;
      });
      overlay.querySelector("[data-cancel]").addEventListener("click", () => cleanup(false));
      confirmBtn.addEventListener("click", () => cleanup(true));
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) cleanup(false);
      });
      document.body.appendChild(overlay);
      input.focus();
    });
  }
};

const remoteClient = {
  adminSessionKey: "jobRegistrationAdminSession",
  requestTimeoutMs: 60000,
  adminAuthPromise: null,
  loginModalOpen: false,
  lastAuthFailureAt: 0,
  getAdminSession() {
    try {
      const raw = localStorage.getItem(this.adminSessionKey) || sessionStorage.getItem(this.adminSessionKey);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (session?.adminSessionToken && !session.token) {
        return {
          token: session.adminSessionToken,
          email: session.adminEmail || session.email || "",
          expiresAt: session.expiresAt || ""
        };
      }
      return session;
    } catch (error) {
      return null;
    }
  },
  setAdminSession(session) {
    const expiresAt = session.expiresAt || (session.expiresIn ? new Date(Date.now() + Number(session.expiresIn) * 1000).toISOString() : "");
    const stored = {
      token: session.token || session.adminSessionToken || "",
      email: session.email || session.adminEmail || "",
      expiresAt
    };
    localStorage.setItem(this.adminSessionKey, JSON.stringify(stored));
    sessionStorage.removeItem(this.adminSessionKey);
  },
  clearAdminSession() {
    sessionStorage.removeItem(this.adminSessionKey);
    localStorage.removeItem(this.adminSessionKey);
  },
  isSessionUsable(session) {
    if (!session?.token) return false;
    if (!session.expiresAt) return true;
    return new Date(session.expiresAt).getTime() > Date.now() + 60000;
  },
  showAdminLoginDialog() {
    return new Promise((resolve, reject) => {
      if (this.loginModalOpen) {
        reject(new Error("管理員登入視窗已開啟。"));
        return;
      }
      this.loginModalOpen = true;
      const existing = document.querySelector("#adminLoginDialog");
      if (existing) existing.remove();
      const overlay = document.createElement("div");
      overlay.id = "adminLoginDialog";
      overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:20px;";
      overlay.innerHTML = `
        <form style="width:min(420px,100%);background:#fff;border-radius:8px;padding:20px;box-shadow:0 20px 60px rgba(15,23,42,.25);display:grid;gap:12px;">
          <h2 style="margin:0;font-size:20px;">管理員登入</h2>
          <p style="margin:0;color:#475569;font-size:14px;">請輸入已授權的管理員 Email 與驗證碼。</p>
          <label style="display:grid;gap:6px;font-size:14px;">Email<input name="email" type="email" autocomplete="username" required style="font:inherit;padding:10px;border:1px solid #cbd5e1;border-radius:6px;"></label>
          <label style="display:grid;gap:6px;font-size:14px;">驗證碼<input name="adminCode" type="password" autocomplete="current-password" required style="font:inherit;padding:10px;border:1px solid #cbd5e1;border-radius:6px;"></label>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button type="button" data-cancel style="padding:10px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;">取消</button>
            <button type="submit" style="padding:10px 14px;border:0;background:#2563eb;color:#fff;border-radius:6px;">登入</button>
          </div>
        </form>
      `;
      const form = overlay.querySelector("form");
      const cleanup = () => {
        this.loginModalOpen = false;
        overlay.remove();
      };
      overlay.querySelector("[data-cancel]").addEventListener("click", () => {
        cleanup();
        reject(new Error("尚未登入管理後台。"));
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        cleanup();
        resolve({
          email: String(data.get("email") || "").trim(),
          adminCode: String(data.get("adminCode") || "").trim()
        });
      });
      document.body.appendChild(overlay);
      form.email.focus();
    });
  },
  needsAdmin(action) {
    return [
      "createCase",
      "listCases",
      "getCase",
      "updateCase",
      "updateCaseDetails",
      "deleteCase",
      "reopenRevision",
      "reopenForRevision",
      "markResponseViewed",
      "savePdfInfo",
      "uploadNoticeFile",
      "deleteNoticeFile",
      "getNoticeFileAdmin",
      "driveHealthCheck"
    ].includes(action);
  },
  async ensureAdminSession() {
    const existing = this.getAdminSession();
    if (this.isSessionUsable(existing)) return existing.token;
    if (Date.now() - this.lastAuthFailureAt < 8000) {
      throw new Error("管理員登入尚未完成，請稍後再試。");
    }
    if (this.adminAuthPromise) return this.adminAuthPromise;
    this.adminAuthPromise = this.loginAndStoreSession()
      .finally(() => {
        this.adminAuthPromise = null;
      });
    return this.adminAuthPromise;
  },
  async loginAndStoreSession() {
    try {
      const credentials = await this.showAdminLoginDialog();
      if (!credentials.email || !credentials.adminCode) throw new Error("尚未登入管理後台。");
      const result = await this.request("adminLogin", { email: credentials.email, adminCode: credentials.adminCode, skipAdminSession: true }, { skipAuthRetry: true });
      const normalized = this.normalizeAdminLogin(result);
      if (!normalized.token) throw new Error("管理員登入失敗。");
      this.setAdminSession(normalized);
      this.lastAuthFailureAt = 0;
      return normalized.token;
    } catch (error) {
      this.lastAuthFailureAt = Date.now();
      throw error;
    }
  },
  normalizeAdminLogin(result = {}) {
    return {
      token: result.token || result.sessionToken || result.adminSessionToken || "",
      email: result.email || result.adminEmail || result.admin?.email || "",
      expiresAt: result.expiresAt || result.admin?.expiresAt || "",
      expiresIn: result.expiresIn || ""
    };
  },
  normalizeSessionCheck(result = {}) {
    return {
      authenticated: result.authenticated !== false,
      email: result.email || result.adminEmail || result.admin?.email || "",
      expiresAt: result.expiresAt || result.admin?.expiresAt || "",
      raw: result
    };
  },
  async request(action, payload = {}, options = {}) {
    if (!CONFIG.GOOGLE_APPS_SCRIPT_URL) throw new Error("尚未設定 Google Apps Script URL。");
    const requestPayload = { ...payload };
    const envelope = { action, payload: requestPayload };
    if (this.needsAdmin(action) && !payload.skipAdminSession) {
      envelope.adminSessionToken = await this.ensureAdminSession();
    }
    if (options.adminSessionToken) envelope.adminSessionToken = options.adminSessionToken;
    delete requestPayload.skipAdminSession;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), options.timeoutMs || this.requestTimeoutMs);
    let response;
    try {
      response = await fetch(CONFIG.GOOGLE_APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(envelope),
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === "AbortError") throw new Error("線上服務回應逾時，請稍後重試。");
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
    const text = await response.text();
    let result = null;
    try {
      result = JSON.parse(text);
    } catch (error) {
      console.error("Remote API returned non-JSON", {
        action,
        httpStatus: response.status,
        contentType: response.headers.get("content-type") || "",
        preview: text.slice(0, 200)
      });
      throw new Error("線上服務暫時無法回應，請稍後再試。");
    }
    const authCode = result?.code || result?.error?.code || "";
    const isExplicitAuthFailure = ["UNAUTHORIZED", "SESSION_EXPIRED"].includes(authCode);
    if ((!response.ok || result?.ok === false) && result.status === 401 && isExplicitAuthFailure && this.needsAdmin(action) && !options.skipAuthRetry) {
      this.clearAdminSession();
      if (!options.retried) return this.request(action, payload, { retried: true });
    }
    if (!result?.ok) throw new Error(result?.error?.message || result?.error || "線上服務暫時無法使用。");
    return result.result ?? result.data ?? result;
  },
  async testConnection() {
    if (!CONFIG.GOOGLE_APPS_SCRIPT_URL || !String(CONFIG.GOOGLE_APPS_SCRIPT_URL).trim()) {
      return { ok: false, status: "URL 尚未設定" };
    }
    if (!isValidAppsScriptUrl(CONFIG.GOOGLE_APPS_SCRIPT_URL)) {
      return { ok: false, status: "URL 格式無效" };
    }
    try {
      const result = await this.request("ping");
      if (!result || typeof result !== "object") return { ok: false, status: "Apps Script 回傳格式錯誤" };
      if (result.service) return { ok: true, status: "連線成功" };
      return { ok: false, status: "Apps Script 回傳格式錯誤" };
    } catch (error) {
      const message = String(error.message || error);
      if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(message)) return { ok: false, status: "無法連線或權限未開放" };
      return { ok: false, status: `無法連線：${message}` };
    }
  }
};

const localStore = {
  readCases() {
    return JSON.parse(localStorage.getItem(STORE_KEYS.cases) || "[]");
  },
  writeCases(cases) {
    localStorage.setItem(STORE_KEYS.cases, JSON.stringify(cases));
  }
};

const noticeFileStore = {
  open() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("此瀏覽器不支援 IndexedDB，無法在本機模式儲存檔案。"));
        return;
      }
      const request = indexedDB.open(NOTICE_FILE_DB.name, NOTICE_FILE_DB.version);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(NOTICE_FILE_DB.storeName)) {
          db.createObjectStore(NOTICE_FILE_DB.storeName, { keyPath: "fileKey" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB 開啟失敗。"));
    });
  },
  async put(fileRecord) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(NOTICE_FILE_DB.storeName, "readwrite");
      tx.objectStore(NOTICE_FILE_DB.storeName).put(fileRecord);
      tx.oncomplete = () => {
        db.close();
        resolve(fileRecord);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("IndexedDB 檔案儲存失敗。"));
      };
    });
  },
  async get(fileKey) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(NOTICE_FILE_DB.storeName, "readonly");
      const request = tx.objectStore(NOTICE_FILE_DB.storeName).get(fileKey);
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error || new Error("IndexedDB 檔案讀取失敗。"));
      };
    });
  },
  async delete(fileKey) {
    if (!fileKey) return;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(NOTICE_FILE_DB.storeName, "readwrite");
      tx.objectStore(NOTICE_FILE_DB.storeName).delete(fileKey);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("IndexedDB 檔案刪除失敗。"));
      };
    });
  },
  async attachObjectUrl(caseRecord) {
    if (CONFIG.ACTIVE_STORAGE_MODE !== "local" || !caseRecord?.noticeFileKey) return caseRecord;
    const stored = await this.get(caseRecord.noticeFileKey);
    if (!stored?.blob) return caseRecord;
    return {
      ...caseRecord,
      noticeFileUrl: URL.createObjectURL(stored.blob),
      noticeBlobUrl: true
    };
  }
};

const caseService = {
  async createCase(input) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") {
      const record = this.normalizeCaseRecord(await remoteClient.request("createCase", input));
      if (!record.caseId || !record.formAccessToken) throw new Error("建立案件回傳資料不完整，缺少案件編號或填寫 token。");
      return {
        ...input,
        ...record,
        status: record.status || CASE_STATUS.pending
      };
    }
    const now = new Date().toISOString();
    const cases = localStore.readCases();
    const caseRecord = {
      caseId: this.generateCaseId(input.companyName, cases),
      status: CASE_STATUS.pending,
      createdAt: now,
      updatedAt: now,
      companyName: input.companyName.trim(),
      workAddress: input.workAddress.trim(),
      recruitmentCount: input.recruitmentCount ? Number(input.recruitmentCount) : null,
      contactName: (input.contactName || "").trim(),
      contactPhone: (input.contactPhone || "").trim(),
      extension: (input.extension || "").trim(),
      recruitmentDate: input.recruitmentDate,
      industry: input.industry.trim(),
      salaryMin: Number(input.salaryMin || 0),
      salaryMax: Number(input.salaryMax || 0),
      publicPhone: input.publicPhone.trim(),
      agencyCompany: input.agencyCompany,
      response: null,
      submissions: [],
      latestSubmissionId: "",
      submittedAt: null,
      revisionOpenedAt: null,
      hasUnreadResponse: false,
      responseViewedAt: null,
      pdfFileName: "",
      pdfUrl: "",
      noticeAccessToken: this.generateAccessToken(),
      noticeFileId: "",
      noticeFileName: "",
      noticeFileType: "",
      noticeFileUrl: "",
      noticeFileKey: "",
      noticeFileSize: 0,
      noticeUploadedAt: null,
      noticeSubmissionId: "",
      noticeUploadedBy: "",
      noticeUpload: null,
      noticeHistory: [],
      noticeViewed: false,
      firstViewedAt: null,
      lastViewedAt: null,
      viewCount: 0
    };
    cases.push(caseRecord);
    localStore.writeCases(cases);
    return caseRecord;
  },
  normalizeCaseRecord(record = {}) {
    let data = record;
    for (let i = 0; i < 4; i += 1) {
      const next = data?.data || data?.result || data?.case || data?.record || data?.item;
      if (!next || next === data) break;
      data = next;
    }
    return {
      ...data,
      caseId: data.caseId || data.id || "",
      formAccessToken: data.formAccessToken || data.token || data.formToken || "",
      noticeAccessToken: data.noticeAccessToken || data.noticeToken || ""
    };
  },
  normalizeCaseList(result) {
    const data = result?.cases || result?.records || result?.items || result?.list || result?.data || result?.result || result;
    if (!Array.isArray(data)) {
      console.error("listCases 回傳格式不是陣列", { keys: data && typeof data === "object" ? Object.keys(data) : [], valueType: typeof data });
      throw new Error("案件列表回傳格式錯誤。");
    }
    return data.map((item) => this.normalizeCaseRecord(item));
  },
  generateCaseId(companyName, cases) {
    const prefix = String(companyName || "CASE").replace(/[^\w\u4e00-\u9fff]/g, "").slice(0, 4).toUpperCase() || "CASE";
    const date = helpers.todayStamp();
    const count = cases.filter((item) => item.caseId.includes(`-${date}-`)).length + 1;
    return `${prefix}-${date}-${helpers.pad(count).padStart(3, "0")}`;
  },
  generateAccessToken() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  },
  async getCase(caseId) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return this.normalizeCaseRecord(await remoteClient.request("getCase", { caseId }));
    return localStore.readCases().find((item) => item.caseId === caseId) || null;
  },
  async getPublicFormCase(caseId, token) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") {
      const record = this.normalizeCaseRecord(await remoteClient.request("getPublicFormCase", { caseId, token }));
      if (!record.companyName && !record.workAddress) throw new Error("案件資料回傳格式錯誤。");
      return record;
    }
    return this.getCase(caseId);
  },
  async listCases() {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return this.normalizeCaseList(await remoteClient.request("listCases"));
    return localStore.readCases().filter((item) => item.status !== CASE_STATUS.deleted && !item.deletedAt).sort((a, b) => {
      const rank = (item) => {
        if (item.hasUnreadResponse) return 0;
        if (helpers.latestSubmission(item) && !item.noticeFileUrl) return 1;
        if (item.noticeFileUrl) return 2;
        return 3;
      };
      const rankDiff = rank(a) - rank(b);
      if (rankDiff) return rankDiff;
      return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
    });
  },
  async deleteCase(caseId) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") {
      const runDelete = () => remoteClient.request("deleteCase", { caseId });
      const verifyDeleted = async () => {
        const cases = await this.listCases();
        return !cases.some((item) => item.caseId === caseId);
      };
      try {
        return this.normalizeCaseRecord(await runDelete());
      } catch (error) {
        if (String(error.message || "").includes("Failed to fetch")) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          try {
            return this.normalizeCaseRecord(await runDelete());
          } catch (retryError) {
            if (String(retryError.message || "").includes("回傳格式錯誤") && await verifyDeleted()) {
              return { caseId, status: CASE_STATUS.deleted };
            }
            throw retryError;
          }
        }
        if (String(error.message || "").includes("回傳格式錯誤")) {
          if (await verifyDeleted()) {
            return { caseId, status: CASE_STATUS.deleted };
          }
        }
        throw error;
      }
    }
    const cases = localStore.readCases();
    const index = cases.findIndex((item) => item.caseId === caseId);
    if (index === -1) throw new Error("案件不存在。");
    const record = cases[index];
    if (record.noticeFileKey) {
      try {
        await noticeFileStore.delete(record.noticeFileKey);
      } catch (error) {
        console.error("IndexedDB 刪除求才內容檔案失敗", { caseId, fileKey: record.noticeFileKey, error });
      }
    }
    const now = new Date().toISOString();
    cases[index] = {
      ...record,
      status: CASE_STATUS.deleted,
      deletedAt: now,
      deletedBy: "local",
      updatedAt: now,
      formAccessToken: "",
      noticeAccessToken: "",
      latestSubmissionId: "",
      submissions: [],
      response: null,
      submittedAt: null,
      hasUnreadResponse: false,
      responseViewedAt: "",
      noticeFileId: "",
      noticeFileName: "",
      noticeFileType: "",
      noticeFileUrl: "",
      noticeFileKey: "",
      noticeFileSize: 0,
      noticeUploadedAt: null,
      noticeSubmissionId: "",
      noticeUploadedBy: "",
      noticeUpload: null,
      noticeHistory: [],
      noticeViewed: false,
      firstViewedAt: "",
      lastViewedAt: "",
      viewCount: 0
    };
    localStore.writeCases(cases);
    return cases[index];
  },
  async updateCase(updatedCase) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return this.normalizeCaseRecord(await remoteClient.request("updateCase", updatedCase));
    const cases = localStore.readCases();
    const index = cases.findIndex((item) => item.caseId === updatedCase.caseId);
    if (index === -1) throw new Error("案件不存在。");
    cases[index] = updatedCase;
    localStore.writeCases(cases);
    return updatedCase;
  },
  async updateCaseDetails(caseId, input) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return this.normalizeCaseRecord(await remoteClient.request("updateCaseDetails", { caseId, input }));
    const record = await this.getCase(caseId);
    if (!record) throw new Error("案件不存在。");
    return this.updateCase({
      ...record,
      updatedAt: new Date().toISOString(),
      companyName: input.companyName.trim(),
      workAddress: input.workAddress.trim(),
      recruitmentCount: input.recruitmentCount ? Number(input.recruitmentCount) : null,
      contactName: (input.contactName || "").trim(),
      contactPhone: (input.contactPhone || "").trim(),
      extension: (input.extension || "").trim(),
      recruitmentDate: input.recruitmentDate,
      industry: input.industry.trim(),
      salaryMin: Number(input.salaryMin || 0),
      salaryMax: Number(input.salaryMax || 0),
      publicPhone: input.publicPhone.trim(),
      agencyCompany: input.agencyCompany
    });
  },
  async reopenForRevision(caseId) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return this.normalizeCaseRecord(await remoteClient.request("reopenForRevision", { caseId }));
    const record = await this.getCase(caseId);
    if (!record) throw new Error("案件不存在。");
    const now = new Date().toISOString();
    return this.updateCase({
      ...record,
      status: CASE_STATUS.revision_open,
      updatedAt: now,
      revisionOpenedAt: now
    });
  },
  async markResponseViewed(caseId) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return this.normalizeCaseRecord(await remoteClient.request("markResponseViewed", { caseId }));
    const record = await this.getCase(caseId);
    if (!record) throw new Error("案件不存在。");
    if (!record.hasUnreadResponse) return record;
    return this.updateCase({
      ...record,
      hasUnreadResponse: false,
      responseViewedAt: new Date().toISOString(),
      updatedAt: record.updatedAt || new Date().toISOString()
    });
  },
  async savePdfInfo(caseId, pdfInfo) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return remoteClient.request("savePdfInfo", { caseId, pdfInfo });
    const record = await this.getCase(caseId);
    if (!record) return null;
    return this.updateCase({
      ...record,
      ...pdfInfo,
      updatedAt: new Date().toISOString()
    });
  },
  async uploadNoticeFile(caseId, fileData, options = {}) {
    if (options.expectedCaseId && options.expectedCaseId !== caseId) throw new Error("目前案件已切換，請重新選擇檔案");
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return this.normalizeCaseRecord(await remoteClient.request("uploadNoticeFile", { caseId, fileData, options }));
    const record = await this.getCase(caseId);
    if (!record) throw new Error("案件不存在。");
    if (options.expectedCaseId && record.caseId !== options.expectedCaseId) throw new Error("目前案件已切換，請重新選擇檔案");
    const latestSubmission = helpers.latestSubmission(record);
    const submissionId = options.submissionId || latestSubmission?.submissionId || "";
    if (options.submissionId && latestSubmission?.submissionId && options.submissionId !== latestSubmission.submissionId) throw new Error("回覆版本已變更，請重新選擇檔案。");
    if (!fileData.blob && !fileData.file) throw new Error("找不到準備上傳的檔案 Blob，請重新選擇檔案。");
    const now = new Date().toISOString();
    const fileKey = `notice-${record.caseId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const noticeUpload = {
      caseId: record.caseId,
      submissionId,
      fileKey,
      fileName: fileData.name,
      fileType: fileData.type,
      fileSize: Number(fileData.size || 0),
      uploadedAt: now
    };
    try {
      await noticeFileStore.put({
        ...noticeUpload,
        blob: fileData.blob || fileData.file
      });
    } catch (error) {
      console.error("IndexedDB 儲存求才內容檔案失敗", {
        caseId: record.caseId,
        submissionId,
        fileName: fileData.name,
        fileSize: fileData.size,
        error
      });
      throw error;
    }
    const oldNotice = (record.noticeFileKey || record.noticeFileUrl) ? {
      caseId: record.caseId,
      submissionId: record.noticeSubmissionId || record.latestSubmissionId || "",
      noticeFileId: record.noticeFileId,
      noticeFileName: record.noticeFileName,
      noticeFileType: record.noticeFileType,
      noticeFileUrl: record.noticeFileUrl,
      noticeFileKey: record.noticeFileKey || "",
      noticeFileSize: record.noticeFileSize || 0,
      noticeUploadedAt: record.noticeUploadedAt,
      noticeUploadedBy: record.noticeUploadedBy || "",
      versionStatus: "舊版"
    } : null;
    const saved = await this.updateCase({
      ...record,
      status: latestSubmission?.submissionId ? CASE_STATUS.notice_ready : record.status,
      updatedAt: now,
      noticeFileId: fileKey,
      noticeFileName: fileData.name,
      noticeFileType: fileData.type,
      noticeFileUrl: "",
      noticeFileKey: fileKey,
      noticeFileSize: Number(fileData.size || 0),
      noticeUploadedAt: now,
      noticeSubmissionId: submissionId,
      noticeUploadedBy: options.uploadedBy || "仲介端",
      noticeUpload,
      noticeHistory: oldNotice ? [...(record.noticeHistory || []), oldNotice] : (record.noticeHistory || []),
      noticeAccessToken: record.noticeAccessToken || this.generateAccessToken()
    });
    return noticeFileStore.attachObjectUrl(saved);
  },
  async deleteNoticeFile(caseId) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return remoteClient.request("deleteNoticeFile", { caseId });
    const record = await this.getCase(caseId);
    if (!record) throw new Error("案件不存在。");
    if (record.noticeFileKey) {
      try {
        await noticeFileStore.delete(record.noticeFileKey);
      } catch (error) {
        console.error("IndexedDB 刪除求才內容檔案失敗", { caseId, fileKey: record.noticeFileKey, error });
      }
    }
    return this.updateCase({
      ...record,
      status: record.response ? CASE_STATUS.submitted : CASE_STATUS.pending,
      updatedAt: new Date().toISOString(),
      noticeFileId: "",
      noticeFileName: "",
      noticeFileType: "",
      noticeFileUrl: "",
      noticeFileKey: "",
      noticeFileSize: 0,
      noticeUploadedAt: null,
      noticeSubmissionId: "",
      noticeUploadedBy: "",
      noticeUpload: null
    });
  },
  async validateNoticeAccess(caseId, token) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return this.normalizeCaseRecord(await remoteClient.request("getPublicNotice", { caseId, token }));
    const record = await this.getCase(caseId);
    if (!record || record.noticeAccessToken !== token || record.status !== CASE_STATUS.notice_ready || (!record.noticeFileUrl && !record.noticeFileKey)) return null;
    return noticeFileStore.attachObjectUrl(record);
  },
  async recordNoticeView(caseId, token) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return this.normalizeCaseRecord(await remoteClient.request("recordNoticeView", { caseId, token }));
    const record = await this.getCase(caseId);
    if (!record || record.noticeAccessToken !== token || record.status !== CASE_STATUS.notice_ready || (!record.noticeFileUrl && !record.noticeFileKey)) return null;
    const now = new Date().toISOString();
    const updated = await this.updateCase({
      ...record,
      noticeViewed: true,
      firstViewedAt: record.firstViewedAt || now,
      lastViewedAt: now,
      viewCount: Number(record.viewCount || 0) + 1,
      updatedAt: now
    });
    return noticeFileStore.attachObjectUrl(updated);
  }
};

const noticeService = {
  normalize(raw = {}) {
    let data = raw;
    for (let i = 0; i < 3; i += 1) {
      const next = data?.data || data?.result;
      if (!next || next === data) break;
      data = next;
    }
    if (data.caseData && data.noticeFile) {
      return {
        ok: true,
        caseData: data.caseData,
        noticeFile: data.noticeFile,
        latestSubmission: data.latestSubmission || null
      };
    }
    const caseSource = data.case || data.record || data;
    const fileSource = data.noticeFile || {};
    const latestSubmission = data.latestSubmission || helpers.latestSubmission(caseSource) || null;
    return {
      ok: true,
      caseData: {
        caseId: caseSource.caseId || "",
        status: caseSource.status || "",
        companyName: caseSource.companyName || "",
        workAddress: caseSource.workAddress || "",
        contactName: caseSource.contactName || "",
        contactPhone: caseSource.contactPhone || "",
        extension: caseSource.extension || "",
        recruitmentDate: caseSource.recruitmentDate || "",
        industry: caseSource.industry || "",
        recruitmentCount: helpers.hasRecruitmentCount(caseSource) ? Number(caseSource.recruitmentCount) : null,
        publicPhone: caseSource.publicPhone || "",
        agencyCompany: caseSource.agencyCompany || "",
        latestSubmissionId: latestSubmission?.submissionId || caseSource.latestSubmissionId || ""
      },
      noticeFile: {
        fileName: fileSource.fileName || caseSource.noticeFileName || "",
        fileType: fileSource.fileType || caseSource.noticeFileType || "",
        fileSize: Number(fileSource.fileSize || caseSource.noticeFileSize || 0),
        previewUrl: fileSource.previewUrl || fileSource.fileUrl || caseSource.noticeFileUrl || "",
        downloadUrl: fileSource.downloadUrl || fileSource.fileUrl || caseSource.noticeFileUrl || ""
      },
      latestSubmission
    };
  },
  async getPublicNotice(caseId, token) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") {
      return this.normalize(await remoteClient.request("getPublicNotice", { caseId, token }));
    }
    return this.normalize(await caseService.validateNoticeAccess(caseId, token));
  },
  async recordNoticeView(caseId, token) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") {
      return this.normalize(await remoteClient.request("recordNoticeView", { caseId, token }));
    }
    return this.normalize(await caseService.recordNoticeView(caseId, token));
  },
  pdfData(result) {
    const latest = result.latestSubmission || {};
    const response = latest.response || latest.responseJson || {};
    return {
      ...result.caseData,
      ...response,
      response,
      submissions: latest.submissionId ? [latest] : [],
      latestSubmissionId: latest.submissionId || result.caseData.latestSubmissionId || "",
      submissionId: latest.submissionId || "",
      submittedAt: latest.submittedAt || "",
      skipPdfInfoSave: true
    };
  }
};

const submissionService = {
  async submitResponse(caseRecord, response) {
    const submittedAt = new Date().toISOString();
    const wasRevision = caseRecord.status === CASE_STATUS.revision_open;
    const submissionId = helpers.generateSubmissionId(new Date(submittedAt));
    const submissions = (caseRecord.submissions || []).map((item) => ({ ...item, isLatest: false }));
    const submission = {
      caseId: caseRecord.caseId,
      submissionId,
      submittedAt,
      response,
      responseJson: response,
      isLatest: true
    };
    const hasExistingNotice = Boolean(caseRecord.noticeFileUrl || caseRecord.noticeFileKey);
    const oldNotice = hasExistingNotice && wasRevision && caseRecord.noticeSubmissionId ? {
      caseId: caseRecord.caseId,
      submissionId: caseRecord.noticeSubmissionId || caseRecord.latestSubmissionId || "",
      noticeFileId: caseRecord.noticeFileId,
      noticeFileName: caseRecord.noticeFileName,
      noticeFileType: caseRecord.noticeFileType,
      noticeFileUrl: caseRecord.noticeFileUrl,
      noticeFileKey: caseRecord.noticeFileKey || "",
      noticeFileSize: caseRecord.noticeFileSize || 0,
      noticeUploadedAt: caseRecord.noticeUploadedAt,
      noticeUploadedBy: caseRecord.noticeUploadedBy || "",
      versionStatus: "舊版"
    } : null;
    const shouldBindUnboundNotice = hasExistingNotice && !caseRecord.noticeSubmissionId && !oldNotice;
    const boundNoticeUpload = shouldBindUnboundNotice && caseRecord.noticeUpload
      ? { ...caseRecord.noticeUpload, submissionId }
      : caseRecord.noticeUpload;
    const updatedCase = {
      ...caseRecord,
      status: shouldBindUnboundNotice ? CASE_STATUS.notice_ready : CASE_STATUS.submitted,
      response,
      submissions: [...submissions, submission],
      latestSubmissionId: submissionId,
      submittedAt,
      updatedAt: submittedAt,
      hasUnreadResponse: true,
      responseViewedAt: null,
      lastSubmissionType: wasRevision ? "revision" : "first",
      noticeHistory: oldNotice ? [...(caseRecord.noticeHistory || []), oldNotice] : (caseRecord.noticeHistory || []),
      noticeFileId: oldNotice ? "" : caseRecord.noticeFileId,
      noticeFileName: oldNotice ? "" : caseRecord.noticeFileName,
      noticeFileType: oldNotice ? "" : caseRecord.noticeFileType,
      noticeFileUrl: oldNotice ? "" : caseRecord.noticeFileUrl,
      noticeFileKey: oldNotice ? "" : caseRecord.noticeFileKey,
      noticeFileSize: oldNotice ? 0 : caseRecord.noticeFileSize,
      noticeUploadedAt: oldNotice ? null : caseRecord.noticeUploadedAt,
      noticeSubmissionId: oldNotice ? "" : (shouldBindUnboundNotice ? submissionId : caseRecord.noticeSubmissionId),
      noticeUploadedBy: oldNotice ? "" : caseRecord.noticeUploadedBy,
      noticeUpload: oldNotice ? null : boundNoticeUpload,
      noticeViewed: oldNotice ? false : caseRecord.noticeViewed,
      firstViewedAt: oldNotice ? null : caseRecord.firstViewedAt,
      lastViewedAt: oldNotice ? null : caseRecord.lastViewedAt,
      viewCount: oldNotice ? 0 : caseRecord.viewCount
    };
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") {
      const saved = caseService.normalizeCaseRecord(await remoteClient.request("submitResponse", { caseId: caseRecord.caseId, formAccessToken: caseRecord.formAccessToken, response, wasRevision, submissionId }));
      return this.mergeCaseAndResponse(saved);
    }
    if (shouldBindUnboundNotice && caseRecord.noticeFileKey) {
      try {
        const storedFile = await noticeFileStore.get(caseRecord.noticeFileKey);
        if (storedFile) await noticeFileStore.put({ ...storedFile, submissionId });
      } catch (error) {
        console.error("IndexedDB 求才內容檔案綁定最新回覆失敗", {
          caseId: caseRecord.caseId,
          submissionId,
          fileKey: caseRecord.noticeFileKey,
          error
        });
      }
    }
    const saved = await caseService.updateCase(updatedCase);
    return this.mergeCaseAndResponse(saved);
  },
  mergeCaseAndResponse(caseRecord) {
    const latest = helpers.latestSubmission(caseRecord);
    const response = latest?.response || caseRecord.response || {};
    return {
      ...caseRecord,
      ...response,
      response,
      submissionId: latest?.submissionId || caseRecord.latestSubmissionId || "",
      submittedAt: latest?.submittedAt || caseRecord.submittedAt
    };
  }
};

const pdfService = {
  workTimeText(data) {
    const lines = [];
    const hasShift = ["有輪班制度", "同時有輪班及部分工時"].includes(data.shiftType);
    const standardTime = data.standardTime || { start: "08:00", end: "17:00", label: "08：00～17：00" };
    if (!hasShift || !data.shifts?.length) lines.push(`固定日班 ${standardTime.label}`);
    (data.shifts || []).filter((shift) => shift.start && shift.end).forEach((shift) => lines.push(`${shift.name} ${helpers.displayTime(shift.start)}～${helpers.displayTime(shift.end)}`));
    (data.partTimes || []).filter((time) => time.start && time.end).forEach((time, index) => lines.push(`部分工時${index + 1} ${helpers.displayTime(time.start)}～${helpers.displayTime(time.end)}`));
    return lines.join("；");
  },
  leaveText(data) {
    if (data.leaveType === "週休二日") return data.weekendFixed === "是" ? "週休二日，固定休星期六、星期日" : `週休二日，${data.weekendNote || "非固定休六日"}`;
    if (data.leaveType === "輪休") return `做${data.workDays}日休${data.restDays}日`;
    if (data.leaveType === "排休") return `排休，每月休假${data.monthlyLeaveDays}日`;
    return data.leaveOther || "";
  },
  leaveQuestion(data) {
    if (data.leaveType === "週休二日") return data.weekendFixed === "是" ? "周休二日是休星期六、星期日嗎：是。" : `休假方式是週休二日，${data.weekendNote || "非固定休六日"}嗎：是。`;
    if (data.leaveType === "輪休" && data.workDays && data.restDays) return `休假方式是做${data.workDays}日休${data.restDays}日嗎：是。`;
    if (data.leaveType === "排休" && data.monthlyLeaveDays) return `休假方式是排休，每月休假${data.monthlyLeaveDays}日嗎：是。`;
    if (data.leaveOther) return `休假方式是${data.leaveOther}嗎：是。`;
    return "";
  },
  workTimeQuestions(data) {
    const rows = [];
    const completeShifts = (data.shifts || []).filter((shift) => shift.start && shift.end);
    if (completeShifts.length) {
      completeShifts.slice(0, 3).forEach((shift) => rows.push(`${shift.name}工作時間：${helpers.displayTime(shift.start)}～${helpers.displayTime(shift.end)}嗎：是。`));
      if (data.rotationMethod) rows.push(`輪班方式是${data.rotationMethod}嗎：是。`);
    } else if (data.standardTime?.label || (data.standardTime?.start && data.standardTime?.end)) {
      rows.push(`工作時間：${data.standardTime?.label || `${helpers.displayTime(data.standardTime.start)}～${helpers.displayTime(data.standardTime.end)}`}嗎：是。`);
    }
    (data.partTimes || []).filter((time) => time.start && time.end).forEach((time, index) => {
      rows.push(`部分工時第${index + 1}時段：${helpers.displayTime(time.start)}～${helpers.displayTime(time.end)}嗎：是。`);
    });
    return rows;
  },
  childcareText(data) {
    if (data.childcare === "無") return "無";
    const items = (data.childcareItems || []).map((item) => item === "其他" ? `其他：${data.childcareOther}` : item);
    return items.length ? items.join("、") : "有";
  },
  qAndA(data) {
    const rows = [
      `產業類別：${data.industry || "＿＿＿＿"}。`,
      `是否有委託「${data.agencyCompany || "承辦仲介公司"}」辦理求才：是。`,
      `求才工作地點在哪：${data.workAddress || "＿＿＿＿"}。`,
      `（貴司員工的工作地址，請與承辦人員核對；若承辦人員說明正確，請回答「是」。）`
    ];
    if (helpers.hasRecruitmentCount(data)) rows.push(`本次求才人數是${data.recruitmentCount}人嗎：是。`);
    const leaveQuestion = this.leaveQuestion(data);
    if (leaveQuestion) rows.push(leaveQuestion);
    rows.push(...this.workTimeQuestions(data));
    rows.push(data.publicPhone ? `公開求才電話為${data.publicPhone}，這支電話會公布在台灣就業通網站，若有人來求才請不要拒絕：好。` : "這支電話會公布在台灣就業通網站，若有人來求才請不要拒絕：好。");
    return rows;
  },
  build(data, target) {
    target.innerHTML = `
      <h1>求才通知單</h1>
      <div class="notice-meta">
        <p><strong>雇主：</strong>${data.companyName || ""}</p>
        <p><strong>聯絡人：</strong>${data.contactName || ""}</p>
        <p><strong>聯絡電話：</strong>${helpers.contactPhoneText(data)}</p>
        <p><strong>求才時間：</strong>${helpers.displayDateSlash(data.recruitmentDate)}</p>
      </div>
      <p>為辦理申請外籍移工程序，本公司將會安排人員至「就業中心」求才登記，屆時會有就業中心承辦人員和您確認是否有委託仲介公司辦理求才登記及確認求才條件，故要麻煩您依照我們發給您的求才內容作核對，請幫我們回答承辦人員問題即可。</p>
      <p>以下求才條件皆為制式，若有需異動或其他問題，再麻煩您告知您的業務做變更，謝謝。</p>
      <h2>就業中心 Q&A</h2>
      <ul class="qa-list">${this.qAndA(data).map((item) => `<li>${item}</li>`).join("")}</ul>
      <p>以上問答是大部分就業服務站會詢問的重點，其餘未特別提供的問題，若內容正確，回答「是」即可。</p>
      <p>由於求才相關規定，若有就業服務站推薦求職者前往面試，切勿以年齡、性別、學歷、經歷等理由拒絕。</p>
      <p>與求職者面談時，面談條件均須與求才條件相符，包括工時、任用薪資、投保薪資及休假。</p>
      <p>請留下求職者之履歷表及「就業中心」推介卡，並掃描或拍照提供給負責仲介人員，以利後續聯絡求職者。</p>
      <p>若需要本公司業務協助接洽面試者，也可通知我們協助處理，謝謝辛苦了。</p>
      <p class="signoff">${data.agencyCompany || ""} 致上</p>
    `;
  },
  validateData(data) {
    const required = ["companyName", "workAddress"];
    const missing = required.filter((key) => !data[key]);
    if (missing.length) throw new Error(`通知單產生失敗，缺少資料：${missing.join(", ")}`);
    if (!helpers.latestSubmission(data)) console.warn("此案件尚無公司最新回覆，求才通知單將使用案件基本資料與預設工時。", data.caseId);
  },
  async prepareDom(target) {
    target.classList.add("pdf-rendering");
    await Promise.resolve();
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height || !target.textContent.trim()) throw new Error("通知單 DOM 尚未完成渲染。");
  },
  canvasHasInk(canvas) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return false;
    const sample = context.getImageData(0, 0, width, height).data;
    for (let index = 0; index < sample.length; index += 16) {
      if (sample[index] < 245 || sample[index + 1] < 245 || sample[index + 2] < 245) return true;
    }
    return false;
  },
  async download(data, target) {
    try {
      this.validateData(data);
      const filename = `求才通知單_${helpers.safeFilePart(data.companyName)}_${helpers.todayStamp()}.pdf`;
      const blob = this.createTextPdfBlob(this.documentLines(data));
      if (!blob.size) throw new Error("PDF 產生失敗，檔案大小為 0。");
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (data.caseId && !data.skipPdfInfoSave) {
        await caseService.savePdfInfo(data.caseId, { pdfFileName: filename, pdfUrl: "" });
      }
      return filename;
    } catch (error) {
      console.error("通知單產生失敗", error);
      alert("通知單產生失敗，請稍後再試");
      throw error;
    } finally {
      if (target) target.classList.remove("pdf-rendering");
    }
  },
  async downloadForCase(caseId, target) {
    const pageCaseId = helpers.getCaseIdFromUrl();
    if (pageCaseId && pageCaseId !== caseId) throw new Error("目前案件已切換，請重新整理頁面。");
    const latestCase = await caseService.getCase(caseId);
    if (!latestCase) throw new Error("案件不存在，無法產生求才通知單。");
    return this.download(submissionService.mergeCaseAndResponse(latestCase), target);
  },
  documentLines(data) {
    return [
      { text: "求才通知單", size: 20, align: "center", bold: true, gap: 5 },
      { type: "rule", gap: 10 },
      { type: "meta", size: 11, rows: [
        [
          { label: "雇主：", value: data.companyName || "" },
          { label: "聯絡人：", value: data.contactName || "" }
        ],
        [
          { label: "聯絡電話：", value: helpers.contactPhoneText(data) },
          { label: "求才時間：", value: helpers.displayDateSlash(data.recruitmentDate) }
        ]
      ], gap: 10 },
      { text: "為辦理申請外籍移工程序，本公司將會安排人員至「就業中心」求才登記，屆時會有就業中心承辦人員和您確認是否有委託仲介公司辦理求才登記及確認求才條件，故要麻煩您依照我們發給您的求才內容作核對，請幫我們回答承辦人員問題即可。", size: 11 },
      { text: "以下求才條件皆為制式，若有需異動或其他問題，再麻煩您告知您的業務做變更，謝謝。", size: 11, gap: 7 },
      { text: "就業中心 Q&A", size: 13, bold: true, gap: 4 },
      ...this.qAndA(data).map((item) => ({ text: `• ${item}`, size: 10.5, bullet: true })),
      { text: "以上問答是大部分就業服務站會詢問的重點，其餘未特別提供的問題，若內容正確，回答「是」即可。", size: 11, gap: 8 },
      { text: "由於求才相關規定，若有就業服務站推薦求職者前往面試，切勿以年齡、性別、學歷、經歷等理由拒絕。", size: 11 },
      { text: "與求職者面談時，面談條件均須與求才條件相符，包括工時、任用薪資、投保薪資及休假。", size: 11 },
      { text: "請留下求職者之履歷表及「就業中心」推介卡，並掃描或拍照提供給負責仲介人員，以利後續聯絡求職者。", size: 11 },
      { text: "若需要本公司業務協助接洽面試者，也可通知我們協助處理，謝謝辛苦了。", size: 11, gap: 12 },
      { text: `${data.agencyCompany || ""} 致上`, size: 12, align: "right", noWrap: true }
    ];
  },
  wrapText(text, maxChars = 33) {
    const rows = [];
    let line = "";
    String(text || "").split("").forEach((char) => {
      line += char;
      if (line.length >= maxChars) {
        rows.push(line);
        line = "";
      }
    });
    if (line) rows.push(line);
    return rows;
  },
  wrapTextByWidth(text, size, maxWidth) {
    const rows = [];
    let line = "";
    String(text || "").split("").forEach((char) => {
      const next = `${line}${char}`;
      if (line && this.estimateTextWidth(next, size) > maxWidth) {
        rows.push(line);
        line = char;
      } else {
        line = next;
      }
    });
    if (line) rows.push(line);
    const last = rows[rows.length - 1] || "";
    if (rows.length > 1 && Array.from(last).length <= 2) {
      const previous = rows[rows.length - 2];
      const previousChars = Array.from(previous);
      if (previousChars.length > 8) {
        rows[rows.length - 2] = previousChars.slice(0, -2).join("");
        rows[rows.length - 1] = `${previousChars.slice(-2).join("")}${last}`;
      }
    }
    return rows.length ? rows : [""];
  },
  utf16Hex(text) {
    return Array.from(String(text || "")).map((char) => {
      const code = char.charCodeAt(0);
      return code.toString(16).padStart(4, "0");
    }).join("");
  },
  pdfLiteral(text) {
    return String(text || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  },
  estimateTextWidth(text, size) {
    return Array.from(String(text || "")).reduce((total, char) => {
      if (char === " " || char === "　") return total + size * 0.24;
      if (/[0-9A-Za-z/:~.,()\-]/.test(char)) return total + size * 0.5;
      if (/[：～「」『』]/.test(char)) return total + size * 0.48;
      if (/[，。：；、（）]/.test(char)) return total + size * 0.65;
      return total + size;
    }, 0);
  },
  textRuns(text) {
    const runs = [];
    let current = "";
    let currentType = "";
    Array.from(String(text || "")).forEach((char) => {
      const type = char.charCodeAt(0) <= 127 ? "latin" : "cjk";
      const runChar = char;
      if (current && type !== currentType) {
        runs.push({ type: currentType, text: current });
        current = "";
      }
      current += runChar;
      currentType = type;
    });
    if (current) runs.push({ type: currentType, text: current });
    return runs;
  },
  drawPdfText(text, x, y, size, options = {}) {
    const drawAt = (offsetX) => {
      let cursor = x + offsetX;
      return this.textRuns(text).map((run) => {
        const font = run.type === "latin" ? "F2" : "F1";
        const body = run.type === "latin" ? `(${this.pdfLiteral(run.text)})` : `<${this.utf16Hex(run.text)}>`;
        const command = `BT /${font} ${size} Tf 1 0 0 1 ${cursor.toFixed(1)} ${y.toFixed(1)} Tm ${body} Tj ET`;
        cursor += this.estimateTextWidth(run.text, size);
        return command;
      }).join("\n");
    };
    return drawAt(0);
  },
  createTextPdfBlob(items) {
    const pageWidth = 595;
    const pageHeight = 842;
    const marginX = 52;
    const startY = 792;
    const bottomY = 50;
    const metaColumnGap = 20;
    const metaColumnWidth = (pageWidth - (marginX * 2) - metaColumnGap) / 2;
    const prepareMetaRows = (item) => {
      const size = item.size || 11;
      const lineHeight = size + 4;
      return (item.rows || []).map((row) => {
        const fields = row.map((field) => {
          const label = field.label || "";
          const labelWidth = this.estimateTextWidth(label, size) + 2;
          const valueLines = this.wrapTextByWidth(field.value || "", size, Math.max(44, metaColumnWidth - labelWidth));
          return { ...field, label, labelWidth, valueLines };
        });
        return { fields, height: Math.max(1, ...fields.map((field) => field.valueLines.length)) * lineHeight };
      });
    };
    const pages = [[]];
    let y = startY;
    items.forEach((item) => {
      if (item.type === "rule") {
        pages[pages.length - 1].push({ type: "rule", y });
        y -= item.gap || 8;
        return;
      }
      if (item.type === "meta") {
        const preparedRows = prepareMetaRows(item);
        const totalHeight = preparedRows.reduce((sum, row) => sum + row.height, 0);
        if (y - totalHeight < bottomY) {
          pages.push([]);
          y = startY;
        }
        pages[pages.length - 1].push({ ...item, rows: preparedRows, y });
        y -= totalHeight + (item.gap || 8);
        return;
      }
      const maxWidth = pageWidth - (marginX * 2) - (item.bullet ? 12 : 0);
      const lines = item.noWrap ? [item.text] : this.wrapTextByWidth(item.text, item.size, maxWidth);
      lines.forEach((line, index) => {
        const lineHeight = item.size + (item.bullet ? 2.5 : 3.8);
        if (y - lineHeight < bottomY) {
          pages.push([]);
          y = startY;
        }
        pages[pages.length - 1].push({ ...item, text: line, y, continued: index > 0 });
        y -= lineHeight;
      });
      y -= item.gap || 2;
    });
    const objects = [];
    const addObject = (body) => {
      objects.push(body);
      return objects.length;
    };
    const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesId = addObject("");
    const fontId = addObject("<< /Type /Font /Subtype /Type0 /BaseFont /MSung-Light /Encoding /UniCNS-UCS2-H /DescendantFonts [4 0 R] >>");
    addObject("<< /Type /Font /Subtype /CIDFontType0 /BaseFont /MSung-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (CNS1) /Supplement 0 >> /DW 1000 >>");
    const latinFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const pageIds = [];
    pages.forEach((pageLines) => {
      const content = [
        ...pageLines.map((line) => {
          if (line.type === "rule") return `q 1 w ${marginX} ${line.y.toFixed(1)} m ${pageWidth - marginX} ${line.y.toFixed(1)} l S Q`;
          if (line.type === "meta") {
            const rowPositions = [marginX, marginX + metaColumnWidth + metaColumnGap];
            const lineHeight = (line.size || 11) + 4;
            let rowTop = line.y;
            return (line.rows || []).map((row, rowIndex) => {
              const rowY = rowTop;
              rowTop -= row.height;
              return row.fields.map((field, index) => {
                const x = rowPositions[index] || marginX;
                const label = field.label || "";
                const labelDraw = this.drawPdfText(label, x, rowY, line.size, { bold: true });
                const valueX = x + field.labelWidth;
                const valueDraws = field.valueLines.map((value, lineIndex) => this.drawPdfText(value, valueX, rowY - (lineIndex * lineHeight), line.size));
                return `${labelDraw}\n${valueDraws.join("\n")}`;
              }).join("\n");
            }).join("\n");
          }
          const textWidth = this.estimateTextWidth(line.text, line.size);
          const rightSafeInset = 12;
          const x = line.align === "center" ? pageWidth / 2 - textWidth / 2 : line.align === "right" ? pageWidth - marginX - rightSafeInset - textWidth : marginX + (line.continued ? (line.bullet ? 12 : 0) : 0);
          return this.drawPdfText(line.text, Math.max(marginX, x), line.y, line.size, { bold: line.bold });
        })
      ].join("\n");
      const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${latinFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    });
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    const parts = ["%PDF-1.4\n"];
    const offsets = [0];
    objects.forEach((body, index) => {
      offsets.push(parts.join("").length);
      parts.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
    });
    const xrefOffset = parts.join("").length;
    parts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
    offsets.slice(1).forEach((offset) => parts.push(`${String(offset).padStart(10, "0")} 00000 n \n`));
    parts.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    return new Blob([parts.join("")], { type: "application/pdf" });
  }
};
