const SHEETS = {
  cases: "Cases",
  submissions: "Submissions",
  noticeFiles: "NoticeFiles",
  adminUsers: "AdminUsers",
  auditLogs: "AuditLogs"
};

const CASE_STATUS = {
  pending: "pending",
  submitted: "submitted",
  preparing_notice: "preparing_notice",
  notice_ready: "notice_ready",
  revision_open: "revision_open",
  deleted: "deleted"
};

const PUBLIC_FORM_CACHE_SECONDS = 120;
const PUBLIC_NOTICE_CACHE_SECONDS = 120;

const HEADERS = {
  Cases: ["caseId", "status", "createdAt", "updatedAt", "deletedAt", "deletedBy", "companyName", "workAddress", "recruitmentCount", "contactName", "contactPhone", "extension", "recruitmentDate", "industry", "publicPhone", "agencyCompany", "formAccessToken", "noticeAccessToken", "latestSubmissionId", "hasUnreadResponse", "responseViewedAt", "noticeViewed", "firstViewedAt", "lastViewedAt", "viewCount", "requestId"],
  Submissions: ["submissionId", "caseId", "submittedAt", "updatedAt", "isLatest", "responseJson"],
  NoticeFiles: ["noticeFileId", "caseId", "submissionId", "fileName", "fileType", "fileSize", "driveFileId", "fileUrl", "uploadedAt", "isCurrent"],
  AdminUsers: ["email", "role", "enabled", "createdAt"],
  AuditLogs: ["timestamp", "adminEmail", "action", "caseId", "detailJson"]
};

function doGet(e) {
  return handle_(e);
}

function doPost(e) {
  return handle_(e);
}

function handle_(e) {
  let payload = {};
  try {
    payload = parsePayload_(e);
    const action = payload.action || "";
    const body = payload.payload || {};
    const result = route_(action, body, payload.adminSessionToken || body.adminSessionToken || "");
    if (action === "createCase") return json_({ ok: true, data: createCaseResponse_(result) });
    if (action === "listCases") return json_({ ok: true, data: { cases: Array.isArray(result) ? result : [] } });
    if (["getPublicNotice", "validateNoticeAccess", "recordNoticeView", "getNoticeFile"].includes(action)) return json_({ ok: true, data: result });
    return json_({ ok: true, result });
  } catch (error) {
    console.error(error);
    if (payload && payload.action === "adminLogin") {
      return json_({ ok: false, code: "INVALID_CREDENTIALS", message: "Email或密碼不正確" });
    }
    if (payload && payload.action === "createCase") {
      return json_({ ok: false, error: { code: "CREATE_CASE_FAILED", message: error.message || String(error) } });
    }
    if (payload && payload.action === "listCases") {
      return json_({ ok: false, error: { code: "LIST_CASES_FAILED", message: error.message || String(error) } });
    }
    return json_({ ok: false, status: error.status || 500, code: error.code || "API_ERROR", error: error.message || String(error) });
  }
}

function parsePayload_(e) {
  const raw = e && e.postData && e.postData.contents;
  if (raw) return JSON.parse(raw);
  const params = e && e.parameter ? e.parameter : {};
  return {
    action: params.action || "",
    payload: params.payload ? JSON.parse(params.payload) : params
  };
}

function route_(action, payload, sessionToken) {
  if (!action) throw httpError_(400, "無效的服務請求", "UNKNOWN_ACTION");
  if (action === "healthCheck" || action === "ping") return healthCheck_();
  if (action === "adminLogin") return adminLogin_(payload.email, payload.password);
  if (action === "adminSessionCheck") return requireAdmin_(sessionToken);
  if (action === "getPublicFormCase") return getPublicFormCase_(payload.caseId, payload.token);
  if (action === "submitResponse") return submitResponse_(payload.caseId, payload.formAccessToken || payload.token, payload.response || {}, payload.wasRevision);
  if (action === "getPublicNotice" || action === "validateNoticeAccess") return getPublicNotice_(payload.caseId, payload.token);
  if (action === "recordNoticeView") return recordNoticeView_(payload.caseId, payload.token);
  if (action === "getNoticeFile") return getNoticeFile_(payload.caseId, payload.token, payload.fileId, sessionToken);

  const admin = requireAdmin_(sessionToken);
  if (action === "createCase") return createCase_(payload, admin);
  if (action === "listCases") return listCases_(false);
  if (action === "getCase") return getCaseForAdmin_(payload.caseId);
  if (action === "updateCase" || action === "updateCaseDetails") return updateCase_(payload.caseId, payload.input || payload, admin);
  if (action === "deleteCase") return deleteCase_(payload.caseId, admin);
  if (action === "bulkDeleteCases") return bulkDeleteCases_(payload.caseIds, admin);
  if (action === "reopenRevision" || action === "reopenForRevision") return reopenRevision_(payload.caseId, admin);
  if (action === "markResponseViewed") return markResponseViewed_(payload.caseId, admin);
  if (action === "uploadNoticeFile") return uploadNoticeFile_(payload.caseId, payload.fileData, payload.options || {}, admin);
  if (action === "deleteNoticeFile") return deleteNoticeFile_(payload.caseId, admin);
  if (action === "getNoticeFileAdmin") return getNoticeFileForAdmin_(payload.caseId, admin);
  if (action === "driveHealthCheck") return driveHealthCheck_(admin);
  throw httpError_(400, "無效的服務請求", "UNKNOWN_ACTION");
}

