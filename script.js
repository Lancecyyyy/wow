/* =========================================================
   CONFIG
   ========================================================= */
// Your deployed Google Apps Script Web App URL.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzd4sK7S5L7kSpEN0ktrdZsgmvC1ZdsaZ9koYeps4rgbGGu9dPWpXHMBUPq16E-h9Da/exec";

/* =========================================================
   DOM REFERENCES
   ========================================================= */
const form            = document.getElementById("billingForm");
const nameInput        = document.getElementById("customerName");
const consumptionInput = document.getElementById("consumption");
const typeSelect       = document.getElementById("customerType");
const generateBtn      = document.getElementById("generateBtn");

const errName        = document.getElementById("errName");
const errConsumption = document.getElementById("errConsumption");

const readoutValue = document.getElementById("readoutValue");
const readoutRate  = document.getElementById("readoutRate");
const tierFill     = document.getElementById("tierFill");
const tierMarker   = document.getElementById("tierMarker");

const odometerEl   = document.getElementById("odometer");

const receiptEmpty  = document.getElementById("receiptEmpty");
const receiptOutput = document.getElementById("receiptOutput");
const receiptFoot   = document.getElementById("receiptFoot");
const statusDot     = document.getElementById("statusDot");
const statusText    = document.getElementById("statusText");
const clockEl       = document.getElementById("clock");
const copyBtn       = document.getElementById("copyBtn");
const printBtn      = document.getElementById("printBtn");

/* =========================================================
   STATE
   ========================================================= */
let transactionsProcessed = 0;

/* =========================================================
   TIER / RATE LOOKUP  (conditional structure: if / else if)
   ========================================================= */
function getRatePerCubicMeter(consumption) {
  if (consumption <= 20) {
    return 25.00;
  } else if (consumption <= 40) {
    return 35.00;
  } else if (consumption <= 60) {
    return 45.00;
  } else {
    return 60.00;
  }
}

/* =========================================================
   DISCOUNT LOOKUP  (conditional structure: switch)
   ========================================================= */
function getDiscountRate(customerType) {
  switch (customerType) {
    case "senior":
      return 0.25;
    case "solo":
      return 0.15;
    case "regular":
    default:
      return 0;
  }
}

function getCustomerTypeLabel(customerType) {
  switch (customerType) {
    case "senior": return "Senior Citizen";
    case "solo":   return "Solo Parent";
    default:       return "Regular";
  }
}

/* =========================================================
   LIVE TIER METER  — updates as the consumption field changes
   ========================================================= */
function consumptionToPercent(c) {
  // Each of the 4 tiers occupies an equal 25% slice of the track.
  // Values above 60 are visually capped once they pass 100 m3,
  // but the real number is still shown in the readout.
  if (c <= 0)  return 0;
  if (c <= 20) return (c / 20) * 25;
  if (c <= 40) return 25 + ((c - 20) / 20) * 25;
  if (c <= 60) return 50 + ((c - 40) / 20) * 25;
  const overflow = Math.min((c - 60) / 40, 1); // caps visual fill at c = 100
  return 75 + overflow * 25;
}

function updateTierMeter() {
  const raw = consumptionInput.value.trim();
  const consumption = raw === "" ? 0 : parseFloat(raw);
  const safeConsumption = isNaN(consumption) || consumption < 0 ? 0 : consumption;

  const percent = consumptionToPercent(safeConsumption);
  tierFill.style.width = percent + "%";
  tierMarker.style.left = percent + "%";

  readoutValue.textContent = raw === "" ? "0" : safeConsumption;

  const isOver = safeConsumption > 60;
  readoutValue.classList.toggle("is-over", isOver);

  if (raw === "" || safeConsumption === 0) {
    readoutRate.textContent = "Awaiting reading";
    readoutRate.classList.remove("is-over");
  } else {
    const rate = getRatePerCubicMeter(safeConsumption);
    readoutRate.textContent = "₱" + rate.toFixed(2) + " / m³";
    readoutRate.classList.toggle("is-over", isOver);
  }
}

consumptionInput.addEventListener("input", updateTierMeter);

