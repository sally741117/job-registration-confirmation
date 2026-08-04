const SCRIPT_CONFIG = {
  ADMIN_URL: "",
  NOTICE_DRIVE_FOLDER_ID: ""
};

const CASE_SHEET_NAME = "案件資料";
const CASE_STATUS = {
  pending: "pending",
  submitted: "submitted",
  preparing_notice: "preparing_notice",
  notice_ready: "notice_ready",
  revision_open: "revision_open"
};

function doPost(e) {
  const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  const action = body.action;
  const payload = body.payload || {};

  if (action === "ping") return json_({ ok: true, service: "job-registration", time: new Date().toISOString() });
  if (action === "createCase") return json_(createCase_(normalizeNewCase_(payload)));
  if (action === "getCase") return json_(getCase_(payload.caseId));
  if (action === "listCases") return json_(listCases_());
  if (action === "updateCase") return json_(updateCase_(payload));
  if (action === "updateCaseDetails") return json_(updateCaseDetails_(payload.caseId, payload.input));
  if (action === "submitResponse") return json_(submitResponse_(payload.caseId, payload.response, payload.wasRevision, payload.submissionId));
  if (action === "setStatus") return json_(setStatus_(payload.caseId, payload.status));
  if (action === "markResponseViewed") return json_(markResponseViewed_(payload.caseId));
  if (action === "reopenForRevision") return json_(reopenForRevision_(payload.caseId));
  if (action === "savePdfInfo") return json_(savePdfInfo_(payload.caseId, payload.pdfInfo));
  if (action === "uploadNoticeFile") return json_(uploadNoticeFile_(payload.caseId, payload.fileData, payload.options || {}));
  if (action === "deleteNoticeFile") return json_(deleteNoticeFile_(payload.caseId));
  if (action === "validateNoticeAccess") return json_(validateNoticeAccess_(payload.caseId, payload.token));
  if (action === "recordNoticeView") return json_(recordNoticeView_(payload.caseId, payload.token));

  return json_({ error: "Unknown action" });
}

function createCase_(record) {
  const sheet = getSheet_();
  ensureHeaders_(sheet);
  sheet.appendRow(headers_().map((key) => stringify_(record[key])));
  return record;
}

function normalizeNewCase_(input) {
  const now = new Date().toISOString();
  return {
    caseId: input.caseId || generateCaseId_(input.companyName),
    status: CASE_STATUS.pending,
    createdAt: now,
    updatedAt: now,
    submittedAt: "",
    revisionOpenedAt: "",
    companyName: input.companyName || "",
    workAddress: input.workAddress || "",
    recruitmentCount: input.recruitmentCount ? Number(input.recruitmentCount) : null,
    contactName: input.contactName || "",
    contactPhone: input.contactPhone || "",
    extension: input.extension || "",
    recruitmentDate: input.recruitmentDate || "",
    industry: input.industry || "",
    salaryMin: Number(input.salaryMin || 0),
    salaryMax: Number(input.salaryMax || 0),
    publicPhone: input.publicPhone || "",
    agencyCompany: input.agencyCompany || "",
    submissionsJson: "[]",
    latestSubmissionId: "",
    responseJson: "",
    pdfFileName: "",
    pdfUrl: "",
    hasUnreadResponse: false,
    responseViewedAt: "",
    noticeAccessToken: generateAccessToken_(),
    noticeFileId: "",
    noticeFileName: "",
    noticeFileType: "",
    noticeFileUrl: "",
    noticeFileKey: "",
    noticeFileSize: 0,
    noticeUploadedAt: "",
    noticeSubmissionId: "",
    noticeUploadedBy: "",
    noticeUpload: "",
    noticeHistoryJson: "[]",
    noticeViewed: false,
    firstViewedAt: "",
    lastViewedAt: "",
    viewCount: 0
  };
}

function getCase_(caseId) {
  return listCases_().find((item) => item.caseId === caseId) || null;
}

function listCases_() {
  const sheet = getSheet_();
  ensureHeaders_(sheet);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.filter((row) => row.some(Boolean)).map((row) => rowToObject_(headers, row)).sort(sortCases_);
}

function sortCases_(a, b) {
  const rank = function(item) {
    if (item.hasUnreadResponse) return 0;
    if (latestSubmission_(item) && !item.noticeFileUrl) return 1;
    if (item.noticeFileUrl) return 2;
    return 3;
  };
  const rankDiff = rank(a) - rank(b);
  if (rankDiff) return rankDiff;
  return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
}

function updateCase_(record) {
  return writeCase_({
    ...record,
    updatedAt: new Date().toISOString()
  });
}