function setupProductionProperties(config) {
  const required = ["spreadsheetId", "noticeDriveFolderId", "adminEmail"];
  required.forEach((key) => {
    if (!config || !config[key]) throw new Error(`Missing setup field: ${key}`);
  });
  PropertiesService.getScriptProperties().setProperties({
    SPREADSHEET_ID: config.spreadsheetId,
    NOTICE_DRIVE_FOLDER_ID: config.noticeDriveFolderId,
    ADMIN_EMAIL: String(config.adminEmail).toLowerCase(),
    SESSION_TTL_SECONDS: String(config.sessionTtlSeconds || 21600),
    ADMIN_SESSION_SECRET: config.adminSessionSecret || generateToken_()
  }, true);
  ensureAllSheets_();
  upsertAdminUser_(config.adminEmail, "admin", true);
  return { ok: true };
}

function authorizeProductionScopes_() {
  const props = props_();
  const spreadsheetName = SpreadsheetApp.openById(props.SPREADSHEET_ID).getName();
  const folderName = DriveApp.getFolderById(props.NOTICE_DRIVE_FOLDER_ID).getName();
  return { spreadsheetName, folderName, authorizedAt: new Date().toISOString() };
}

function authorizeProductionScopes() {
  return authorizeProductionScopes_();
}

function diagnoseProductionScopes() {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty("NOTICE_DRIVE_FOLDER_ID");
  const spreadsheetId = props.getProperty("SPREADSHEET_ID");
  const folderLooksLikeUrl = folderId ? /^https?:\/\//i.test(folderId) || folderId.includes("/folders/") : false;
  const spreadsheetLooksLikeUrl = spreadsheetId ? /^https?:\/\//i.test(spreadsheetId) || spreadsheetId.includes("/spreadsheets/") : false;
  console.log({
    hasFolderId: Boolean(folderId),
    folderIdLength: folderId ? folderId.length : 0,
    folderLooksLikeUrl,
    hasSpreadsheetId: Boolean(spreadsheetId),
    spreadsheetIdLength: spreadsheetId ? spreadsheetId.length : 0,
    spreadsheetLooksLikeUrl
  });

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  console.log("Spreadsheet:", spreadsheet.getName());

  const folder = DriveApp.getFolderById(folderId);
  console.log("Folder:", folder.getName());

  return {
    ok: true,
    hasFolderId: Boolean(folderId),
    folderIdLength: folderId ? folderId.length : 0,
    folderLooksLikeUrl,
    hasSpreadsheetId: Boolean(spreadsheetId),
    spreadsheetIdLength: spreadsheetId ? spreadsheetId.length : 0,
    spreadsheetLooksLikeUrl
  };
}

function healthCheck_() {
  const props = props_();
  return {
    service: "job-registration-backend",
    configured: Boolean(props.SPREADSHEET_ID && props.NOTICE_DRIVE_FOLDER_ID),
    time: new Date().toISOString()
  };
}

function setAdminPassword(password) {
  if (!password || String(password).length < 8) throw new Error("管理員密碼長度至少需 8 碼。");
  const salt = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const hash = passwordHash_(sha256Hex_(String(password)), salt);
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_PASSWORD_SALT: salt,
    ADMIN_PASSWORD_HASH: hash,
    ADMIN_SESSION_SECRET: props_().ADMIN_SESSION_SECRET || generateToken_(),
    SESSION_TTL_SECONDS: "21600"
  }, false);
  return { ok: true, updatedAt: new Date().toISOString() };
}

function adminLogin_(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !password) throw invalidCredentials_();
  const props = props_();
  if (isLoginLocked_(normalizedEmail)) throw invalidCredentials_();
  if (normalizedEmail !== String(props.ADMIN_EMAIL || "").toLowerCase()) {
    registerLoginFailure_(normalizedEmail);
    throw invalidCredentials_();
  }
  if (!props.ADMIN_PASSWORD_HASH || !props.ADMIN_PASSWORD_SALT) throw invalidCredentials_();
  if (passwordHash_(String(password), props.ADMIN_PASSWORD_SALT) !== props.ADMIN_PASSWORD_HASH) {
    registerLoginFailure_(normalizedEmail);
    throw invalidCredentials_();
  }
  const admin = findAdminUser_(normalizedEmail);
  if (!admin || !truthy_(admin.enabled)) {
    registerLoginFailure_(normalizedEmail);
    throw invalidCredentials_();
  }
  clearLoginFailures_(normalizedEmail);
  const token = generateToken_();
  const ttl = 21600;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  CacheService.getScriptCache().put(sessionKey_(token), JSON.stringify({
    email: normalizedEmail,
    role: admin.role || "admin",
    createdAt: new Date().toISOString()
  }), ttl);
  audit_(normalizedEmail, "adminLogin", "", {});
  return { email: normalizedEmail, role: admin.role || "admin", sessionToken: token, expiresIn: ttl, expiresAt };
}

function requireAdmin_(token) {
  if (!token) throw httpError_(401, "尚未登入管理後台。", "UNAUTHORIZED");
  const text = CacheService.getScriptCache().get(sessionKey_(token));
  if (!text) throw httpError_(401, "管理員登入已逾時，請重新登入。", "SESSION_EXPIRED");
  const session = JSON.parse(text);
  const admin = findAdminUser_(session.email);
  if (!admin || !truthy_(admin.enabled)) throw httpError_(401, "此管理員帳號已停用。", "UNAUTHORIZED");
  return { email: session.email, role: admin.role || session.role || "admin" };
}

function sessionKey_(token) {
  const secret = props_().ADMIN_SESSION_SECRET || "";
  return `ADMIN_SESSION_${sha256Hex_(`${secret}:${token}`)}`;
}

