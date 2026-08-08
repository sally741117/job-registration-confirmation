const URL_PARAMS = typeof window === "undefined" ? new URLSearchParams("") : new URLSearchParams(window.location.search);

const CONFIG = {
  STORAGE_MODE: "remote",
  GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbw5O0YNav0Ioec2fwTbnyGRp_CTincrdNaOV_OHpQSMJmhzZJkR_4AnCWFyV9sJlC2b/exec",
  PUBLIC_APP_BASE_URL: "https://sally741117.github.io/job-registration-confirmation",
  ADMIN_EMAIL: "sally741117@gmail.com"
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
  if (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return "local";
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

const SUBMISSION_FIELDS = [
  "standardTime",
  "shiftType",
  "shifts",
  "rotationMethod",
  "shiftNote",
  "partTimes",
  "leaveType",
  "weekendFixed",
  "weekendNote",
  "workDays",
  "restDays",
  "monthlyLeaveDays",
  "leaveOther",
  "lactationRoom",
  "childcare",
  "childcareItems",
  "childcareOther",
  "finalConfirm"
];

function serviceError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code || "API_ERROR";
  Object.assign(error, details);
  return error;
}

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
    return this.formatTime(value);
  },
  formatTaiwanDate(value) {
    if (value === undefined || value === null || value === "") return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(value);
    }
    const raw = String(value).trim().replace(/^"+|"+$/g, "");
    if (!raw || raw === "Invalid Date") return "";
    const dateOnly = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (dateOnly && !/[T:]/.test(raw.replace(dateOnly[0], ""))) {
      return `${dateOnly[1]}/${this.pad(dateOnly[2])}/${this.pad(dateOnly[3])}`;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      console.warn("日期欄位格式無法解析", { value });
      return "";
    }
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(parsed);
  },
  formatTime(value) {
    const raw = String(value || "").trim().replace(/^"+|"+$/g, "");
    if (!raw) return "";
    const match = raw.match(/(\d{1,2}):(\d{2})/);
    if (match) return `${this.pad(match[1])}:${match[2]}`;
    const digits = raw.match(/^(\d{1,2})(\d{2})$/);
    if (digits) return `${this.pad(digits[1])}:${digits[2]}`;
    console.warn("時間欄位格式無法解析", { value });
    return "";
  },
  formatWorkTime(start, end) {
    const normalizedStart = this.formatTime(start);
    const normalizedEnd = this.formatTime(end);
    return normalizedStart && normalizedEnd ? `${normalizedStart}～${normalizedEnd}` : "";
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
    if (CONFIG.ACTIVE_STORAGE_MODE === "local" && typeof window !== "undefined") {
      return String(window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "")).replace(/\/$/, "");
    }
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
  buildNoticeUrl(caseRecord) {
    const caseId = String(caseRecord?.caseId || "").trim();
    const token = String(caseRecord?.noticeAccessToken || "").trim();
    if (!this.isValidPublicValue(caseId) || !this.isValidPublicValue(token)) {
      throw new Error("通知查看連結資料不完整，缺少有效案件編號或通知 token。");
    }
    const url = new URL(`${this.publicBaseUrl()}/notice.html`);
    url.searchParams.set("caseId", caseId);
    url.searchParams.set("token", token);
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
  caseCreatedSortValue(item = {}) {
    const createdAt = Date.parse(item.createdAt || "");
    if (Number.isFinite(createdAt)) return createdAt;
    const match = String(item.caseId || "").match(/(\d{4})(\d{2})(\d{2})(?:[-_]?([0-2]\d)([0-5]\d)([0-5]\d))?(?:-(\d+))?$/);
    if (!match) return Number.NEGATIVE_INFINITY;
    const [, year, month, day, hour = "00", minute = "00", second = "00", sequence = "0"] = match;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) + Number(sequence);
  },
  compareCasesByCreatedAtDesc(a, b) {
    const difference = this.caseCreatedSortValue(b) - this.caseCreatedSortValue(a);
    if (Number.isFinite(difference) && difference !== 0) return difference;
    return String(b.caseId || "").localeCompare(String(a.caseId || ""), "zh-Hant", { numeric: true });
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
    return this.formatTaiwanDate(value);
  },
  contactPhoneText(data = {}) {
    const phone = String(data.contactPhone || "").trim();
    const extension = String(data.extension || "").trim();
    if (!phone) return "＿＿＿＿＿＿";
    return extension ? `${phone} 分機 ${extension}` : phone;
  },
  creationToken(record = {}) {
    return record.token
      || record.formAccessToken
      || record.formToken
      || record.fillToken
      || record.publicToken
      || record.accessToken
      || record.case?.token
      || record.case?.formAccessToken
      || record.case?.formToken
      || record.case?.fillToken
      || "";
  },
  async sha256Hex(value) {
    const bytes = new TextEncoder().encode(String(value || ""));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
  loginPromptMessage: "",
  getAdminSession() {
    try {
      const raw = sessionStorage.getItem(this.adminSessionKey);
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
    sessionStorage.setItem(this.adminSessionKey, JSON.stringify(stored));
  },
  clearAdminSession() {
    sessionStorage.removeItem(this.adminSessionKey);
  },
  isSessionUsable(session) {
    if (!session?.token) return false;
    if (!session.expiresAt) return true;
    return new Date(session.expiresAt).getTime() > Date.now() + 60000;
  },
  showAdminLoginDialog(message = "") {
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
          <p data-login-help style="margin:0;color:#475569;font-size:14px;">請輸入管理員密碼。</p>
          <label style="display:grid;gap:6px;font-size:14px;">Email<input name="email" type="email" autocomplete="username" readonly required value="${CONFIG.ADMIN_EMAIL || ""}" style="font:inherit;padding:10px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;"></label>
          <label style="display:grid;gap:6px;font-size:14px;">密碼
            <span style="display:flex;gap:8px;">
              <input name="password" type="password" autocomplete="current-password" required style="font:inherit;padding:10px;border:1px solid #cbd5e1;border-radius:6px;flex:1;min-width:0;">
              <button type="button" data-toggle-password style="padding:10px 12px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;">顯示</button>
            </span>
          </label>
          <p data-login-error style="${message ? "" : "display:none;"}margin:0;color:#b91c1c;font-size:14px;">${message || "Email或密碼不正確"}</p>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button type="button" data-cancel style="padding:10px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;">取消</button>
            <button type="submit" data-login-submit style="padding:10px 14px;border:0;background:#2563eb;color:#fff;border-radius:6px;">登入</button>
          </div>
        </form>
      `;
      const form = overlay.querySelector("form");
      const passwordInput = form.password;
      const submitButton = overlay.querySelector("[data-login-submit]");
      const errorText = overlay.querySelector("[data-login-error]");
      const toggleButton = overlay.querySelector("[data-toggle-password]");
      toggleButton.addEventListener("click", () => {
        const visible = passwordInput.type === "text";
        passwordInput.type = visible ? "password" : "text";
        toggleButton.textContent = visible ? "顯示" : "隱藏";
      });
      const cleanup = () => {
        this.loginModalOpen = false;
        overlay.remove();
      };
      overlay.querySelector("[data-cancel]").addEventListener("click", () => {
        cleanup();
        reject(new Error("尚未登入管理後台。"));
      });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const credentials = {
          email: String(data.get("email") || "").trim(),
          password: String(data.get("password") || "")
        };
        if (!credentials.password) {
          errorText.style.display = "block";
          return;
        }
        submitButton.disabled = true;
        submitButton.textContent = "登入中…";
        errorText.style.display = "none";
        try {
          const passwordDigest = await helpers.sha256Hex(credentials.password);
          const result = await this.request("adminLogin", { email: credentials.email, password: passwordDigest, skipAdminSession: true }, { skipAuthRetry: true });
          const normalized = this.normalizeAdminLogin(result);
          if (!normalized.token) throw new Error("INVALID_CREDENTIALS");
          this.setAdminSession(normalized);
          cleanup();
          resolve(normalized.token);
        } catch (error) {
          errorText.textContent = "Email或密碼不正確";
          errorText.style.display = "block";
          submitButton.disabled = false;
          submitButton.textContent = "登入";
          passwordInput.select();
        }
      });
      document.body.appendChild(overlay);
      passwordInput.focus();
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
    if (this.adminAuthPromise) return this.adminAuthPromise;
    const promptMessage = this.loginPromptMessage;
    this.loginPromptMessage = "";
    this.adminAuthPromise = this.loginAndStoreSession(promptMessage)
      .finally(() => {
        this.adminAuthPromise = null;
      });
    return this.adminAuthPromise;
  },
  async loginAndStoreSession(message = "") {
    return this.showAdminLoginDialog(message);
  },
  normalizeAdminLogin(result = {}) {
    return {
      token: result.sessionToken || result.token || result.adminSessionToken || "",
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
    let text;
    try {
      response = await fetch(CONFIG.GOOGLE_APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(envelope),
        signal: controller.signal
      });
      text = await response.text();
    } catch (error) {
      if (error.name === "AbortError") throw serviceError("NETWORK_ERROR", "線上服務回應逾時，請稍後重試。", { cause: error });
      throw serviceError("NETWORK_ERROR", error.message || "無法連線到線上服務。", { cause: error });
    } finally {
      window.clearTimeout(timer);
    }
    let result = null;
    try {
      result = JSON.parse(text);
    } catch (error) {
      console.warn("Remote API returned non-JSON", {
        action,
        httpStatus: response.status,
        contentType: response.headers.get("content-type") || "",
        preview: text.slice(0, 200)
      });
      throw serviceError("INVALID_RESPONSE", "線上服務回傳格式錯誤，請稍後再試。", {
        httpStatus: response.status,
        contentType: response.headers.get("content-type") || "",
        preview: text.slice(0, 200)
      });
    }
    const authCode = result?.code || result?.error?.code || "";
    const authMessage = String(result?.error?.message || result?.error || result?.message || "");
    const isExplicitAuthFailure = ["UNAUTHORIZED", "SESSION_EXPIRED"].includes(authCode)
      || result.status === 401
      || /登入|逾時|授權|UNAUTHORIZED|SESSION_EXPIRED/i.test(authMessage);
    if ((!response.ok || result?.ok === false) && isExplicitAuthFailure && this.needsAdmin(action) && !options.skipAuthRetry) {
      this.clearAdminSession();
      this.loginPromptMessage = authCode === "SESSION_EXPIRED" ? "登入已逾時，請重新登入" : "";
      if (!options.retried) return this.request(action, payload, { retried: true });
    }
    if (!result?.ok) {
      const apiCode = result?.code || result?.error?.code || "API_ERROR";
      const apiMessage = result?.error?.message || result?.error || result?.message || "線上服務暫時無法使用。";
      throw serviceError(apiCode, apiMessage, { httpStatus: response.status, raw: result });
    }
    const healthPayload = result?.result?.service || result?.data?.service || result?.service;
    if (!["healthCheck", "ping"].includes(action) && healthPayload) {
      console.error("Remote API returned health payload for data action", {
        action,
        payload,
        httpStatus: response.status,
        responseSummary: {
          ok: result?.ok,
          resultService: result?.result?.service,
          dataService: result?.data?.service,
          service: result?.service
        }
      });
      throw serviceError("HEALTH_RESPONSE", "服務請求送錯，收到健康檢查資料。", { httpStatus: response.status, raw: result, action });
    }
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
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return this.createCaseRemote(input);
    const now = new Date().toISOString();
    const cases = localStore.readCases();
    if (input.requestId) {
      const existing = cases.find((item) => item.requestId === input.requestId);
      if (existing) return this.normalizeCreateCaseResult(existing, input);
    }
    const caseRecord = {
      caseId: this.generateCaseId(input.companyName, cases),
      requestId: input.requestId || "",
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
      formAccessToken: this.generateAccessToken(),
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
    return this.normalizeCreateCaseResult({ ...input, ...caseRecord });
  },
  async createCaseRemote(input) {
    const requestId = input.requestId || "";
    try {
      const raw = await remoteClient.request("createCase", input);
      return this.normalizeCreateCaseResult(raw, input);
    } catch (error) {
      const recovered = requestId ? await this.findCreatedCaseByRequestId(requestId).catch((lookupError) => {
        console.warn("建立案件回傳不完整後，requestId 查詢建立結果失敗", { requestId, lookupError });
        return null;
      }) : null;
      if (recovered) return this.normalizeCreateCaseResult(recovered, input);
      if (error?.code === "INCOMPLETE_CREATE_RESPONSE") {
        return {
          ok: false,
          code: "CREATE_RESULT_UNCONFIRMED",
          message: "建立結果尚未確認，請先重新載入案件列表，勿重複送出。"
        };
      }
      return {
        ok: false,
        code: error?.code || "API_ERROR",
        message: error?.message || "建立案件失敗，請稍後再試。"
      };
    }
  },
  normalizeCreateCaseResult(raw, input = {}) {
    const candidates = [
      raw?.case,
      raw?.data?.case,
      raw?.result?.case,
      raw?.record,
      raw?.data,
      raw?.result,
      raw
    ].filter((value) => value && typeof value === "object" && !Array.isArray(value));
    const source = candidates.find((value) => value.caseId || value.id || value.caseID || helpers.creationToken(value)) || candidates[0] || {};
    const record = this.normalizeCaseRecord({
      ...input,
      ...source,
      caseId: source.caseId || source.caseID || source.id || raw?.caseId || raw?.caseID || raw?.id || input.caseId || "",
      formAccessToken: helpers.creationToken(source) || helpers.creationToken(raw) || input.formAccessToken || ""
    });
    const token = helpers.creationToken(record);
    if (!record.caseId || !token) {
      console.error("建立案件回傳資料不完整", {
        raw,
        normalized: record,
        caseId: record.caseId || "",
        tokenPresent: Boolean(token)
      });
      throw serviceError("INCOMPLETE_CREATE_RESPONSE", "建立案件回傳資料不完整，缺少案件編號或填寫 token。", { raw, normalized: record });
    }
    const normalizedCase = {
      ...record,
      formAccessToken: token,
      token,
      status: record.status || CASE_STATUS.pending
    };
    return {
      ok: true,
      caseId: normalizedCase.caseId,
      token,
      formUrl: helpers.formUrl(normalizedCase),
      case: normalizedCase
    };
  },
  async findCreatedCaseByRequestId(requestId) {
    if (!requestId) return null;
    const result = await this.listCases();
    const cases = Array.isArray(result.cases) ? result.cases : [];
    return cases.find((item) => item.requestId === requestId) || null;
  },
  normalizeCaseRecord(record = {}) {
    let data = record || {};
    for (let i = 0; i < 4; i += 1) {
      const next = data?.data || data?.result || data?.case || data?.record || data?.item;
      if (!next || next === data) break;
      data = next;
    }
    const parseObject = (value, fieldName) => {
      if (!value) return {};
      if (typeof value === "object") return value;
      try {
        return JSON.parse(value);
      } catch (error) {
        console.warn(`${fieldName} 欄位不是有效 JSON，已使用空物件替代。`, { fieldName, value, error });
        return {};
      }
    };
    const parseArray = (value, fieldName) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.warn(`${fieldName} 欄位不是有效 JSON 陣列，已使用空陣列替代。`, { fieldName, value, error });
        return [];
      }
    };
    const response = parseObject(data.response || data.responseJson, "responseJson");
    const submissions = parseArray(data.submissions || data.submissionsJson, "submissionsJson").map((submission) => ({
      ...submission,
      response: parseObject(submission.response || submission.responseJson, "submission.responseJson"),
      responseJson: parseObject(submission.responseJson || submission.response, "submission.responseJson")
    }));
    const noticeContent = parseObject(data.noticeContent || data.noticeContentJson || response.noticeContent, "noticeContent");
    const workStartTime = data.workStartTime || response.workStartTime || response.standardTime?.start || "08:00";
    const workEndTime = data.workEndTime || response.workEndTime || response.standardTime?.end || "17:00";
    return {
      ...data,
      caseId: data.caseId || data.caseID || data.id || "",
      requestId: data.requestId || "",
      companyName: data.companyName || "",
      workAddress: data.workAddress || data.workLocation || "",
      workLocation: data.workLocation || data.workAddress || "",
      contactName: data.contactName || "",
      contactPhone: data.contactPhone || "",
      extension: data.extension || "",
      recruitmentDate: helpers.formatTaiwanDate(data.recruitmentDate || response.recruitmentDate),
      industry: data.industry || response.industry || "",
      salaryMin: data.salaryMin || "",
      salaryMax: data.salaryMax || "",
      publicPhone: data.publicPhone || response.publicPhone || "",
      workStartTime: helpers.formatTime(workStartTime),
      workEndTime: helpers.formatTime(workEndTime),
      contractor: data.contractor || data.agencyCompany || "",
      agencyCompany: data.agencyCompany || data.contractor || "",
      noticeContent,
      status: data.status || "",
      response,
      submissions,
      formAccessToken: String(data.formAccessToken || data.token || data.formToken || data.fillToken || "").trim(),
      noticeAccessToken: String(data.noticeAccessToken || data.noticeToken || "").trim()
    };
  },
  summarizeListResponse(result) {
    if (Array.isArray(result)) return `array(length=${result.length})`;
    if (!result || typeof result !== "object") return `${typeof result}:${String(result).slice(0, 120)}`;
    const keys = Object.keys(result);
    const dataKeys = result.data && typeof result.data === "object" ? Object.keys(result.data) : [];
    const resultKeys = result.result && typeof result.result === "object" ? Object.keys(result.result) : [];
    return JSON.stringify({
      keys,
      dataKeys,
      resultKeys,
      casesType: Array.isArray(result.cases) ? "array" : typeof result.cases,
      dataCasesType: Array.isArray(result.data?.cases) ? "array" : typeof result.data?.cases,
      resultCasesType: Array.isArray(result.result?.cases) ? "array" : typeof result.result?.cases
    });
  },
  normalizeCaseList(result) {
    const candidates = [
      result?.cases,
      result?.data?.cases,
      result?.result?.cases,
      Array.isArray(result?.data) ? result.data : null,
      Array.isArray(result?.result) ? result.result : null,
      Array.isArray(result) ? result : null
    ];
    const data = candidates.find((value) => Array.isArray(value));
    if (!data) {
      const summary = this.summarizeListResponse(result);
      console.error("listCases 回傳格式不是陣列", {
        summary,
        raw: result
      });
      throw new Error(`案件列表回傳格式錯誤：${summary}`);
    }
    const cases = data
      .map((item) => {
        const record = this.normalizeCaseRecord(item);
        return {
          ...record,
          caseId: record.caseId || "",
          companyName: record.companyName || "",
          workAddress: record.workAddress || "",
          status: record.status || "",
          createdAt: record.createdAt || "",
          updatedAt: record.updatedAt || "",
          submittedAt: record.submittedAt || "",
          hasUnreadResponse: Boolean(record.hasUnreadResponse),
          noticeFileName: record.noticeFileName || "",
          noticeUploadedAt: record.noticeUploadedAt || ""
        };
      })
      .filter((item) => item.status !== CASE_STATUS.deleted && !item.deletedAt)
      .sort((a, b) => helpers.compareCasesByCreatedAtDesc(a, b));
    return { ok: true, cases };
  },
  normalizePublicFormCaseResult(result) {
    const candidates = [
      result?.case,
      result?.data?.case,
      result?.result?.case,
      result?.data,
      result?.result,
      result
    ];
    const data = candidates.find((value) => value && typeof value === "object" && !Array.isArray(value));
    if (!data) throw serviceError("INVALID_RESPONSE", "公開案件資料回傳格式錯誤。", { raw: result });
    const record = this.normalizeCaseRecord(data);
    if (!record.caseId || (!record.companyName && !record.workAddress)) {
      throw serviceError("INVALID_RESPONSE", "公開案件資料缺少必要欄位。", { raw: result });
    }
    return { ok: true, case: record };
  },
  publicFormErrorResult(error) {
    const code = error?.code || "API_ERROR";
    const messages = {
      MISSING_PARAMETERS: "連結不完整，請確認網址包含案件編號與驗證 token。",
      CASE_NOT_FOUND: "找不到案件，案件可能已刪除或連結錯誤。",
      INVALID_TOKEN: "連結已失效或驗證失敗。",
      CASE_DELETED: "此案件已刪除，請聯絡承辦人員。",
      INVALID_RESPONSE: "案件資料回傳格式錯誤，請稍後重試或聯絡承辦人員。",
      NETWORK_ERROR: "案件資料載入失敗，請稍後重試。"
    };
    return {
      ok: false,
      code: messages[code] ? code : "API_ERROR",
      message: messages[code] || error?.message || "案件資料載入失敗，請稍後重試或聯絡承辦人員。",
      rawMessage: error?.message || String(error || "")
    };
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
      const result = await this.loadPublicFormCase(caseId, token);
      if (!result.ok) throw serviceError(result.code, result.message, { rawMessage: result.rawMessage });
      return result.case;
    }
    return this.getCase(caseId);
  },
  async loadPublicFormCase(caseId, token) {
    if (!helpers.isValidPublicValue(caseId) || (CONFIG.ACTIVE_STORAGE_MODE === "remote" && !helpers.isValidPublicValue(token))) {
      return { ok: false, code: "MISSING_PARAMETERS", message: "連結不完整，請確認網址包含案件編號與驗證 token。" };
    }
    const delays = [0, 500, 1000, 2000];
    let lastResult = null;
    for (let index = 0; index < delays.length; index += 1) {
      if (delays[index]) await new Promise((resolve) => window.setTimeout(resolve, delays[index]));
      try {
        const raw = CONFIG.ACTIVE_STORAGE_MODE === "remote"
          ? await remoteClient.request("getPublicFormCase", { caseId, token }, { timeoutMs: 25000 })
          : await this.getCase(caseId);
        return this.normalizePublicFormCaseResult(raw);
      } catch (error) {
        lastResult = this.publicFormErrorResult(error);
        if (!["CASE_NOT_FOUND", "NETWORK_ERROR", "INVALID_RESPONSE"].includes(lastResult.code)) return lastResult;
      }
    }
    return lastResult || { ok: false, code: "API_ERROR", message: "案件資料載入失敗，請稍後重試或聯絡承辦人員。" };
  },
  async listCases() {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return this.normalizeCaseList(await remoteClient.request("listCases", {}, { timeoutMs: 25000 }));
    const cases = localStore.readCases()
      .filter((item) => item.status !== CASE_STATUS.deleted && !item.deletedAt)
      .sort((a, b) => helpers.compareCasesByCreatedAtDesc(a, b));
    return { ok: true, cases };
  },
  async deleteCase(caseId) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") {
      const runDelete = () => remoteClient.request("deleteCase", { caseId });
      const verifyDeleted = async () => {
        const result = await this.listCases();
        return !result.cases.some((item) => item.caseId === caseId);
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
      noticeAccessToken: String(record.noticeAccessToken || "").trim()
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
    if (!record || String(record.noticeAccessToken || "").trim() !== String(token || "").trim() || record.status !== CASE_STATUS.notice_ready) return null;
    return noticeFileStore.attachObjectUrl(record);
  },
  async recordNoticeView(caseId, token) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") return this.normalizeCaseRecord(await remoteClient.request("recordNoticeView", { caseId, token }));
    const record = await this.getCase(caseId);
    if (!record || String(record.noticeAccessToken || "").trim() !== String(token || "").trim() || record.status !== CASE_STATUS.notice_ready) return null;
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
  normalizeSubmission(raw = {}) {
    const warnings = [];
    const source = raw && typeof raw === "object" ? raw : {};
    const responseSource = source.response && typeof source.response === "object"
      ? source.response
      : source.responseJson && typeof source.responseJson === "object"
        ? source.responseJson
        : source;
    const aliases = {
      standardTime: ["standardTime", "workTime", "workHours"],
      shiftType: ["shiftType", "workShiftType"],
      shifts: ["shifts", "shiftList"],
      rotationMethod: ["rotationMethod", "rotation"],
      partTimes: ["partTimes", "partTimeList"],
      leaveType: ["leaveType", "dayOffType"],
      weekendFixed: ["weekendFixed", "weekendIsFixed"],
      childcareItems: ["childcareItems", "childcareList"],
      finalConfirm: ["finalConfirm", "confirmed", "isConfirmed"]
    };
    const pick = (key) => {
      const names = aliases[key] || [key];
      for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(responseSource, name)) return responseSource[name];
      }
      return undefined;
    };
    const normalizeBooleanText = (value) => {
      if (value === true) return "是";
      if (value === false) return "否";
      return value === undefined || value === null ? "" : String(value);
    };
    const submission = {
      submissionId: source.submissionId || "",
      submittedAt: source.submittedAt || "",
      standardTime: pick("standardTime") || { start: "08:00", end: "17:00" },
      shiftType: pick("shiftType") || "",
      shifts: Array.isArray(pick("shifts")) ? pick("shifts") : [],
      rotationMethod: pick("rotationMethod") || "",
      shiftNote: pick("shiftNote") || "",
      partTimes: Array.isArray(pick("partTimes")) ? pick("partTimes") : [],
      leaveType: pick("leaveType") || "",
      weekendFixed: normalizeBooleanText(pick("weekendFixed")),
      weekendNote: pick("weekendNote") || "",
      workDays: pick("workDays") || "",
      restDays: pick("restDays") || "",
      monthlyLeaveDays: pick("monthlyLeaveDays") || "",
      leaveOther: pick("leaveOther") || "",
      lactationRoom: normalizeBooleanText(pick("lactationRoom")),
      childcare: pick("childcare") || "",
      childcareItems: Array.isArray(pick("childcareItems")) ? pick("childcareItems") : [],
      childcareOther: pick("childcareOther") || "",
      finalConfirm: Boolean(pick("finalConfirm"))
    };
    const extraFields = {};
    Object.keys(responseSource || {}).forEach((key) => {
      const known = SUBMISSION_FIELDS.includes(key) || Object.values(aliases).some((names) => names.includes(key));
      if (!known) extraFields[key] = responseSource[key];
    });
    ["shifts", "partTimes", "childcareItems"].forEach((key) => {
      const rawValue = pick(key);
      if (rawValue !== undefined && !Array.isArray(rawValue)) {
        warnings.push(`${key} 欄位不是陣列，已使用空陣列。`);
        console.warn("公司回覆欄位格式已寬鬆替代", { field: key, value: rawValue });
      }
    });
    return { submission, extraFields, warnings };
  },
  normalize(raw = {}) {
    let data = raw;
    for (let i = 0; i < 3; i += 1) {
      const next = data?.data || data?.result;
      if (!next || next === data) break;
      data = next;
    }
    const caseSource = caseService.normalizeCaseRecord(data.caseData || data.case || data.record || data);
    const fileSource = data.noticeFile || {};
    const latestSubmission = data.latestSubmission || helpers.latestSubmission(caseSource) || null;
    const normalizedSubmission = this.normalizeSubmission(latestSubmission || caseSource.response || {});
    const latestResponse = normalizedSubmission.submission;
    const mergedCase = caseService.normalizeCaseRecord({
      ...caseSource,
      ...latestResponse,
      response: latestResponse,
      latestSubmissionId: latestSubmission?.submissionId || caseSource.latestSubmissionId || ""
    });
    const normalizeNoticeFile = (file = {}) => ({
      id: file.id || file.noticeFileId || file.fileId || caseSource.noticeFileId || "",
      driveFileId: file.driveFileId || caseSource.driveFileId || "",
      fileName: file.fileName || file.name || caseSource.noticeFileName || "",
      fileType: file.fileType || file.mimeType || file.type || caseSource.noticeFileType || "",
      mimeType: file.mimeType || file.fileType || file.type || caseSource.noticeFileType || "",
      fileSize: Number(file.fileSize || file.size || caseSource.noticeFileSize || 0),
      previewUrl: file.previewUrl || file.fileUrl || file.url || caseSource.noticeFileUrl || "",
      downloadUrl: file.downloadUrl || file.fileUrl || file.url || caseSource.noticeFileUrl || ""
    });
    const rawNoticeFiles = Array.isArray(data.noticeFiles)
      ? data.noticeFiles
      : Array.isArray(data.files)
        ? data.files
        : [fileSource];
    const noticeFiles = rawNoticeFiles
      .map(normalizeNoticeFile)
      .filter((file) => file.previewUrl || file.downloadUrl || file.fileName);
    const noticeFile = noticeFiles[0] || normalizeNoticeFile(fileSource);
    return {
      ok: true,
      case: mergedCase,
      caseData: mergedCase,
      submission: normalizedSubmission.submission,
      extraFields: normalizedSubmission.extraFields,
      warnings: normalizedSubmission.warnings,
      noticeFile,
      noticeFiles,
      latestSubmission: latestSubmission ? { ...latestSubmission, response: normalizedSubmission.submission, responseJson: normalizedSubmission.submission } : null
    };
  },
  async getPublicNotice(caseId, token) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") {
      return this.normalize(await remoteClient.request("getPublicNotice", { caseId, token }, { timeoutMs: 10000 }));
    }
    return this.normalize(await caseService.validateNoticeAccess(caseId, token));
  },
  async getNoticeFile(caseId, token, fileId = "") {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") {
      const data = await remoteClient.request("getNoticeFile", { caseId, token, fileId }, { timeoutMs: 10000 });
      const file = data?.noticeFile || data?.data?.noticeFile || data?.result?.noticeFile || data;
      return {
        id: file.id || file.noticeFileId || file.fileId || "",
        noticeFileId: file.noticeFileId || file.id || file.fileId || "",
        driveFileId: file.driveFileId || "",
        fileName: file.fileName || "",
        fileType: file.fileType || "",
        mimeType: file.mimeType || file.fileType || "",
        fileSize: Number(file.fileSize || 0),
        previewUrl: file.previewUrl || file.fileUrl || "",
        downloadUrl: file.downloadUrl || file.fileUrl || ""
      };
    }
    return this.normalize(await caseService.validateNoticeAccess(caseId, token)).noticeFile;
  },
  async recordNoticeView(caseId, token) {
    if (CONFIG.ACTIVE_STORAGE_MODE === "remote") {
      return this.normalize(await remoteClient.request("recordNoticeView", { caseId, token }, { timeoutMs: 10000 }));
    }
    return this.normalize(await caseService.recordNoticeView(caseId, token));
  },
  pdfData(result) {
    const latest = result.latestSubmission || {};
    const response = latest.response || latest.responseJson || {};
    return {
      ...result.case,
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
    const standardTime = data.standardTime || { start: data.workStartTime || "08:00", end: data.workEndTime || "17:00" };
    const standardLabel = helpers.formatWorkTime(standardTime.start, standardTime.end) || helpers.formatWorkTime(data.workStartTime || "08:00", data.workEndTime || "17:00");
    if (!hasShift || !data.shifts?.length) lines.push(`固定日班 ${standardLabel}`);
    (data.shifts || []).filter((shift) => shift.start && shift.end).forEach((shift) => lines.push(`${shift.name} ${helpers.formatWorkTime(shift.start, shift.end)}`));
    (data.partTimes || []).filter((time) => time.start && time.end).forEach((time, index) => lines.push(`部分工時${index + 1} ${helpers.formatWorkTime(time.start, time.end)}`));
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
      completeShifts.slice(0, 3).forEach((shift) => rows.push(`${shift.name}工作時間為 ${helpers.formatWorkTime(shift.start, shift.end)}：是。`));
      if (data.rotationMethod) rows.push(`輪班方式是${data.rotationMethod}嗎：是。`);
    } else {
      const standardLabel = helpers.formatWorkTime(data.standardTime?.start || data.workStartTime || "08:00", data.standardTime?.end || data.workEndTime || "17:00");
      if (standardLabel) rows.push(`工作時間為 ${standardLabel}：是。`);
    }
    (data.partTimes || []).filter((time) => time.start && time.end).forEach((time, index) => {
      rows.push(`部分工時第${index + 1}時段為 ${helpers.formatWorkTime(time.start, time.end)}：是。`);
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
      `求才工作地點：${data.workAddress || data.workLocation || "＿＿＿＿"}。`,
      `（貴司員工的工作地址，請與承辦人員核對；若承辦人員說明正確，請回答「是」。）`
    ];
    if (helpers.hasRecruitmentCount(data)) rows.push(`本次求才人數是${data.recruitmentCount}人嗎：是。`);
    const leaveQuestion = this.leaveQuestion(data);
    if (leaveQuestion) rows.push(leaveQuestion);
    rows.push(...this.workTimeQuestions(data));
    rows.push(data.publicPhone ? `公開求才電話為 ${data.publicPhone}，此電話將公布於台灣就業通網站；若有求職者聯繫，請勿直接拒絕：好。` : "公開求才電話將公布於台灣就業通網站；若有求職者聯繫，請勿直接拒絕：好。");
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
        [{ label: "雇主：", value: data.companyName || "" }],
        [{ label: "聯絡人：", value: data.contactName || "" }],
        [{ label: "聯絡電話：", value: helpers.contactPhoneText(data) }],
        [{ label: "求才時間：", value: helpers.formatTaiwanDate(data.recruitmentDate) }]
      ], gap: 10 },
      { text: "為辦理申請外籍移工程序，本公司將會安排人員至「就業中心」求才登記，屆時會有就業中心承辦人員和您確認是否有委託仲介公司辦理求才登記及確認求才條件，故要麻煩您依照我們發給您的求才內容作核對，請幫我們回答承辦人員問題即可。", size: 11 },
      { text: "以下求才條件皆為制式，若有需異動或其他問題，再麻煩您告知您的業務做變更，謝謝。", size: 11, gap: 7 },
      { text: "就業中心 Q&A", size: 13, bold: true, gap: 4 },
      ...this.qAndA(data).map((item) => ({ text: `• ${item}`, size: 10.5, bullet: true, gap: 4 })),
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
    return `BT /F1 ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm <${this.utf16Hex(text)}> Tj ET`;
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
      const lineHeight = size * 1.5;
      return (item.rows || []).map((row) => {
        const columnCount = Math.max(1, row.length);
        const columnWidth = columnCount === 1 ? pageWidth - (marginX * 2) : metaColumnWidth;
        const fields = row.map((field) => {
          const label = field.label || "";
          const labelWidth = this.estimateTextWidth(label, size) + 2;
          const valueLines = this.wrapTextByWidth(field.value || "", size, Math.max(44, columnWidth - labelWidth));
          return { ...field, label, labelWidth, valueLines };
        });
        return { fields, columnCount, height: Math.max(1, ...fields.map((field) => field.valueLines.length)) * lineHeight };
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
      const lineHeight = item.size * (item.bullet ? 1.5 : 1.45);
      lines.forEach((line, index) => {
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
            const lineHeight = (line.size || 11) * 1.5;
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