function updateCaseDetails_(caseId, input) {
  const record = getCase_(caseId);
  if (!record) throw new Error("Case not found");
  return writeCase_({
    ...record,
    updatedAt: new Date().toISOString(),
    companyName: input.companyName || "",
    workAddress: input.workAddress || "",
    recruitmentCount: input.recruitmentCount ? Number(input.recruitmentCount) : null,
    contactName: input.contactName || "",
    contactPhone: input.contactPhone || "",
    extension: input.extension || "",
    recruitmentDate: input.recruitmentDate || "",
    industry: input.industry || "",
    salaryMin: Number(input.salaryMin || 0),
    salaryMax: Number(input.salaryMax || 0),
    publicPhone: input.publicPhone || "",
    agencyCompany: input.agencyCompany || ""
  });
}

function submitResponse_(caseId, response, wasRevision) {
  const record = getCase_(caseId);
  if (!record) throw new Error("Case not found");
  const now = new Date().toISOString();
  const submissionId = arguments.length > 3 && arguments[3] ? arguments[3] : generateSubmissionId_();
  const submissions = (record.submissions || []).map((item) => Object.assign({}, item, { isLatest: false }));
  const submission = {
    caseId: caseId,
    submissionId: submissionId,
    submittedAt: now,
    response: response || {},
    responseJson: response || {},
    isLatest: true
  };
  const hasExistingNotice = Boolean(record.noticeFileUrl || record.noticeFileKey);
  const oldNotice = hasExistingNotice && wasRevision && record.noticeSubmissionId ? {
    caseId: caseId,
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
  const shouldBindUnboundNotice = hasExistingNotice && !record.noticeSubmissionId && !oldNotice;
  const boundNoticeUpload = shouldBindUnboundNotice && record.noticeUpload
    ? Object.assign({}, record.noticeUpload, { submissionId: submissionId })
    : record.noticeUpload;
  return writeCase_({
    ...record,
    status: shouldBindUnboundNotice ? CASE_STATUS.notice_ready : CASE_STATUS.submitted,
    updatedAt: now,
    submittedAt: now,
    submissionsJson: JSON.stringify(submissions.concat([submission])),
    latestSubmissionId: submissionId,
    responseJson: JSON.stringify(response || {}),
    hasUnreadResponse: true,
    responseViewedAt: "",
    noticeHistoryJson: JSON.stringify(oldNotice ? (record.noticeHistory || []).concat([oldNotice]) : (record.noticeHistory || [])),
    noticeFileId: oldNotice ? "" : record.noticeFileId,
    noticeFileName: oldNotice ? "" : record.noticeFileName,
    noticeFileType: oldNotice ? "" : record.noticeFileType,
    noticeFileUrl: oldNotice ? "" : record.noticeFileUrl,
    noticeFileKey: oldNotice ? "" : record.noticeFileKey,
    noticeFileSize: oldNotice ? 0 : record.noticeFileSize,
    noticeUploadedAt: oldNotice ? "" : record.noticeUploadedAt,
    noticeSubmissionId: oldNotice ? "" : (shouldBindUnboundNotice ? submissionId : record.noticeSubmissionId),
    noticeUploadedBy: oldNotice ? "" : record.noticeUploadedBy,
    noticeUpload: oldNotice ? "" : (boundNoticeUpload ? JSON.stringify(boundNoticeUpload) : ""),
    noticeViewed: oldNotice ? false : record.noticeViewed,
    firstViewedAt: oldNotice ? "" : record.firstViewedAt,
    lastViewedAt: oldNotice ? "" : record.lastViewedAt,
    viewCount: oldNotice ? 0 : record.viewCount
  });
}

function setStatus_(caseId, status) {
  const record = getCase_(caseId);
  if (!record) throw new Error("Case not found");
  return writeCase_({
    ...record,
    status,
    updatedAt: new Date().toISOString()
  });
}

function markResponseViewed_(caseId) {
  const record = getCase_(caseId);
  if (!record) throw new Error("Case not found");
  if (!record.hasUnreadResponse) return record;
  return writeCase_({
    ...record,
    hasUnreadResponse: false,
    responseViewedAt: new Date().toISOString()
  });
}

function reopenForRevision_(caseId) {
  const record = getCase_(caseId);
  if (!record) throw new Error("Case not found");
  const now = new Date().toISOString();
  return writeCase_({
    ...record,
    status: CASE_STATUS.revision_open,
    updatedAt: now,
    revisionOpenedAt: now
  });
}

function savePdfInfo_(caseId, pdfInfo) {
  const record = getCase_(caseId);
  if (!record) throw new Error("Case not found");
  return writeCase_({
    ...record,
    updatedAt: new Date().toISOString(),
    pdfFileName: pdfInfo.pdfFileName || "",
    pdfUrl: pdfInfo.pdfUrl || ""
  });
}

function uploadNoticeFile_(caseId, fileData, options) {
  const record = getCase_(caseId);
  if (!record) throw new Error("Case not found");
  if (options.expectedCaseId && options.expectedCaseId !== caseId) throw new Error("目前案件已切換，請重新選擇檔案");
  const latest = latestSubmission_(record);
  const submissionId = options.submissionId || (latest && latest.submissionId) || "";
  if (options.submissionId && latest && latest.submissionId && submissionId !== latest.submissionId) throw new Error("回覆版本已變更，請重新選擇檔案。");
  const now = new Date().toISOString();
  const driveFile = saveNoticeFileToDrive_(fileData, caseId, submissionId);
  const oldNotice = record.noticeFileUrl ? {
    caseId: record.caseId,
    submissionId: record.noticeSubmissionId || record.latestSubmissionId || "",
    noticeFileId: record.noticeFileId,
    noticeFileName: record.noticeFileName,
    noticeFileType: record.noticeFileType,
    noticeFileUrl: record.noticeFileUrl,
    noticeUploadedAt: record.noticeUploadedAt,
    noticeUploadedBy: record.noticeUploadedBy || "",
    versionStatus: "舊版"
  } : null;
  return writeCase_({
    ...record,
    status: submissionId ? "notice_ready" : record.status,
    updatedAt: now,
    noticeFileId: driveFile.fileId,
    noticeFileName: fileData.name || "",
    noticeFileType: fileData.type || "",
    noticeFileUrl: driveFile.url,
    noticeUploadedAt: now,
    noticeSubmissionId: submissionId,
    noticeUploadedBy: options.uploadedBy || "仲介端",
    noticeFileSize: Number(fileData.size || 0),
    noticeUpload: JSON.stringify({
      caseId: caseId,
      submissionId: submissionId,
      fileKey: driveFile.fileId,
      fileName: fileData.name || "",
      fileType: fileData.type || "",
      fileSize: Number(fileData.size || 0),
      uploadedAt: now
    }),
    noticeHistoryJson: JSON.stringify(oldNotice ? (record.noticeHistory || []).concat([oldNotice]) : (record.noticeHistory || [])),
    noticeAccessToken: record.noticeAccessToken || generateAccessToken_()
  });
}

function saveNoticeFileToDrive_(fileData, caseId, submissionId) {
  if (fileData.fileId && fileData.url) return { fileId: fileData.fileId, url: fileData.url };
  if (!fileData.dataUrl) throw new Error("缺少上傳檔案內容，無法存入 Google Drive");
  const match = String(fileData.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("上傳檔案格式錯誤，Apps Script 無法解析 dataUrl");
  const mimeType = fileData.type || match[1];
  const bytes = Utilities.base64Decode(match[2]);
  const safeName = `${caseId}_${submissionId || "case"}_${fileData.name || "notice-file"}`;
  const blob = Utilities.newBlob(bytes, mimeType, safeName);
  const folder = SCRIPT_CONFIG.NOTICE_DRIVE_FOLDER_ID
    ? DriveApp.getFolderById(SCRIPT_CONFIG.NOTICE_DRIVE_FOLDER_ID)
    : DriveApp.getRootFolder();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    fileId: file.getId(),
    url: `https://drive.google.com/uc?export=download&id=${file.getId()}`
  };
}

function deleteNoticeFile_(caseId) {
  const record = getCase_(caseId);
  if (!record) throw new Error("Case not found");
  return writeCase_({
    ...record,
    status: record.response ? CASE_STATUS.submitted : CASE_STATUS.pending,
    updatedAt: new Date().toISOString(),
    noticeFileId: "",
    noticeFileName: "",
    noticeFileType: "",
    noticeFileUrl: "",
    noticeUploadedAt: "",
    noticeSubmissionId: "",
    noticeUploadedBy: ""
  });
}

function validateNoticeAccess_(caseId, token) {
  const record = getCase_(caseId);
  if (!record || record.noticeAccessToken !== token || record.status !== "notice_ready" || !record.noticeFileUrl) return null;
  return record;
}

function recordNoticeView_(caseId, token) {
  const record = validateNoticeAccess_(caseId, token);
  if (!record) return null;
  const now = new Date().toISOString();
  return writeCase_({
    ...record,
    noticeViewed: true,
    firstViewedAt: record.firstViewedAt || now,
    lastViewedAt: now,
    viewCount: Number(record.viewCount || 0) + 1,
    updatedAt: now
  });
}

function writeCase_(record) {
  const sheet = getSheet_();
  ensureHeaders_(sheet);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const caseIdIndex = headers.indexOf("caseId");
  for (let i = 1; i < values.length; i += 1) {
    if (values[i][caseIdIndex] === record.caseId) {
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([headers.map((key) => stringify_(record[key]))]);
      return normalizeOutput_(record);
    }
  }
  sheet.appendRow(headers.map((key) => stringify_(record[key])));
  return normalizeOutput_(record);
}

function leaveText_(data) {
  if (data.leaveType === "週休二日") return data.weekendFixed === "是" ? "週休二日，固定休星期六、星期日" : `週休二日，${data.weekendNote || ""}`;
  if (data.leaveType === "輪休") return `做${data.workDays}日休${data.restDays}日`;
  if (data.leaveType === "排休") return `排休，每月休假${data.monthlyLeaveDays}日`;
  return data.leaveOther || "";
}

function childcareText_(data) {
  if (data.childcare === "無") return "無";
  return (data.childcareItems || []).map((item) => item === "其他" ? `其他：${data.childcareOther}` : item).join("、") || "有";
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(CASE_SHEET_NAME) || spreadsheet.insertSheet(CASE_SHEET_NAME);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) sheet.appendRow(headers_());
}