function passwordHash_(password, salt) {
  return sha256Hex_(`${salt}:${password}`);
}

function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text))
    .map((byte) => (`0${(byte & 0xff).toString(16)}`).slice(-2))
    .join("");
}

function loginFailureKey_(email) {
  return `ADMIN_LOGIN_FAILURE_${sha256Hex_(String(email || "").toLowerCase()).slice(0, 24)}`;
}

function isLoginLocked_(email) {
  const data = JSON.parse(CacheService.getScriptCache().get(loginFailureKey_(email)) || "{}");
  return Number(data.count || 0) >= 5;
}

function registerLoginFailure_(email) {
  const cache = CacheService.getScriptCache();
  const key = loginFailureKey_(email);
  const data = JSON.parse(cache.get(key) || "{}");
  cache.put(key, JSON.stringify({ count: Number(data.count || 0) + 1 }), 600);
}

function clearLoginFailures_(email) {
  CacheService.getScriptCache().remove(loginFailureKey_(email));
}

function invalidCredentials_() {
  return httpError_(401, "Email或密碼不正確", "INVALID_CREDENTIALS");
}

function existingCaseByRequestId_(requestId) {
  if (!requestId) return null;
  const direct = readObjects_(SHEETS.cases).find((item) => item.requestId === requestId && !item.deletedAt);
  if (direct) return expandCase_(direct);
  const match = readObjects_(SHEETS.auditLogs)
    .filter((item) => item.action === "createCase" && item.detailJson)
    .reverse()
    .find((item) => {
      try {
        return JSON.parse(item.detailJson || "{}").requestId === requestId;
      } catch (error) {
        return false;
      }
    });
  if (!match || !match.caseId) return null;
  const record = getCase_(match.caseId);
  return record && !record.deletedAt ? expandCase_(record) : null;
}

function createCase_(input, admin) {
  const now = new Date().toISOString();
  const requestId = String(input.requestId || "").trim();
  const existing = existingCaseByRequestId_(requestId);
  if (existing) return existing;
  if (!input.companyName || !input.workAddress) throw httpError_(400, "公司名稱與工作地點為必填。");
  const record = {
    caseId: input.caseId || generateCaseId_(input.companyName),
    requestId,
    status: CASE_STATUS.pending,
    createdAt: now,
    updatedAt: now,
    deletedAt: "",
    deletedBy: "",
    companyName: input.companyName || "",
    workAddress: input.workAddress || "",
    recruitmentCount: input.recruitmentCount ? Number(input.recruitmentCount) : "",
    contactName: input.contactName || "",
    contactPhone: input.contactPhone || "",
    extension: input.extension || "",
    recruitmentDate: input.recruitmentDate || "",
    industry: input.industry || "",
    publicPhone: input.publicPhone || "",
    agencyCompany: input.agencyCompany || "",
    formAccessToken: generateToken_(),
    noticeAccessToken: generateToken_(),
    latestSubmissionId: "",
    hasUnreadResponse: false,
    responseViewedAt: "",
    noticeViewed: false,
    firstViewedAt: "",
    lastViewedAt: "",
    viewCount: 0
  };
  appendObject_(SHEETS.cases, record);
  SpreadsheetApp.flush();
  const saved = getCase_(record.caseId);
  if (!saved
    || normalizeToken_(saved.formAccessToken) !== record.formAccessToken
    || normalizeToken_(saved.noticeAccessToken) !== record.noticeAccessToken) {
    throw httpError_(500, "案件建立後尚未可讀，請稍後重試。", "API_ERROR");
  }
  clearPublicFormCache_(record.caseId, record.formAccessToken);
  audit_(admin.email, "createCase", record.caseId, { companyName: record.companyName, requestId });
  return expandCase_(saved);
}

function createCaseResponse_(record) {
  return {
    caseId: record.caseId || "",
    requestId: record.requestId || "",
    token: record.formAccessToken || "",
    formAccessToken: record.formAccessToken || "",
    noticeAccessToken: record.noticeAccessToken || "",
    formUrl: "",
    status: record.status || CASE_STATUS.pending
  };
}

function listCases_(includeDeleted) {
  const submissionsByCase = groupSubmissionsByCase_(readObjects_(SHEETS.submissions));
  const currentNoticeFilesByCase = groupCurrentNoticeFilesByCase_(readObjects_(SHEETS.noticeFiles));
  return readObjects_(SHEETS.cases)
    .filter((item) => includeDeleted || !item.deletedAt)
    .map((record) => expandCase_(record, submissionsByCase[record.caseId] || [], currentNoticeFilesByCase[record.caseId] || null))
    .sort(sortCases_);
}

function getCaseForAdmin_(caseId) {
  const record = getCase_(caseId);
  if (!record) throw httpError_(404, "找不到此案件。", "CASE_NOT_FOUND");
  if (record.deletedAt) throw httpError_(404, "此案件已刪除。", "CASE_DELETED");
  return expandCase_(record);
}