/* =========================================================
   ODOMETER (mechanical digit-reel counter)
   ========================================================= */
const ODOMETER_DIGITS = 3;

function buildOdometer() {
  odometerEl.innerHTML = ""; // DOM access: clear existing content

  // Loop: build one reel per digit position
  for (let i = 0; i < ODOMETER_DIGITS; i++) {
    const digitBox = document.createElement("div");
    digitBox.className = "odometer__digit";

    const strip = document.createElement("div");
    strip.className = "odometer__strip";

    // Loop: fill each reel with digits 0-9
    for (let n = 0; n <= 9; n++) {
      const span = document.createElement("span");
      span.textContent = n;
      strip.appendChild(span);
    }

    digitBox.appendChild(strip);
    odometerEl.appendChild(digitBox);
  }
  setOdometerValue(0);
}

function setOdometerValue(value) {
  const padded = String(value).padStart(ODOMETER_DIGITS, "0").slice(-ODOMETER_DIGITS);
  const strips = odometerEl.querySelectorAll(".odometer__strip");

  // Loop: move each reel strip to the matching digit
  for (let i = 0; i < strips.length; i++) {
    const digit = parseInt(padded[i], 10);
    strips[i].style.transform = `translateY(${-digit * 30}px)`;
  }
  odometerEl.setAttribute("aria-label", `${value} transactions processed`);
}

buildOdometer();

/* =========================================================
   VALIDATION
   ========================================================= */
function clearErrors() {
  errName.textContent = "";
  errConsumption.textContent = "";
  nameInput.classList.remove("has-error");
  consumptionInput.classList.remove("has-error");
}

function validateForm(name, consumptionRaw) {
  let isValid = true;

  if (name === "") {
    errName.textContent = "Enter the customer's name to continue.";
    nameInput.classList.add("has-error");
    isValid = false;
  }

  const consumption = parseFloat(consumptionRaw);
  if (consumptionRaw === "" || isNaN(consumption) || consumption <= 0) {
    errConsumption.textContent = "Enter a valid consumption reading greater than 0.";
    consumptionInput.classList.add("has-error");
    isValid = false;
  }

  return isValid;
}

/* =========================================================
   RECEIPT BUILDING + PRINT-IN ANIMATION
   ========================================================= */
function peso(n) {
  return "₱" + n.toFixed(2);
}

function buildReceiptLines(data) {
  const { name, type, consumption, rate, amount, discount, total } = data;

  // Array + loop is used below to reveal these lines one at a time.
  return [
    { text: "================================", cls: "rule" },
    { text: "        WATER BILLING",           cls: "" },
    { text: "================================", cls: "rule" },
    { text: "",                                 cls: "" },
    { text: `Customer Name : ${name}`,          cls: "" },
    { text: `Customer Type : ${type}`,           cls: "" },
    { text: `Water Usage   : ${consumption} cu.m`, cls: "" },
    { text: `Rate          : ${peso(rate)} / cu.m`, cls: "" },
    { text: "--------------------------------", cls: "rule" },
    { text: `Amount        : ${peso(amount)}`,    cls: "" },
    { text: `Discount      : ${peso(discount)}`,  cls: "discount" },
    { text: "--------------------------------", cls: "rule" },
    { text: `TOTAL BILL    : ${peso(total)}`,     cls: "total" },
    { text: "================================", cls: "rule" },
  ];
}

function renderReceipt(lines) {
  receiptEmpty.hidden = true;
  receiptOutput.hidden = false;
  receiptOutput.innerHTML = "";
  receiptFoot.hidden = false;

  // Loop: append each line with a staggered delay for a "printing" effect
  lines.forEach((line, index) => {
    const el = document.createElement("span");
    el.textContent = line.text;
    el.className = "line" + (line.cls ? " " + line.cls : "");
    el.style.animationDelay = (index * 55) + "ms";
    receiptOutput.appendChild(el);
  });
}

/* =========================================================
   GOOGLE SHEETS RECORDING (Google Apps Script Web App)
   ========================================================= */
function setStatus(state, message) {
  statusDot.className = "status-dot " + state;
  statusText.textContent = message;
}