function headers_() {
  return [
    "caseId",
    "status",
    "createdAt",
    "updatedAt",
    "submittedAt",
    "revisionOpenedAt",
    "companyName",
    "workAddress",
    "recruitmentCount",
    "contactName",
    "contactPhone",
    "extension",
    "recruitmentDate",
    "industry",
    "salaryMin",
    "salaryMax",
    "publicPhone",
    "agencyCompany",
    "submissionsJson",
    "latestSubmissionId",
    "responseJson",
    "pdfFileName",
    "pdfUrl",
    "hasUnreadResponse",
    "responseViewedAt",
    "noticeAccessToken",
    "noticeFileId",
    "noticeFileName",
    "noticeFileType",
    "noticeFileUrl",
    "noticeFileKey",
    "noticeFileSize",
    "noticeUploadedAt",
    "noticeSubmissionId",
    "noticeUploadedBy",
    "noticeUpload",
    "noticeHistoryJson",
    "noticeViewed",
    "firstViewedAt",
    "lastViewedAt",
    "viewCount"
  ];
}

function rowToObject_(headers, row) {
  const object = {};
  headers.forEach((key, index) => object[key] = row[index]);
  if (object.responseJson) object.response = JSON.parse(object.responseJson);
  object.submissions = object.submissionsJson ? JSON.parse(object.submissionsJson) : [];
  object.noticeHistory = object.noticeHistoryJson ? JSON.parse(object.noticeHistoryJson) : [];
  object.noticeUpload = object.noticeUpload ? JSON.parse(object.noticeUpload) : null;
  return normalizeOutput_(object);
}