function getPublicFormCase_(caseId, token) {
  if (!caseId || !token) throw httpError_(400, "連結不完整，缺少案件編號或驗證 token。", "MISSING_PARAMETERS");
  const cacheKey = publicFormCacheKey_(caseId, token);
  const cached = CacheService.getScriptCache().get(cacheKey);
  if (cached) return JSON.parse(cached);
  const record = getCase_(caseId);
  if (!record) throw httpError_(404, "找不到案件，請確認連結或聯絡承辦人員。", "CASE_NOT_FOUND");
  if (record.deletedAt) throw httpError_(404, "此案件已刪除。", "CASE_DELETED");
  if (normalizeToken_(record.formAccessToken) !== normalizeToken_(token)) throw httpError_(403, "連結已失效或驗證失敗。", "INVALID_TOKEN");
  if (![CASE_STATUS.pending, CASE_STATUS.revision_open, CASE_STATUS.submitted, CASE_STATUS.preparing_notice, CASE_STATUS.notice_ready].includes(record.status)) {
    throw httpError_(403, "此案件目前不可填寫。", "API_ERROR");
  }
  const data = publicFormPayload_(record);
  CacheService.getScriptCache().put(cacheKey, JSON.stringify(data), PUBLIC_FORM_CACHE_SECONDS);
  return data;
}

function updateCase_(caseId, input, admin) {
  const record = getCase_(caseId);
  if (!record || record.deletedAt) throw httpError_(404, "案件不存在。");
  const updated = Object.assign({}, record, {
    updatedAt: new Date().toISOString(),
    companyName: input.companyName || "",
    workAddress: input.workAddress || "",
    recruitmentCount: input.recruitmentCount ? Number(input.recruitmentCount) : "",
    contactName: input.contactName || "",
    contactPhone: input.contactPhone || "",
    extension: input.extension || "",
    recruitmentDate: input.recruitmentDate || "",
    industry: input.industry || "",
    publicPhone: input.publicPhone || "",
    agencyCompany: input.agencyCompany || ""
  });
  writeObject_(SHEETS.cases, "caseId", caseId, updated);
  clearPublicFormCache_(caseId, record.formAccessToken);
  clearPublicNoticeCache_(caseId, record.noticeAccessToken);
  audit_(admin.email, "updateCase", caseId, {});
  return expandCase_(updated);
}

function deleteCase_(caseId, admin) {
  const deleteRecord = getCase_(caseId);
  if (!deleteRecord || deleteRecord.deletedAt) throw httpError_(404, "案件不存在。");
  const deleteNow = new Date().toISOString();
  const noticeFilesForCase = readObjects_(SHEETS.noticeFiles).filter((file) => file.caseId === caseId);
  noticeFilesForCase.forEach((file) => {
    if (file.driveFileId) {
      try { DriveApp.getFileById(file.driveFileId).setTrashed(true); } catch (error) { console.error(error); }
    }
  });
  const deletedNoticeRows = deleteRowsByField_(SHEETS.noticeFiles, "caseId", caseId);
  const deletedSubmissionRows = deleteRowsByField_(SHEETS.submissions, "caseId", caseId);
  const deletedRecord = Object.assign({}, deleteRecord, {
    status: CASE_STATUS.deleted,
    deletedAt: deleteNow,
    deletedBy: admin.email,
    updatedAt: deleteNow,
    formAccessToken: "",
    noticeAccessToken: "",
    latestSubmissionId: "",
    hasUnreadResponse: false,
    responseViewedAt: "",
    noticeViewed: false,
    firstViewedAt: "",
    lastViewedAt: "",
    viewCount: 0
  });
  writeObject_(SHEETS.cases, "caseId", caseId, deletedRecord);
  clearPublicFormCache_(caseId, deleteRecord.formAccessToken);
  clearPublicNoticeCache_(caseId, deleteRecord.noticeAccessToken);
  audit_(admin.email, "deleteCase", caseId, {
    trashedDriveFiles: noticeFilesForCase.length,
    deletedNoticeRows,
    deletedSubmissionRows
  });
  return expandCase_(deletedRecord);
}

function bulkDeleteCases_(caseIds, admin) {
  if (!Array.isArray(caseIds)) throw httpError_(400, "案件編號格式錯誤。", "INVALID_CASE_IDS");
  const uniqueCaseIds = Array.from(new Set(caseIds.map((caseId) => String(caseId || "").trim()).filter(Boolean)));
  if (!uniqueCaseIds.length) return { requested: 0, succeeded: [], failed: [] };
  if (uniqueCaseIds.length > 100) throw httpError_(400, "單次最多刪除 100 筆案件。", "TOO_MANY_CASES");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw httpError_(503, "案件資料忙碌中，請稍後再試。", "LOCK_TIMEOUT");
  const succeeded = [];
  const failed = [];
  try {
    uniqueCaseIds.forEach((caseId) => {
      try {
        const deleted = deleteCase_(caseId, admin);
        succeeded.push({ caseId, status: deleted.status, deletedAt: deleted.deletedAt || "" });
      } catch (error) {
        const stored = getCase_(caseId);
        if (stored && stored.deletedAt) {
          succeeded.push({ caseId, status: CASE_STATUS.deleted, deletedAt: stored.deletedAt });
        } else {
          failed.push({
            caseId,
            code: error.code || "DELETE_FAILED",
            message: error.message || "刪除失敗"
          });
        }
      }
    });
    try {
      audit_(admin.email, "bulkDeleteCases", "", {
        requested: uniqueCaseIds.length,
        succeeded: succeeded.map((item) => item.caseId),
        failed: failed.map((item) => item.caseId)
      });
    } catch (auditError) {
      console.error(auditError);
    }
    return { requested: uniqueCaseIds.length, succeeded, failed };
  } finally {
    lock.releaseLock();
  }
}

