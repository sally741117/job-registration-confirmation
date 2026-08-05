let currentCase = null;
let mergedSubmission = null;

const form = document.querySelector("#jobForm");
const formView = document.querySelector("#formView");
const missingView = document.querySelector("#missingView");
const missingTitle = document.querySelector("#missingTitle");
const missingText = document.querySelector("#missingText");
const completedView = document.querySelector("#completedView");
const successView = document.querySelector("#successView");
const summaryEl = document.querySelector("#summary");
const submitBtn = document.querySelector("#submitBtn");
const pdfTemplate = document.querySelector("#pdfTemplate");
const caseInfo = document.querySelector("#caseInfo");

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const selected = (name) => $(`[name="${name}"]:checked`)?.value || "";
const checkedValues = (name) => $$(`[name="${name}"]:checked`).map((input) => input.value);

function setVisible(el, visible) {
  el.classList.toggle("hidden", !visible);
}

function addError(target, message) {
  const anchor = target.closest("label, fieldset, .subpanel, .card") || target;
  target.classList?.add("field-error");
  const error = document.createElement("div");
  error.className = "error-text";
  error.textContent = message;
  anchor.appendChild(error);
}

function clearErrors() {
  $$(".error-text").forEach((el) => el.remove());
  $$(".field-error").forEach((el) => el.classList.remove("field-error"));
}

function wantsShift(type = selected("shiftType")) {
  return ["有輪班制度", "同時有輪班及部分工時"].includes(type);
}

function wantsPartTime(type = selected("shiftType")) {
  return ["有部分工時人員", "同時有輪班及部分工時"].includes(type);
}

function getStandardTime() {
  if (selected("standardTimeStatus") === "default") return { start: "08:00", end: "17:00", label: "08：00～17：00" };
  const start = form.standardStart.value;
  const end = form.standardEnd.value;
  return { start, end, label: `${helpers.displayTime(start)}～${helpers.displayTime(end)}` };
}

function createShiftTime(name) {
  const row = document.createElement("div");
  row.className = "time-row";
  row.dataset.shift = name;
  row.innerHTML = `<p class="row-title">${name}</p><label>開始時間 <b>必填</b><input type="time" name="shiftStart_${name}"></label><label>結束時間 <b>必填</b><input type="time" name="shiftEnd_${name}"></label>`;
  return row;
}

function syncShiftTimes() {
  const holder = $("#shiftTimes");
  const names = checkedValues("shiftName");
  $$("[data-shift]", holder).forEach((row) => {
    if (!names.includes(row.dataset.shift)) row.remove();
  });
  names.forEach((name) => {
    if (!$(`[data-shift="${name}"]`, holder)) holder.appendChild(createShiftTime(name));
  });
}

function createPartTimeRow(values = {}) {
  const row = document.createElement("div");
  row.className = "time-row part-row";
  row.innerHTML = `<label>開始時間 <b>必填</b><input type="time" name="partStart" value="${values.start || ""}"></label><label>結束時間 <b>必填</b><input type="time" name="partEnd" value="${values.end || ""}"></label><button type="button" class="danger remove-part">刪除</button>`;
  $(".remove-part", row).addEventListener("click", () => {
    if ($$(".part-row").length > 1) row.remove();
    updateSummary();
  });
  row.addEventListener("input", updateSummary);
  return row;
}

function ensurePartTimeRow() {
  const holder = $("#partTimeList");
  if (!holder.children.length) holder.appendChild(createPartTimeRow());
}