function recordToGoogleSheet(payload) {
  setStatus("pending", "Sending to Google Sheet…");

  // Plain text body keeps this a "simple request" (no CORS preflight),
  // and — unlike mode:"no-cors" — we can actually read the JSON that
  // comes back, so real failures show up instead of a blind "success".
  fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  })
    .then((res) => res.json())
    .then((result) => {
      if (result && result.result === "success") {
        setStatus("ok", "Saved to Google Sheet ✓");
      } else {
        setStatus("fail", "Sheet script returned an error — check the Apps Script logs.");
      }
    })
    .catch(() => {
      setStatus("fail", "Could not reach Google Sheet — statement still generated locally.");
    });
}

/*
  ============================================================
  MATCHING GOOGLE APPS SCRIPT — paste into Extensions > Apps
  Script on the spreadsheet, replacing whatever is there now.
  Column order matches the "Water" sheet tab exactly:
  Timestamp | Customer Name | Water Consumption | Customer Type
  | Rate per cu.m | Gross Amount | Discount | Net Total Bill
  ============================================================

  function doPost(e) {
    try {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Water");
      var data = JSON.parse(e.postData.contents);

      sheet.appendRow([
        data.timestamp,
        data.name,
        data.consumption,
        data.customerType,
        data.rate,
        data.grossAmount,
        data.discount,
        data.netTotal
      ]);

      return ContentService.createTextOutput(JSON.stringify({ result: "success" }))
        .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ result: "error", message: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  After pasting: Deploy > Manage deployments > pencil (edit) icon >
  New version > Deploy. Editing the code alone does NOT push changes
  to the live /exec URL — you must deploy a new version each time.
*/

/* =========================================================
   FORM SUBMIT
   ========================================================= */
form.addEventListener("submit", function (event) {
  event.preventDefault();
  clearErrors();

  const name            = nameInput.value.trim();
  const consumptionRaw  = consumptionInput.value.trim();
  const customerTypeKey = typeSelect.value;

  if (!validateForm(name, consumptionRaw)) {
    return;
  }

  const consumption = parseFloat(consumptionRaw);
  const rate        = getRatePerCubicMeter(consumption);
  const discountPct = getDiscountRate(customerTypeKey);

  const amount   = consumption * rate;
  const discount = amount * discountPct;
  const total    = amount - discount;

  const receiptData = {
    name,
    type: getCustomerTypeLabel(customerTypeKey),
    consumption,
    rate,
    amount,
    discount,
    total,
  };

  renderReceipt(buildReceiptLines(receiptData));

  // Increment + animate the transaction counter (DOM: odometer reel)
  transactionsProcessed++;
  setOdometerValue(transactionsProcessed);

  recordToGoogleSheet({
    timestamp: new Date().toLocaleString("en-PH"),
    name,
    consumption,
    customerType: receiptData.type,
    rate,
    grossAmount: amount,
    discount,
    netTotal: total,
  });
});

/* =========================================================
   HEADER CLOCK
   ========================================================= */
function tickClock() {
  clockEl.textContent = new Date().toLocaleTimeString("en-PH", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
tickClock();
setInterval(tickClock, 1000);

/* =========================================================
   RECEIPT ACTIONS — copy to clipboard / print
   ========================================================= */
copyBtn.addEventListener("click", function () {
  const text = receiptOutput.textContent;
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = "Copied";
    copyBtn.classList.add("is-done");
    setTimeout(() => {
      copyBtn.textContent = "Copy";
      copyBtn.classList.remove("is-done");
    }, 1600);
  });
});

printBtn.addEventListener("click", function () {
  window.print();
});

/* Initialize the tier meter on load */
updateTierMeter();

/* =========================================================
   CONFIG
   ========================================================= */
// Your deployed Google Apps Script Web App URL.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzd4sK7S5L7kSpEN0ktrdZsgmvC1ZdsaZ9koYeps4rgbGGu9dPWpXHMBUPq16E-h9Da/exec";

/* =========================================================
   DOM REFERENCES
   ========================================================= */