function reopenRevision_(caseId, admin) {
  const record = getCase_(caseId);
  if (!record || record.deletedAt) throw httpError_(404, "案件不存在。");
  const updated = Object.assign({}, record, { status: CASE_STATUS.revision_open, updatedAt: new Date().toISOString() });
  writeObject_(SHEETS.cases, "caseId", caseId, updated);
  clearPublicFormCache_(caseId, record.formAccessToken);
  clearPublicNoticeCache_(caseId, record.noticeAccessToken);
  audit_(admin.email, "reopenRevision", caseId, {});
  return expandCase_(updated);
}

function submitResponse_(caseId, token, response, wasRevision) {
  const record = getCase_(caseId);
  if (!record || record.deletedAt) throw httpError_(404, "此案件已不存在或連結已失效。");
  if (!record || record.deletedAt || normalizeToken_(record.formAccessToken) !== normalizeToken_(token)) throw httpError_(404, "此填寫連結無效或案件不存在。");
  if (![CASE_STATUS.pending, CASE_STATUS.revision_open].includes(record.status)) throw httpError_(403, "此案件目前不可重複送出。");
  const now = new Date().toISOString();
  const submissionId = generateSubmissionId_();
  readObjects_(SHEETS.submissions).filter((item) => item.caseId === caseId && truthy_(item.isLatest)).forEach((item) => {
    writeObject_(SHEETS.submissions, "submissionId", item.submissionId, Object.assign({}, item, { isLatest: false, updatedAt: now }));
  });
  appendObject_(SHEETS.submissions, {
    submissionId,
    caseId,
    submittedAt: now,
    updatedAt: now,
    isLatest: true,
    responseJson: JSON.stringify(response || {})
  });
  const updated = Object.assign({}, record, {
    status: CASE_STATUS.submitted,
    updatedAt: now,
    latestSubmissionId: submissionId,
    hasUnreadResponse: true,
    responseViewedAt: ""
  });
  writeObject_(SHEETS.cases, "caseId", caseId, updated);
  clearPublicFormCache_(caseId, record.formAccessToken);
  clearPublicNoticeCache_(caseId, record.noticeAccessToken);
  return expandCase_(updated);
}

function markResponseViewed_(caseId, admin) {
  const record = getCase_(caseId);
  if (!record || record.deletedAt) throw httpError_(404, "案件不存在。");
  const updated = Object.assign({}, record, { hasUnreadResponse: false, responseViewedAt: new Date().toISOString() });
  writeObject_(SHEETS.cases, "caseId", caseId, updated);
  audit_(admin.email, "markResponseViewed", caseId, {});
  return expandCase_(updated);
}

function uploadNoticeFile_(caseId, fileData, options, admin) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const record = getCase_(caseId);
    if (!record || record.deletedAt) throw httpError_(404, "案件不存在。");
    if (!fileData || !fileData.dataUrl) throw httpError_(400, "缺少上傳檔案。");
    const stableNoticeToken = normalizeToken_(record.noticeAccessToken) || generateToken_();
    const now = new Date().toISOString();
    const currentFiles = readObjects_(SHEETS.noticeFiles).filter((item) => item.caseId === caseId && truthy_(item.isCurrent));
    currentFiles.forEach((item) => writeObject_(SHEETS.noticeFiles, "noticeFileId", item.noticeFileId, Object.assign({}, item, { isCurrent: false })));
    const drive = saveFileToDrive_(fileData, caseId, options.submissionId || record.latestSubmissionId || "");
    const noticeFile = {
      noticeFileId: Utilities.getUuid(),
      caseId,
      submissionId: options.submissionId || record.latestSubmissionId || "",
      fileName: fileData.name || "notice-file",
      fileType: fileData.type || "",
      fileSize: Number(fileData.size || 0),
      driveFileId: drive.driveFileId,
      fileUrl: "",
      uploadedAt: now,
      isCurrent: true
    };
    appendObject_(SHEETS.noticeFiles, noticeFile);
    const updated = Object.assign({}, record, {
      status: CASE_STATUS.notice_ready,
      updatedAt: now,
      noticeAccessToken: stableNoticeToken
    });
    writeObject_(SHEETS.cases, "caseId", caseId, updated);
    clearPublicNoticeCache_(caseId, stableNoticeToken);
    audit_(admin.email, "uploadNoticeFile", caseId, { fileName: noticeFile.fileName });
    return expandCase_(updated);
  } finally {
    lock.releaseLock();
  }
}

function deleteNoticeFile_(caseId, admin) {
  const record = getCase_(caseId);
  if (!record || record.deletedAt) throw httpError_(404, "案件不存在。");
  readObjects_(SHEETS.noticeFiles).filter((item) => item.caseId === caseId && truthy_(item.isCurrent)).forEach((item) => {
    if (item.driveFileId) {
      try { DriveApp.getFileById(item.driveFileId).setTrashed(true); } catch (error) { console.error(error); }
    }
    writeObject_(SHEETS.noticeFiles, "noticeFileId", item.noticeFileId, Object.assign({}, item, { isCurrent: false }));
  });
  const updated = Object.assign({}, record, { status: record.latestSubmissionId ? CASE_STATUS.submitted : CASE_STATUS.pending, updatedAt: new Date().toISOString() });
  writeObject_(SHEETS.cases, "caseId", caseId, updated);
  clearPublicNoticeCache_(caseId, record.noticeAccessToken);
  audit_(admin.email, "deleteNoticeFile", caseId, {});
  return expandCase_(updated);
}