function setRadio(name, value) {
  const input = $(`[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function setCheckbox(name, value, checked = true) {
  const input = $(`[name="${name}"][value="${value}"]`);
  if (input) input.checked = checked;
}

function populateResponse(response) {
  if (!response) return;
  if (response.standardTime?.start === "08:00" && response.standardTime?.end === "17:00") {
    setRadio("standardTimeStatus", "default");
  } else {
    setRadio("standardTimeStatus", "custom");
    form.standardStart.value = response.standardTime?.start || "08:00";
    form.standardEnd.value = response.standardTime?.end || "17:00";
  }
  setRadio("shiftType", response.shiftType || "沒有輪班，僅固定日班");
  syncVisibility();
  (response.shifts || []).forEach((shift) => setCheckbox("shiftName", shift.name));
  syncShiftTimes();
  (response.shifts || []).forEach((shift) => {
    const start = $(`[name="shiftStart_${shift.name}"]`);
    const end = $(`[name="shiftEnd_${shift.name}"]`);
    if (start) start.value = shift.start || "";
    if (end) end.value = shift.end || "";
  });
  const rotationValues = ["二班制", "三班制", "四班二輪"];
  if (rotationValues.includes(response.rotationMethod)) {
    setRadio("rotationMethod", response.rotationMethod);
  } else if (response.rotationMethod) {
    setRadio("rotationMethod", "其他輪班方式");
    form.rotationOther.value = response.rotationMethod;
  }
  form.shiftNote.value = response.shiftNote || "";
  const partHolder = $("#partTimeList");
  partHolder.innerHTML = "";
  (response.partTimes?.length ? response.partTimes : [{}]).forEach((time) => partHolder.appendChild(createPartTimeRow(time)));
  setRadio("leaveType", response.leaveType || "週休二日");
  setRadio("weekendFixed", response.weekendFixed || "是");
  form.weekendNote.value = response.weekendNote || "";
  form.workDays.value = response.workDays || "";
  form.restDays.value = response.restDays || "";
  form.monthlyLeaveDays.value = response.monthlyLeaveDays || "";
  form.leaveOther.value = response.leaveOther || "";
  setRadio("lactationRoom", response.lactationRoom || "無");
  setRadio("childcare", response.childcare || "無");
  (response.childcareItems || []).forEach((item) => setCheckbox("childcareItems", item));
  form.childcareOther.value = response.childcareOther || "";
  form.finalConfirm.checked = false;
  syncVisibility();
}

function collectResponse() {
  const standardTime = getStandardTime();
  const shifts = $$("[data-shift]", $("#shiftTimes")).map((row) => ({
    name: row.dataset.shift,
    start: $(`[name="shiftStart_${row.dataset.shift}"]`, row).value,
    end: $(`[name="shiftEnd_${row.dataset.shift}"]`, row).value
  }));
  const partTimes = $$(".part-row").map((row) => ({
    start: $('[name="partStart"]', row).value,
    end: $('[name="partEnd"]', row).value
  }));
  return {
    standardTime,
    shiftType: selected("shiftType"),
    shifts,
    rotationMethod: selected("rotationMethod") === "其他輪班方式" ? form.rotationOther.value.trim() : selected("rotationMethod"),
    shiftNote: form.shiftNote.value.trim(),
    partTimes,
    leaveType: selected("leaveType"),
    weekendFixed: selected("weekendFixed"),
    weekendNote: form.weekendNote.value.trim(),
    workDays: form.workDays.value.trim(),
    restDays: form.restDays.value.trim(),
    monthlyLeaveDays: form.monthlyLeaveDays.value.trim(),
    leaveOther: form.leaveOther.value.trim(),
    lactationRoom: selected("lactationRoom"),
    childcare: selected("childcare"),
    childcareItems: checkedValues("childcareItems"),
    childcareOther: form.childcareOther.value.trim(),
    finalConfirm: form.finalConfirm.checked
  };
}

function renderCaseInfo(data) {
  caseInfo.innerHTML = `<div><strong>公司</strong><span>${data.companyName}</span></div><div><strong>工作地點</strong><span>${data.workAddress}</span></div>${helpers.hasRecruitmentCount(data) ? `<div><strong>本次求才人數</strong><span>${data.recruitmentCount}人</span></div>` : ""}`;
}

function updateSummary() {
  if (!currentCase) return;
  const data = { ...currentCase, ...collectResponse() };
  const rows = [
    ["公司", data.companyName],
    ["工作地點", data.workAddress],
    ...(helpers.hasRecruitmentCount(data) ? [["本次求才人數", `${data.recruitmentCount} 人`]] : []),
    ["工作時間", pdfService.workTimeText(data) || "尚未填寫"],
    ["班別及班別時間", data.shifts.length ? data.shifts.map((s) => `${s.name} ${helpers.displayTime(s.start)}～${helpers.displayTime(s.end)}`).join("；") : "無"],
    ["輪班方式", data.rotationMethod || data.shiftType],
    ["休假方式", pdfService.leaveText(data) || "尚未填寫"],
    ["哺乳或集乳室", data.lactationRoom],
    ["托兒服務", pdfService.childcareText(data)]
  ];
  summaryEl.innerHTML = rows.map(([key, value]) => `<div><strong>${key}</strong><span>${value}</span></div>`).join("");
}

function validate(data) {
  clearErrors();
  let valid = true;
  const fail = (target, message) => {
    valid = false;
    addError(target, message);
  };
  if (selected("standardTimeStatus") === "custom" && (!data.standardTime.start || !data.standardTime.end)) fail($("#customTime"), "請完整選擇一般工作時間。");
  if (wantsShift(data.shiftType)) {
    if (!data.shifts.length) fail($("#shiftBlock"), "有輪班時至少需選擇一個班別。");
    data.shifts.forEach((shift) => {
      const row = $(`[data-shift="${shift.name}"]`);
      if (!shift.start || !shift.end) fail(row, `${shift.name}需完整填寫開始及結束時間。`);
    });
    if (!selected("rotationMethod")) fail($("#shiftBlock"), "請選擇輪班方式。");
    if (selected("rotationMethod") === "其他輪班方式" && !data.rotationMethod) fail(form.rotationOther, "請填寫其他輪班方式。");
  }
  if (wantsPartTime(data.shiftType)) {
    data.partTimes.forEach((time, index) => {
      if (!time.start || !time.end) fail($$(".part-row")[index], `部分工時第 ${index + 1} 組需完整填寫。`);
    });
  }
  if (data.leaveType === "週休二日" && data.weekendFixed === "否" && !data.weekendNote) fail(form.weekendNote, "請填寫週休二日補充說明。");
  if (data.leaveType === "輪休") {
    if (!helpers.isPositiveInteger(data.workDays)) fail(form.workDays, "請填寫工作日數。");
    if (!helpers.isPositiveInteger(data.restDays)) fail(form.restDays, "請填寫休息日數。");
  }
  if (data.leaveType === "排休" && !helpers.isPositiveInteger(data.monthlyLeaveDays)) fail(form.monthlyLeaveDays, "請填寫每月休假日數。");
  if (data.leaveType === "其他" && !data.leaveOther) fail(form.leaveOther, "請填寫休假方式說明。");
  if (data.childcare === "有") {
    if (!data.childcareItems.length) fail($("#childcareOptions"), "請至少選擇一項托兒服務。");
    if (data.childcareItems.includes("其他") && !data.childcareOther) fail(form.childcareOther, "請填寫其他托兒服務說明。");
  }
  if (!data.finalConfirm) fail(form.finalConfirm, "送出前請勾選確認。");
  return valid;
}

function syncVisibility() {
  setVisible($("#customTime"), selected("standardTimeStatus") === "custom");
  setVisible($("#shiftBlock"), wantsShift());
  setVisible($("#partTimeBlock"), wantsPartTime());
  setVisible($("#rotationOtherWrap"), selected("rotationMethod") === "其他輪班方式");
  setVisible($("#weekendBlock"), selected("leaveType") === "週休二日");
  setVisible($("#weekendNoteWrap"), selected("weekendFixed") === "否");
  setVisible($("#rotationLeaveBlock"), selected("leaveType") === "輪休");
  setVisible($("#monthlyLeaveBlock"), selected("leaveType") === "排休");
  setVisible($("#otherLeaveBlock"), selected("leaveType") === "其他");
  setVisible($("#childcareOptions"), selected("childcare") === "有");
  setVisible($("#childcareOtherWrap"), checkedValues("childcareItems").includes("其他"));
  if (wantsPartTime()) ensurePartTimeRow();
  syncShiftTimes();
  updateSummary();
}

form.addEventListener("input", syncVisibility);
form.addEventListener("change", syncVisibility);
$("#addPartTime").addEventListener("click", () => {
  $("#partTimeList").appendChild(createPartTimeRow());
  updateSummary();
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = collectResponse();
  if (!validate(response)) {
    $(".error-text")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = "送出中，請稍候...";
  try {
    mergedSubmission = await submissionService.submitResponse(currentCase, response);
    currentCase = mergedSubmission;
    setVisible(formView, false);
    setVisible(successView, true);
  } catch (error) {
    addError(submitBtn, `送出失敗：${error.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "送出確認資料";
  }
});
async function boot() {
  const search = new URLSearchParams(window.location.search);
  const caseId = helpers.getCaseIdFromUrl();
  const token = search.get("token") || "";
  if (!caseId || (CONFIG.ACTIVE_STORAGE_MODE === "remote" && !token)) {
    missingTitle.textContent = "缺少案件編號";
    missingText.textContent = "請確認填寫連結是否完整，網址需包含 caseId。";
    setVisible(missingView, true);
    return;
  }
  currentCase = CONFIG.ACTIVE_STORAGE_MODE === "remote"
    ? await caseService.getPublicFormCase(caseId, token)
    : await caseService.getCase(caseId);
  if (CONFIG.ACTIVE_STORAGE_MODE === "remote" && currentCase) currentCase.formAccessToken = token;
  if (!currentCase) {
    missingTitle.textContent = "案件不存在";
    missingText.textContent = "查無此案件，請聯絡承辦仲介人員確認連結。";
    setVisible(missingView, true);
    return;
  }
  if ([CASE_STATUS.submitted, CASE_STATUS.preparing_notice, CASE_STATUS.notice_ready].includes(currentCase.status)) {
    mergedSubmission = submissionService.mergeCaseAndResponse(currentCase);
    setVisible(completedView, true);
    return;
  }
  ensurePartTimeRow();
  renderCaseInfo(currentCase);
  setVisible(formView, true);
  if (currentCase.status === CASE_STATUS.revision_open) {
    const latest = helpers.latestSubmission(currentCase);
    if (latest?.response) populateResponse(latest.response);
  }
  syncVisibility();
}

boot();