const form            = document.getElementById("billingForm");
const nameInput        = document.getElementById("customerName");
const consumptionInput = document.getElementById("consumption");
const typeSelect       = document.getElementById("customerType");
const generateBtn      = document.getElementById("generateBtn");

const errName        = document.getElementById("errName");
const errConsumption = document.getElementById("errConsumption");

const readoutValue = document.getElementById("readoutValue");
const readoutRate  = document.getElementById("readoutRate");
const tierFill     = document.getElementById("tierFill");
const tierMarker   = document.getElementById("tierMarker");

const odometerEl   = document.getElementById("odometer");

const receiptEmpty  = document.getElementById("receiptEmpty");
const receiptOutput = document.getElementById("receiptOutput");
const receiptStub   = document.getElementById("receiptStub");
const billRefEl     = document.getElementById("billRef");
const receiptFoot   = document.getElementById("receiptFoot");
const statusDot     = document.getElementById("statusDot");
const statusText    = document.getElementById("statusText");
const clockEl       = document.getElementById("clock");
const copyBtn       = document.getElementById("copyBtn");
const printBtn      = document.getElementById("printBtn");

/* =========================================================
   STATE
   ========================================================= */
let transactionsProcessed = 0;

/* =========================================================
   TIER / RATE LOOKUP  (conditional structure: if / else if)
   ========================================================= */
function getRatePerCubicMeter(consumption) {
  if (consumption <= 20) {
    return 25.00;
  } else if (consumption <= 40) {
    return 35.00;
  } else if (consumption <= 60) {
    return 45.00;
  } else {
    return 60.00;
  }
}

/* =========================================================
   DISCOUNT LOOKUP  (conditional structure: switch)
   ========================================================= */
function getDiscountRate(customerType) {
  switch (customerType) {
    case "senior":
      return 0.25;
    case "solo":
      return 0.15;
    case "regular":
    default:
      return 0;
  }
}

function getCustomerTypeLabel(customerType) {
  switch (customerType) {
    case "senior": return "Senior Citizen";
    case "solo":   return "Solo Parent";
    default:       return "Regular";
  }
}

/* =========================================================
   LIVE TIER METER  — updates as the consumption field changes
   ========================================================= */
function consumptionToPercent(c) {
  // Each of the 4 tiers occupies an equal 25% slice of the track.
  // Values above 60 are visually capped once they pass 100 m3,
  // but the real number is still shown in the readout.
  if (c <= 0)  return 0;
  if (c <= 20) return (c / 20) * 25;
  if (c <= 40) return 25 + ((c - 20) / 20) * 25;
  if (c <= 60) return 50 + ((c - 40) / 20) * 25;
  const overflow = Math.min((c - 60) / 40, 1); // caps visual fill at c = 100
  return 75 + overflow * 25;
}

function updateTierMeter() {
  const raw = consumptionInput.value.trim();
  const consumption = raw === "" ? 0 : parseFloat(raw);
  const safeConsumption = isNaN(consumption) || consumption < 0 ? 0 : consumption;

  const percent = consumptionToPercent(safeConsumption);
  tierFill.style.width = percent + "%";
  tierMarker.style.left = percent + "%";

  readoutValue.textContent = raw === "" ? "0" : safeConsumption;

  const isOver = safeConsumption > 60;
  readoutValue.classList.toggle("is-over", isOver);

  if (raw === "" || safeConsumption === 0) {
    readoutRate.textContent = "Awaiting reading";
    readoutRate.classList.remove("is-over");
  } else {
    const rate = getRatePerCubicMeter(safeConsumption);
    readoutRate.textContent = "₱" + rate.toFixed(2) + " / m³";
    readoutRate.classList.toggle("is-over", isOver);
  }
}

consumptionInput.addEventListener("input", updateTierMeter);

/* =========================================================
   ODOMETER (mechanical digit-reel counter)
   ========================================================= */
const ODOMETER_DIGITS = 3;