function getPublicNotice_(caseId, token) {
  const record = getCase_(caseId);
  if (!record || record.deletedAt) throw httpError_(404, "此案件已不存在或連結已失效。", "CASE_NOT_FOUND");
  const normalizedToken = normalizeToken_(token);
  if (normalizeToken_(record.noticeAccessToken) !== normalizedToken || record.status !== CASE_STATUS.notice_ready) throw httpError_(403, "此通知連結無效或尚未開放。", "INVALID_TOKEN");
  const cacheKey = publicNoticeCacheKey_(caseId, normalizedToken);
  const cached = CacheService.getScriptCache().get(cacheKey);
  if (cached) return JSON.parse(cached);
  const file = currentNoticeFile_(caseId);
  const data = publicNoticePayload_(record, file, null);
  CacheService.getScriptCache().put(cacheKey, JSON.stringify(data), PUBLIC_NOTICE_CACHE_SECONDS);
  return data;
}

function getNoticeFile_(caseId, token, fileId, sessionToken) {
  if (sessionToken) {
    requireAdmin_(sessionToken);
    return getNoticeFileForAdmin_(caseId);
  }
  const record = getCase_(caseId);
  if (!record || record.deletedAt) throw httpError_(404, "此案件已不存在或連結已失效。", "CASE_NOT_FOUND");
  if (normalizeToken_(record.noticeAccessToken) !== normalizeToken_(token) || record.status !== CASE_STATUS.notice_ready) throw httpError_(403, "此通知連結無效或尚未開放。", "INVALID_TOKEN");
  const currentFiles = readObjects_(SHEETS.noticeFiles).filter((item) => item.caseId === caseId && truthy_(item.isCurrent));
  const requested = String(fileId || "").trim();
  const file = requested
    ? currentFiles.find((item) => String(item.noticeFileId || "") === requested || String(item.driveFileId || "") === requested)
    : currentFiles[0];
  if (!file || !file.driveFileId) throw httpError_(404, "找不到求才登記表。", "FILE_NOT_FOUND");
  const fileData = readDriveFileAsDataUrl_(file.driveFileId);
  return {
    noticeFile: {
      id: file.noticeFileId || "",
      noticeFileId: file.noticeFileId || "",
      driveFileId: file.driveFileId || "",
      submissionId: file.submissionId || "",
      fileName: file.fileName || (fileData ? fileData.fileName : "") || "",
      fileType: file.fileType || (fileData ? fileData.fileType : "") || "",
      mimeType: file.fileType || (fileData ? fileData.fileType : "") || "",
      fileSize: Number(file.fileSize || (fileData ? fileData.fileSize : 0) || 0),
      previewUrl: fileData.dataUrl,
      downloadUrl: ""
    }
  };
}

function getNoticeFileForAdmin_(caseId) {
  const file = currentNoticeFile_(caseId);
  if (!file) throw httpError_(404, "尚未上傳求才內容。");
  const data = readDriveFileAsDataUrl_(file.driveFileId);
  return Object.assign({}, file, data);
}

function publicNoticePayload_(record, file, fileData) {
  const latest = latestSubmissionForCase_(record.caseId, record.latestSubmissionId);
  const dataUrl = fileData ? fileData.dataUrl : "";
  const noticeFile = file ? {
    id: file.noticeFileId || "",
    noticeFileId: file.noticeFileId || "",
    driveFileId: file.driveFileId || "",
    submissionId: file.submissionId || "",
    fileName: file.fileName || (fileData ? fileData.fileName : "") || "",
    fileType: file.fileType || (fileData ? fileData.fileType : "") || "",
    mimeType: file.fileType || (fileData ? fileData.fileType : "") || "",
    fileSize: Number(file.fileSize || (fileData ? fileData.fileSize : 0) || 0),
    previewUrl: dataUrl,
    downloadUrl: dataUrl
  } : null;
  return {
    case: {
      caseId: record.caseId,
      status: record.status,
      companyName: record.companyName || "",
      workAddress: record.workAddress || "",
      contactName: record.contactName || "",
      contactPhone: record.contactPhone || "",
      extension: record.extension || "",
      recruitmentDate: record.recruitmentDate || "",
      industry: record.industry || "",
      recruitmentCount: record.recruitmentCount === "" ? null : Number(record.recruitmentCount),
      publicPhone: record.publicPhone || "",
      agencyCompany: record.agencyCompany || "",
      latestSubmissionId: latest ? latest.submissionId : record.latestSubmissionId || ""
    },
    noticeFile: noticeFile || {},
    noticeFiles: noticeFile ? [noticeFile] : [],
    latestSubmission: latest || null
  };
}

function recordNoticeView_(caseId, token) {
  const record = getCase_(caseId);
  if (!record || record.deletedAt || normalizeToken_(record.noticeAccessToken) !== normalizeToken_(token) || record.status !== CASE_STATUS.notice_ready) throw httpError_(404, "此通知連結無效或尚未開放。");
  const now = new Date().toISOString();
  const updated = Object.assign({}, record, {
    noticeViewed: true,
    firstViewedAt: record.firstViewedAt || now,
    lastViewedAt: now,
    viewCount: Number(record.viewCount || 0) + 1,
    updatedAt: now
  });
  writeObject_(SHEETS.cases, "caseId", caseId, updated);
  return { viewed: true, firstViewedAt: updated.firstViewedAt, lastViewedAt: updated.lastViewedAt, viewCount: Number(updated.viewCount || 0) };
}

function groupSubmissionsByCase_(rows) {
  return rows.reduce((groups, item) => {
    const caseId = item.caseId || "";
    if (!caseId) return groups;
    if (!groups[caseId]) groups[caseId] = [];
    groups[caseId].push(Object.assign({}, item, {
      response: safeJson_(item.responseJson),
      responseJson: safeJson_(item.responseJson),
      isLatest: truthy_(item.isLatest)
    }));
    return groups;
  }, {});
}

