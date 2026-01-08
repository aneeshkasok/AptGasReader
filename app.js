let currentMonth = "";
let rate = 0;

// Cache frequently used DOM elements to avoid repeated lookups
const monthEl = document.getElementById("month");
const rowsEl = document.getElementById("rows");
const rateEl = document.getElementById("rate");

// Debounce map to reduce frequent IndexedDB writes per-flat
const WRITE_DELAY = 500; // ms
const writeTimers = new Map();

function loadMonth() {
  currentMonth = monthEl.value;
  if (!currentMonth) {
    alert("Select a month");
    return;
  }
  rate = parseFloat(rateEl.value || 0);
  loadFlats();
}

function addFlat() {
  if (!db) {
    alert("Database not ready yet");
    return;
  }

  const key = document.getElementById("keyField").value.trim();
  const flat = document.getElementById("flatNo").value.trim();
  const sqftVal = document.getElementById("sqft").value;
  const name = document.getElementById("ownerName").value.trim();

  if (!key || !flat) {
    alert("KeyField and Flat are required");
    return;
  }

  db.transaction("flats", "readwrite")
    .objectStore("flats")
    .put({
      key: key,
      flat: flat,
      sqft: sqftVal,
      name: name
    });

  // ✅ CLEAR INPUTS (correct way)
  document.getElementById("keyField").value = "";
  document.getElementById("flatNo").value = "";
  document.getElementById("sqft").value = "";
  document.getElementById("ownerName").value = "";

  loadFlats(); // refresh table
  // hide form after save
  document.getElementById("addFlatForm").classList.add("hidden");
}

function toggleAddFlat() {
  const form = document.getElementById("addFlatForm");
  form.classList.toggle("hidden");
}

function loadFlats() {
  rowsEl.innerHTML = "";
  if (!currentMonth) return;

  const prevMonth = getPreviousMonth(currentMonth);
  const tx = db.transaction(["flats", "readings"], "readonly");
  const flatsStore = tx.objectStore("flats");
  const readingsStore = tx.objectStore("readings");

  // Build rows using DOM APIs to avoid repeated HTML parsing
  flatsStore.openCursor().onsuccess = e => {
    const c = e.target.result;
    if (!c) return;

    const flat = c.value;

    readingsStore.get([flat.key, currentMonth]).onsuccess = r => {
      if (r.target.result) {
        drawRow(flat, r.target.result);
      } else {
        readingsStore.get([flat.key, prevMonth]).onsuccess = p => {
          drawRow(flat, {
            prev: p.target.result?.curr || "",
            curr: ""
          });
        };
      }
    };
    c.continue();
  };
}

function drawRow(flat, data) {
  const tr = document.createElement("tr");
  tr.className = "flats-td";

  const tdFlat = document.createElement("td");
  tdFlat.textContent = flat.flat;

  const tdPrev = document.createElement("td");
  const inputPrev = document.createElement("input");
  inputPrev.id = `p_${flat.key}`;
  inputPrev.value = data.prev || "";
  inputPrev.addEventListener("input", () => calc(flat.key));
  tdPrev.appendChild(inputPrev);

  const tdCurr = document.createElement("td");
  const inputCurr = document.createElement("input");
  inputCurr.id = `c_${flat.key}`;
  inputCurr.value = data.curr || "";
  inputCurr.addEventListener("input", () => calc(flat.key));
  tdCurr.appendChild(inputCurr);

  const tdUnits = document.createElement("td");
  tdUnits.id = `u_${flat.key}`;
  tdUnits.textContent = (data.units != null) ? Number(data.units).toFixed(2) : "";

  const tdAmount = document.createElement("td");
  tdAmount.id = `a_${flat.key}`;
  tdAmount.textContent = (data.amount != null) ? Number(data.amount).toFixed(2) : "";

  tr.appendChild(tdFlat);
  tr.appendChild(tdPrev);
  tr.appendChild(tdCurr);
  tr.appendChild(tdUnits);
  tr.appendChild(tdAmount);

  rowsEl.appendChild(tr);
}

function calc(flatKey) {
  const p = parseFloat(document.getElementById(`p_${flatKey}`).value || 0);
  const c = parseFloat(document.getElementById(`c_${flatKey}`).value || 0);
  if (c < p) {
    // keep previous values if invalid input
    return;
  }

  const units = (c - p) * 2.6;
  const amount = units * rate;

  const uEl = document.getElementById(`u_${flatKey}`);
  const aEl = document.getElementById(`a_${flatKey}`);
  if (uEl) uEl.innerText = units.toFixed(2);
  if (aEl) aEl.innerText = amount.toFixed(2);

  // Debounce writes to IndexedDB to avoid excessive writes while typing
  scheduleWrite(flatKey, {
    flatKey,
    month: currentMonth,
    prev: p,
    curr: c,
    units,
    rate,
    amount
  });
}

function scheduleWrite(flatKey, record) {
  if (writeTimers.has(flatKey)) {
    clearTimeout(writeTimers.get(flatKey));
  }
  const t = setTimeout(() => {
    try {
      db.transaction("readings", "readwrite").objectStore("readings").put(record);
    } catch (err) {
      console.error("Failed to write reading:", err);
    }
    writeTimers.delete(flatKey);
  }, WRITE_DELAY);
  writeTimers.set(flatKey, t);
}

function exportCSV() {
  let csv = "KeyField,Block,Flat,SquareFeet,Category,Name,CurrentDue,AccountNo*,Amount*,InvoiceDate(DD/MM/YYYY)*,Comment*\n";
  const rowsData = [];
  const tx = db.transaction(["readings", "flats"], "readonly");
  const readingsStore = tx.objectStore("readings");
  const flatsStore = tx.objectStore("flats");
  const billingDate = getFirstDayOfMonth(currentMonth);
  readingsStore.openCursor().onsuccess = e => {
    const c = e.target.result;
    if (!c) return build();

    if (c.value.month === currentMonth) {
      rowsData.push(c.value);
    }
    c.continue();
  };

  function build() {
    if (!rowsData.length) return alert("No data for this month");

    let done = 0;
    rowsData.forEach(r => {
      flatsStore.get(r.flatKey).onsuccess = f => {
        csv += `${r.flatKey},"<Utility Pinnacle>","<${f.target.result.flat}>",${f.target.result.sqft},"Utility",${f.target.result.name},0,305006,${r.amount},${billingDate},"${r.curr}-${r.prev}*2.6*${r.rate}"\n`;
        if (++done === rowsData.length) {
          downloadCSV(`gas_${currentMonth}.csv`, csv);
        }
      };
    });
  }
}