function buildOdometer() {
  odometerEl.innerHTML = ""; // DOM access: clear existing content

  // Loop: build one reel per digit position
  for (let i = 0; i < ODOMETER_DIGITS; i++) {
    const digitBox = document.createElement("div");
    digitBox.className = "odometer__digit";

    const strip = document.createElement("div");
    strip.className = "odometer__strip";

    // Loop: fill each reel with digits 0-9
    for (let n = 0; n <= 9; n++) {
      const span = document.createElement("span");
      span.textContent = n;
      strip.appendChild(span);
    }

    digitBox.appendChild(strip);
    odometerEl.appendChild(digitBox);
  }
  setOdometerValue(0);
}

function setOdometerValue(value) {
  const padded = String(value).padStart(ODOMETER_DIGITS, "0").slice(-ODOMETER_DIGITS);
  const strips = odometerEl.querySelectorAll(".odometer__strip");

  // Loop: move each reel strip to the matching digit
  for (let i = 0; i < strips.length; i++) {
    const digit = parseInt(padded[i], 10);
    strips[i].style.transform = `translateY(${-digit * 30}px)`;
  }
  odometerEl.setAttribute("aria-label", `${value} transactions processed`);
}

buildOdometer();

/* =========================================================
   VALIDATION
   ========================================================= */
function clearErrors() {
  errName.textContent = "";
  errConsumption.textContent = "";
  nameInput.classList.remove("has-error");
  consumptionInput.classList.remove("has-error");
}

function validateForm(name, consumptionRaw) {
  let isValid = true;

  if (name === "") {
    errName.textContent = "Enter the customer's name to continue.";
    nameInput.classList.add("has-error");
    isValid = false;
  }

  const consumption = parseFloat(consumptionRaw);
  if (consumptionRaw === "" || isNaN(consumption) || consumption <= 0) {
    errConsumption.textContent = "Enter a valid consumption reading greater than 0.";
    consumptionInput.classList.add("has-error");
    isValid = false;
  }

  return isValid;
}

/* =========================================================
   RECEIPT BUILDING + PRINT-IN ANIMATION
   ========================================================= */
function peso(n) {
  return "₱" + n.toFixed(2);
}

function buildReceiptLines(data) {
  const { name, type, consumption, rate, amount, discount, total } = data;

  // Array + loop is used below to reveal these lines one at a time.
  return [
    { text: "================================", cls: "rule" },
    { text: "        WATER BILLING",           cls: "" },
    { text: "================================", cls: "rule" },
    { text: "",                                 cls: "" },
    { text: `Customer Name : ${name}`,          cls: "" },
    { text: `Customer Type : ${type}`,           cls: "" },
    { text: `Water Usage   : ${consumption} cu.m`, cls: "" },
    { text: `Rate          : ${peso(rate)} / cu.m`, cls: "" },
    { text: "--------------------------------", cls: "rule" },
    { text: `Amount        : ${peso(amount)}`,    cls: "" },
    { text: `Discount      : ${peso(discount)}`,  cls: "discount" },
    { text: "--------------------------------", cls: "rule" },
    { text: `TOTAL BILL    : ${peso(total)}`,     cls: "total" },
    { text: "================================", cls: "rule" },
  ];
}

function renderReceipt(lines) {
  receiptEmpty.hidden = true;
  receiptOutput.hidden = false;
  receiptOutput.innerHTML = "";
  receiptStub.hidden = false;
  receiptFoot.hidden = false;

  const refNumber = "WB-" + Date.now().toString().slice(-8);
  billRefEl.textContent = "BILL NO. " + refNumber;

  // Loop: append each line with a staggered delay for a "printing" effect
  lines.forEach((line, index) => {
    const el = document.createElement("span");
    el.textContent = line.text;
    el.className = "line" + (line.cls ? " " + line.cls : "");
    el.style.animationDelay = (index * 55) + "ms";
    receiptOutput.appendChild(el);
  });
}

/* =========================================================
   GOOGLE SHEETS RECORDING (Google Apps Script Web App)
   ========================================================= */
function setStatus(state, message) {
  statusDot.className = "status-dot " + state;
  statusText.textContent = message;
}