function groupCurrentNoticeFilesByCase_(rows) {
  return rows.reduce((groups, item) => {
    if (item.caseId && truthy_(item.isCurrent)) groups[item.caseId] = item;
    return groups;
  }, {});
}

function expandCase_(record, preloadedSubmissions, preloadedCurrentNoticeFile) {
  const submissions = Array.isArray(preloadedSubmissions)
    ? preloadedSubmissions
    : readObjects_(SHEETS.submissions)
      .filter((item) => item.caseId === record.caseId)
      .map((item) => Object.assign({}, item, { response: safeJson_(item.responseJson), responseJson: safeJson_(item.responseJson), isLatest: truthy_(item.isLatest) }));
  const linkedLatest = record.latestSubmissionId
    ? submissions.find((item) => item.submissionId === record.latestSubmissionId && item.caseId === record.caseId)
    : null;
  const responseStatus = [CASE_STATUS.submitted, CASE_STATUS.preparing_notice, CASE_STATUS.notice_ready, CASE_STATUS.revision_open].includes(record.status);
  const latest = linkedLatest || (responseStatus ? submissions.find((item) => item.isLatest && item.caseId === record.caseId) : null);
  const visibleSubmissions = latest || responseStatus ? submissions : [];
  const file = preloadedCurrentNoticeFile === undefined ? currentNoticeFile_(record.caseId) : preloadedCurrentNoticeFile;
  return Object.assign({}, record, {
    recruitmentCount: record.recruitmentCount === "" ? null : Number(record.recruitmentCount),
    hasUnreadResponse: latest ? truthy_(record.hasUnreadResponse) : false,
    noticeViewed: truthy_(record.noticeViewed),
    viewCount: Number(record.viewCount || 0),
    submissions: visibleSubmissions,
    response: latest ? latest.response : null,
    latestSubmissionId: latest ? latest.submissionId : "",
    submittedAt: latest ? latest.submittedAt || "" : "",
    latestResponseTime: latest ? latest.submittedAt || "" : "",
    noticeFileId: file ? file.noticeFileId : "",
    noticeFileName: file ? file.fileName : "",
    noticeFileType: file ? file.fileType : "",
    noticeFileSize: file ? Number(file.fileSize || 0) : 0,
    noticeFileUrl: file ? "remote-protected" : "",
    noticeSubmissionId: file ? file.submissionId : ""
  });
}

function publicFormPayload_(record) {
  const latest = record.status === CASE_STATUS.revision_open ? latestSubmissionForCase_(record.caseId, record.latestSubmissionId) : null;
  return {
    caseId: record.caseId,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    companyName: record.companyName || "",
    workAddress: record.workAddress || "",
    recruitmentCount: record.recruitmentCount === "" ? null : Number(record.recruitmentCount),
    contactName: record.contactName || "",
    contactPhone: record.contactPhone || "",
    extension: record.extension || "",
    recruitmentDate: record.recruitmentDate || "",
    industry: record.industry || "",
    publicPhone: record.publicPhone || "",
    agencyCompany: record.agencyCompany || "",
    latestSubmissionId: latest ? latest.submissionId : record.latestSubmissionId || "",
    submissions: latest ? [latest] : [],
    response: latest ? latest.response : null
  };
}

function latestSubmissionForCase_(caseId, latestSubmissionId) {
  const submissions = readObjects_(SHEETS.submissions)
    .filter((item) => item.caseId === caseId)
    .map((item) => Object.assign({}, item, {
      response: safeJson_(item.responseJson),
      responseJson: safeJson_(item.responseJson),
      isLatest: truthy_(item.isLatest)
    }));
  return submissions.find((item) => item.submissionId === latestSubmissionId) || submissions.find((item) => item.isLatest) || submissions[submissions.length - 1] || null;
}

function publicFormCacheKey_(caseId, token) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalizeToken_(token));
  const tokenHash = Utilities.base64EncodeWebSafe(digest).slice(0, 16);
  return `publicFormCase:${caseId}:${tokenHash}`;
}

function clearPublicFormCache_(caseId, token) {
  if (!caseId || !token) return;
  CacheService.getScriptCache().remove(publicFormCacheKey_(caseId, token));
}

function publicNoticeCacheKey_(caseId, token) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalizeToken_(token));
  const tokenHash = Utilities.base64EncodeWebSafe(digest).slice(0, 16);
  return `publicNotice:${caseId}:${tokenHash}`;
}

function clearPublicNoticeCache_(caseId, token) {
  if (!caseId || !token) return;
  CacheService.getScriptCache().remove(publicNoticeCacheKey_(caseId, token));
}