function normalizeOutput_(record) {
  return {
    ...record,
    recruitmentCount: record.recruitmentCount === "" || record.recruitmentCount === null || record.recruitmentCount === undefined ? null : Number(record.recruitmentCount),
    salaryMin: Number(record.salaryMin || 0),
    salaryMax: Number(record.salaryMax || 0),
    hasUnreadResponse: record.hasUnreadResponse === true || record.hasUnreadResponse === "true",
    noticeViewed: record.noticeViewed === true || record.noticeViewed === "true",
    viewCount: Number(record.viewCount || 0),
    noticeFileSize: Number(record.noticeFileSize || 0),
    submissions: record.submissions || [],
    noticeHistory: record.noticeHistory || []
  };
}

function stringify_(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return value;
}

function generateCaseId_(companyName) {
  const prefix = String(companyName || "CASE").replace(/[^\w\u4e00-\u9fff]/g, "").slice(0, 4).toUpperCase() || "CASE";
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const serial = String(listCases_().filter((item) => String(item.caseId).indexOf(`-${date}-`) > -1).length + 1).padStart(3, "0");
  return `${prefix}-${date}-${serial}`;
}

function generateSubmissionId_() {
  const now = new Date();
  const date = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd");
  const time = Utilities.formatDate(now, Session.getScriptTimeZone(), "HHmmss");
  const random = Math.random().toString(16).slice(2, 6).toUpperCase().padEnd(4, "0");
  return `SUB-${date}-${time}-${random}`;
}

function generateAccessToken_() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}

function latestSubmission_(record) {
  const submissions = record.submissions || [];
  for (let i = 0; i < submissions.length; i += 1) {
    if (submissions[i].submissionId === record.latestSubmissionId) return submissions[i];
  }
  return submissions.length ? submissions[submissions.length - 1] : null;
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