function recordToGoogleSheet(payload) {
  setStatus("pending", "Sending to Google Sheet…");

  // Plain text body keeps this a "simple request" (no CORS preflight),
  // and — unlike mode:"no-cors" — we can actually read the JSON that
  // comes back, so real failures show up instead of a blind "success".
  fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  })
    .then((res) => res.json())
    .then((result) => {
      if (result && result.result === "success") {
        setStatus("ok", "Saved to Google Sheet ✓");
      } else {
        setStatus("fail", "Sheet script returned an error — check the Apps Script logs.");
      }
    })
    .catch(() => {
      setStatus("fail", "Could not reach Google Sheet — statement still generated locally.");
    });
}

/*
  ============================================================
  MATCHING GOOGLE APPS SCRIPT — paste into Extensions > Apps
  Script on the spreadsheet, replacing whatever is there now.
  Column order matches the "Water" sheet tab exactly:
  Timestamp | Customer Name | Water Consumption | Customer Type
  | Rate per cu.m | Gross Amount | Discount | Net Total Bill
  ============================================================

  function doPost(e) {
    try {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Water");
      var data = JSON.parse(e.postData.contents);

      sheet.appendRow([
        data.timestamp,
        data.name,
        data.consumption,
        data.customerType,
        data.rate,
        data.grossAmount,
        data.discount,
        data.netTotal
      ]);

      return ContentService.createTextOutput(JSON.stringify({ result: "success" }))
        .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ result: "error", message: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  After pasting: Deploy > Manage deployments > pencil (edit) icon >
  New version > Deploy. Editing the code alone does NOT push changes
  to the live /exec URL — you must deploy a new version each time.
*/

/* =========================================================
   RIPPLE CLICK EFFECT — Generate Bill button
   ========================================================= */
generateBtn.addEventListener("click", function (event) {
  const rect = generateBtn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.4;
  const ripple = document.createElement("span");
  ripple.className = "btn-generate__ripple";
  ripple.style.width = ripple.style.height = size + "px";
  ripple.style.left = (event.clientX - rect.left - size / 2) + "px";
  ripple.style.top  = (event.clientY - rect.top - size / 2) + "px";
  generateBtn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 650);
});

/* =========================================================
   FORM SUBMIT
   ========================================================= */
form.addEventListener("submit", function (event) {
  event.preventDefault();
  clearErrors();

  const name            = nameInput.value.trim();
  const consumptionRaw  = consumptionInput.value.trim();
  const customerTypeKey = typeSelect.value;

  if (!validateForm(name, consumptionRaw)) {
    return;
  }

  const consumption = parseFloat(consumptionRaw);
  const rate        = getRatePerCubicMeter(consumption);
  const discountPct = getDiscountRate(customerTypeKey);

  const amount   = consumption * rate;
  const discount = amount * discountPct;
  const total    = amount - discount;

  const receiptData = {
    name,
    type: getCustomerTypeLabel(customerTypeKey),
    consumption,
    rate,
    amount,
    discount,
    total,
  };

  renderReceipt(buildReceiptLines(receiptData));

  // Increment + animate the transaction counter (DOM: odometer reel)
  transactionsProcessed++;
  setOdometerValue(transactionsProcessed);

  recordToGoogleSheet({
    timestamp: new Date().toLocaleString("en-PH"),
    name,
    consumption,
    customerType: receiptData.type,
    rate,
    grossAmount: amount,
    discount,
    netTotal: total,
  });
});

/* =========================================================
   HEADER CLOCK
   ========================================================= */
function tickClock() {
  clockEl.textContent = new Date().toLocaleTimeString("en-PH", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
tickClock();
setInterval(tickClock, 1000);

/* =========================================================
   RECEIPT ACTIONS — copy to clipboard / print
   ========================================================= */
copyBtn.addEventListener("click", function () {
  const text = receiptOutput.textContent;
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = "Copied";
    copyBtn.classList.add("is-done");
    setTimeout(() => {
      copyBtn.textContent = "Copy";
      copyBtn.classList.remove("is-done");
    }, 1600);
  });
});

printBtn.addEventListener("click", function () {
  window.print();
});

/* Initialize the tier meter on load */
updateTierMeter();