function saveFileToDrive_(fileData, caseId, submissionId) {
  const match = String(fileData.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw httpError_(400, "上傳檔案格式錯誤。");
  const mimeType = fileData.type || match[1];
  const bytes = Utilities.base64Decode(match[2]);
  const folder = DriveApp.getFolderById(props_().NOTICE_DRIVE_FOLDER_ID);
  const safeName = `${caseId}_${submissionId || "case"}_${fileData.name || "notice-file"}`;
  const file = folder.createFile(Utilities.newBlob(bytes, mimeType, safeName));
  return { driveFileId: file.getId() };
}

function driveHealthCheck_(admin) {
  const folder = DriveApp.getFolderById(props_().NOTICE_DRIVE_FOLDER_ID);
  const blob = Utilities.newBlob("drive-health-check", "text/plain", `health-check-${Date.now()}.txt`);
  const file = folder.createFile(blob);
  const result = {
    folderName: folder.getName(),
    createdFileName: file.getName(),
    createdFileSize: file.getSize()
  };
  file.setTrashed(true);
  audit_(admin.email, "driveHealthCheck", "", result);
  return result;
}

function readDriveFileAsDataUrl_(fileId) {
  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  return {
    dataUrl: `data:${blob.getContentType()};base64,${Utilities.base64Encode(blob.getBytes())}`,
    fileName: file.getName(),
    fileType: blob.getContentType(),
    fileSize: blob.getBytes().length
  };
}

function currentNoticeFile_(caseId) {
  return readObjects_(SHEETS.noticeFiles).find((item) => item.caseId === caseId && truthy_(item.isCurrent)) || null;
}

function getCase_(caseId) {
  return readObjects_(SHEETS.cases).find((item) => item.caseId === caseId) || null;
}

function findAdminUser_(email) {
  const normalized = String(email || "").toLowerCase();
  return readObjects_(SHEETS.adminUsers).find((item) => String(item.email || "").toLowerCase() === normalized) || null;
}

function upsertAdminUser_(email, role, enabled) {
  const existing = findAdminUser_(email);
  const record = { email: String(email).toLowerCase(), role, enabled, createdAt: existing ? existing.createdAt : new Date().toISOString() };
  if (existing) writeObject_(SHEETS.adminUsers, "email", existing.email, record);
  else appendObject_(SHEETS.adminUsers, record);
}

function ensureAllSheets_() {
  Object.keys(HEADERS).forEach((name) => ensureSheet_(name));
}

function sheet_(name) {
  return SpreadsheetApp.openById(props_().SPREADSHEET_ID).getSheetByName(name);
}

function ensureSheet_(name) {
  const ss = SpreadsheetApp.openById(props_().SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const expectedHeaders = HEADERS[name];
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const currentHeaders = current.some((value) => value !== "") ? current : [];
  if (!currentHeaders.length) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
  } else {
    const missing = expectedHeaders.filter((header) => !currentHeaders.includes(header));
    if (missing.length) sheet.getRange(1, currentHeaders.length + 1, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function readObjects_(sheetName) {
  const sheet = ensureSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift() || [];
  return values.filter((row) => row.some((value) => value !== "")).map((row) => {
    const item = {};
    headers.forEach((key, index) => item[key] = row[index]);
    return item;
  });
}

function appendObject_(sheetName, item) {
  const sheet = ensureSheet_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map((key) => serialize_(item[key])));
}

function writeObject_(sheetName, keyField, keyValue, item) {
  const sheet = ensureSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const keyIndex = headers.indexOf(keyField);
  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][keyIndex]) === String(keyValue)) {
      sheet.getRange(index + 1, 1, 1, headers.length).setValues([headers.map((key) => serialize_(item[key]))]);
      return;
    }
  }
  appendObject_(sheetName, item);
}

function deleteRowsByField_(sheetName, keyField, keyValue) {
  const sheet = ensureSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const keyIndex = headers.indexOf(keyField);
  if (keyIndex === -1) return 0;
  let deleted = 0;
  for (let index = values.length - 1; index >= 1; index -= 1) {
    if (String(values[index][keyIndex]) === String(keyValue)) {
      sheet.deleteRow(index + 1);
      deleted += 1;
    }
  }
  return deleted;
}

function audit_(adminEmail, action, caseId, detail) {
  appendObject_(SHEETS.auditLogs, {
    timestamp: new Date().toISOString(),
    adminEmail: adminEmail || "",
    action,
    caseId: caseId || "",
    detailJson: JSON.stringify(detail || {})
  });
}

function generateCaseId_(companyName) {
  const date = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyyMMdd");
  const prefix = String(companyName || "CASE").replace(/[^\w\u4e00-\u9fa5]/g, "").slice(0, 8) || "CASE";
  const count = readObjects_(SHEETS.cases).filter((item) => String(item.caseId || "").includes(date)).length + 1;
  return `${prefix}-${date}-${String(count).padStart(3, "0")}`;
}

function generateSubmissionId_() {
  return `SUB-${Utilities.formatDate(new Date(), "Asia/Taipei", "yyyyMMdd-HHmmss")}-${generateToken_().slice(0, 4).toUpperCase()}`;
}

function generateToken_() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}

function sortCases_(a, b) {
  const difference = caseCreatedSortValue_(b) - caseCreatedSortValue_(a);
  if (isFinite(difference) && difference !== 0) return difference;
  return String(b.caseId || "").localeCompare(String(a.caseId || ""), "zh-Hant", { numeric: true });
}

function caseCreatedSortValue_(item) {
  const createdAt = Date.parse(item.createdAt || "");
  if (!isNaN(createdAt)) return createdAt;
  const match = String(item.caseId || "").match(/(\d{4})(\d{2})(\d{2})(?:[-_]?([0-2]\d)([0-5]\d)([0-5]\d))?(?:-(\d+))?$/);
  if (!match) return Number.NEGATIVE_INFINITY;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const second = Number(match[6] || 0);
  const sequence = Number(match[7] || 0);
  return Date.UTC(year, month, day, hour, minute, second) + sequence;
}

function props_() {
  return PropertiesService.getScriptProperties().getProperties();
}

function truthy_(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function normalizeToken_(value) {
  return String(value || "").trim();
}

function safeJson_(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function serialize_(value) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function httpError_(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code || "";
  return error;
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
