let currentMonth = "";
let rate = 0;
let editingFlatKey = null; // Track if we're editing a flat

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
  const mobile = document.getElementById("mobileNumber").value.trim();

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
      name: name,
      mobile: mobile
    });

  // ✅ CLEAR INPUTS (correct way)
  document.getElementById("keyField").value = "";
  document.getElementById("flatNo").value = "";
  document.getElementById("sqft").value = "";
  document.getElementById("ownerName").value = "";
  document.getElementById("mobileNumber").value = "";

  editingFlatKey = null;
  loadFlats(); // refresh table
  // hide form after save
  document.getElementById("addFlatForm").classList.add("hidden");
}

function toggleAddFlat() {
  const form = document.getElementById("addFlatForm");
  form.classList.toggle("hidden");
  if (form.classList.contains("hidden")) {
    editingFlatKey = null;
    clearFlatForm();
  }
}

function cancelEditFlat() {
  editingFlatKey = null;
  clearFlatForm();
  document.getElementById("addFlatForm").classList.add("hidden");
}

function clearFlatForm() {
  document.getElementById("keyField").value = "";
  document.getElementById("flatNo").value = "";
  document.getElementById("sqft").value = "";
  document.getElementById("ownerName").value = "";
  document.getElementById("mobileNumber").value = "";
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

  // Waste collected column (Yes / No)
  const tdWaste = document.createElement("td");
  const selectWaste = document.createElement("select");
  selectWaste.id = `w_${flat.key}`;
  const optYes = document.createElement("option");
  optYes.value = "Yes";
  optYes.text = "Yes";
  const optNo = document.createElement("option");
  optNo.value = "No";
  optNo.text = "No";
  selectWaste.appendChild(optYes);
  selectWaste.appendChild(optNo);
  // ensure value is either Yes/No
  const initialWaste = (data.wasteCollected === true || data.wasteCollected === "Yes") ? "Yes" : "No";
  selectWaste.value = initialWaste;
  selectWaste.addEventListener("change", () => saveWaste(flat.key));
  tdWaste.appendChild(selectWaste);

  const tdActions = document.createElement("td");
  tdActions.style.whiteSpace = "nowrap";
  tdActions.style.display = "flex";
  tdActions.style.gap = "2px";
  tdActions.style.alignItems = "center";
  
  const callBtn = document.createElement("button");
  callBtn.textContent = "📞";
  callBtn.style.marginRight = "5px";
  callBtn.style.padding = "3px 8px";
  callBtn.style.background = "transparent";
  callBtn.style.color = "white";
  callBtn.style.border = "none";
  callBtn.style.cursor = "pointer";
  callBtn.style.fontSize = "16px";
  callBtn.title = "Call";
  if (flat.mobile) {
    callBtn.onclick = () => window.location.href = `tel:${flat.mobile}`;
  } else {
    callBtn.disabled = true;
    callBtn.style.cursor = "not-allowed";
    callBtn.style.opacity = "0.5";
    callBtn.title = "No mobile number";
  }

  const editBtn = document.createElement("button");
  editBtn.textContent = "✏️";
  editBtn.style.marginRight = "5px";
  editBtn.style.padding = "3px 8px";
  editBtn.style.background = "transparent";
  editBtn.style.color = "white";
  editBtn.style.border = "none";
  editBtn.style.cursor = "pointer";
  editBtn.style.fontSize = "16px";
  editBtn.title = "Edit";
  editBtn.onclick = () => editFlat(flat);

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "🗑️";
  deleteBtn.style.padding = "3px 8px";
  deleteBtn.style.background = "transparent";
  deleteBtn.style.color = "white";
  deleteBtn.style.border = "none";
  deleteBtn.style.cursor = "pointer";
  deleteBtn.style.fontSize = "16px";
  deleteBtn.title = "Delete";
  deleteBtn.onclick = () => deleteFlat(flat.key);

  tdActions.appendChild(callBtn);
  tdActions.appendChild(editBtn);
  tdActions.appendChild(deleteBtn);

  tr.appendChild(tdFlat);
  tr.appendChild(tdPrev);
  tr.appendChild(tdCurr);
  tr.appendChild(tdUnits);
  tr.appendChild(tdAmount);
  tr.appendChild(tdWaste);
  tr.appendChild(tdActions);

  rowsEl.appendChild(tr);
}

function calc(flatKey) {
  const p = parseFloat(document.getElementById(`p_${flatKey}`).value || 0);
  const c = parseFloat(document.getElementById(`c_${flatKey}`).value || 0);
  const wasteVal = document.getElementById(`w_${flatKey}`) ? document.getElementById(`w_${flatKey}`).value : "No";

  if (c < p) {
    // keep previous values if invalid input — do not overwrite units/amount
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
    amount,
    wasteCollected: (wasteVal === "Yes")
  });
}

function editFlat(flat) {
  editingFlatKey = flat.key;
  document.getElementById("keyField").value = flat.key;
  document.getElementById("flatNo").value = flat.flat;
  document.getElementById("sqft").value = flat.sqft || "";
  document.getElementById("ownerName").value = flat.name || "";
  document.getElementById("mobileNumber").value = flat.mobile || "";
  document.getElementById("addFlatForm").classList.remove("hidden");
}

function deleteFlat(flatKey) {
  if (!confirm("Are you sure you want to delete this flat? All readings will remain in the system.")) {
    return;
  }

  if (!db) {
    alert("Database not ready");
    return;
  }

  db.transaction("flats", "readwrite")
    .objectStore("flats")
    .delete(flatKey);

  loadFlats(); // refresh table
  alert("Flat deleted successfully");
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

// Save only wasteCollected for the current month. This keeps other fields intact.
function saveWaste(flatKey) {
  if (!db) return;
  const wEl = document.getElementById(`w_${flatKey}`);
  const val = wEl ? (wEl.value === "Yes") : false;
  const key = [flatKey, currentMonth];
  const tx = db.transaction("readings", "readwrite");
  const store = tx.objectStore("readings");
  const req = store.get(key);
  req.onsuccess = e => {
    const existing = e.target.result || { flatKey, month: currentMonth, prev: 0, curr: 0, units: 0, rate: rate || 0, amount: 0 };
    existing.wasteCollected = val;
    store.put(existing);
  };
  req.onerror = () => {
    // Fallback: put a minimal record
    store.put({ flatKey, month: currentMonth, prev: 0, curr: 0, units: 0, rate: rate || 0, amount: 0, wasteCollected: val });
  };
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
        const flatData = f.target.result;
        if (flatData) {
          csv += `${r.flatKey},"<Utility Pinnacle>","<${flatData.flat}>",${flatData.sqft},"Utility",${flatData.name},0,302003,${r.amount},${billingDate},"${r.curr}-${r.prev}*2.6*${r.rate}"\n`;
        }
        if (++done === rowsData.length) {
          downloadCSV(`gas_${currentMonth}.csv`, csv);
        }
      };
    });
  }
}

// Email CSV: tries Web Share API with a File, falls back to clipboard + mailto or finally downloads
function emailCSV() {
  let csv = "KeyField,Block,Flat,SquareFeet,Category,Name,CurrentDue,AccountNo*,Amount*,InvoiceDate(DD/MM/YYYY)*,Comment*\n";
  const rowsData = [];
  const tx = db.transaction(["readings", "flats"], "readonly");
  const readingsStore = tx.objectStore("readings");
  const flatsStore = tx.objectStore("flats");
  const billingDate = getFirstDayOfMonth(currentMonth);

  readingsStore.openCursor().onsuccess = e => {
    const c = e.target.result;
    if (!c) return buildEmail();

    if (c.value.month === currentMonth) {
      rowsData.push(c.value);
    }
    c.continue();
  };

  function buildEmail() {
    if (!rowsData.length) return alert("No data for this month");

    let done = 0;
    rowsData.forEach(r => {
      flatsStore.get(r.flatKey).onsuccess = f => {
        const flatData = f.target.result;
        if (flatData) {
          csv += `${r.flatKey},"<Utility Pinnacle>","<${flatData.flat}>",${flatData.sqft},"Utility",${flatData.name},0,302003,${r.amount},${billingDate},"${r.curr}-${r.prev}*2.6*${r.rate}"\n`;
        }
        if (++done === rowsData.length) {
          const filename = `gas_${currentMonth}.csv`;
          const file = new File([csv], filename, { type: "text/csv" });

          // Try Web Share API with files
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: filename, text: `Gas readings for ${currentMonth}` })
              .catch(() => fallbackMail(csv, filename));
          } else if (navigator.share) {
            // Share as text (may be limited in length)
            navigator.share({ title: filename, text: csv.slice(0, 65500) })
              .catch(() => fallbackMail(csv, filename));
          } else {
            fallbackMail(csv, filename);
          }
        }
      };
    });
  }

  async function fallbackMail(csvText, filename) {
    try {
      await navigator.clipboard.writeText(csvText);
      const preview = csvText.split("\n").slice(0, 10).join("\n");
      const subject = encodeURIComponent(`Gas readings ${currentMonth}`);
      const body = encodeURIComponent(`I've copied ${filename} to clipboard. Paste it into your email or attach it.\n\nPreview:\n${preview}`);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    } catch (err) {
      // Final fallback: download and inform the user
      downloadCSV(filename, csvText);
      alert("Couldn't directly email or copy to clipboard. The CSV was downloaded; attach it to your email.");
    }
  }
}

// Export Waste CSV: amount based on wasteCollected flag (260 if Yes, 0 if No), AccountNo 305007
function exportWasteCSV() {
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
        const flatData = f.target.result;
        if (flatData) {
          // Amount is 260 if waste collected, 0 otherwise
          const wasteAmount = r.wasteCollected ? 260 : 0;
          csv += `${r.flatKey},"<Utility Pinnacle>","<${flatData.flat}>",${flatData.sqft},"Utility",${flatData.name},0,305006,${wasteAmount},${billingDate},"Waste collected: ${r.wasteCollected ? 'Yes' : 'No'}"\n`;
        }
        if (++done === rowsData.length) {
          downloadCSV(`gas_waste_${currentMonth}.csv`, csv);
        }
      };
    });
  }
}

// Email Waste CSV: tries Web Share API with waste-based amount, falls back to clipboard + mailto or downloads
function emailWasteCSV() {
  let csv = "KeyField,Block,Flat,SquareFeet,Category,Name,CurrentDue,AccountNo*,Amount*,InvoiceDate(DD/MM/YYYY)*,Comment*\n";
  const rowsData = [];
  const tx = db.transaction(["readings", "flats"], "readonly");
  const readingsStore = tx.objectStore("readings");
  const flatsStore = tx.objectStore("flats");
  const billingDate = getFirstDayOfMonth(currentMonth);

  readingsStore.openCursor().onsuccess = e => {
    const c = e.target.result;
    if (!c) return buildEmail();

    if (c.value.month === currentMonth) {
      rowsData.push(c.value);
    }
    c.continue();
  };

  function buildEmail() {
    if (!rowsData.length) return alert("No data for this month");

    let done = 0;
    rowsData.forEach(r => {
      flatsStore.get(r.flatKey).onsuccess = f => {
        const flatData = f.target.result;
        if (flatData) {
          // Amount is 260 if waste collected, 0 otherwise
          const wasteAmount = r.wasteCollected ? 260 : 0;
          csv += `${r.flatKey},"<Utility Pinnacle>","<${flatData.flat}>",${flatData.sqft},"Utility",${flatData.name},0,305006,${wasteAmount},${billingDate},"Waste collected: ${r.wasteCollected ? 'Yes' : 'No'}"\n`;
        }
        if (++done === rowsData.length) {
          const filename = `gas_waste_${currentMonth}.csv`;
          const file = new File([csv], filename, { type: "text/csv" });

          // Try Web Share API with files
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: filename, text: `Gas waste readings for ${currentMonth}` })
              .catch(() => fallbackMail(csv, filename));
          } else if (navigator.share) {
            // Share as text (may be limited in length)
            navigator.share({ title: filename, text: csv.slice(0, 65500) })
              .catch(() => fallbackMail(csv, filename));
          } else {
            fallbackMail(csv, filename);
          }
        }
      };
    });
  }

  async function fallbackMail(csvText, filename) {
    try {
      await navigator.clipboard.writeText(csvText);
      const preview = csvText.split("\n").slice(0, 10).join("\n");
      const subject = encodeURIComponent(`Waste readings ${currentMonth}`);
      const body = encodeURIComponent(`I've copied ${filename} to clipboard. Paste it into your email or attach it.\n\nPreview:\n${preview}`);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    } catch (err) {
      // Final fallback: download and inform the user
      downloadCSV(filename, csvText);
      alert("Couldn't directly email or copy to clipboard. The CSV was downloaded; attach it to your email.");
    }
  }
}

function backupDatabase() {
  if (!db) {
    alert("Database not ready");
    return;
  }

  const backup = {
    version: 1,
    timestamp: new Date().toISOString(),
    flats: [],
    readings: []
  };

  const tx = db.transaction(["flats", "readings"], "readonly");
  const flatsStore = tx.objectStore("flats");
  const readingsStore = tx.objectStore("readings");

  let flatsLoaded = false;
  let readingsLoaded = false;

  flatsStore.openCursor().onsuccess = e => {
    const c = e.target.result;
    if (c) {
      backup.flats.push(c.value);
      c.continue();
    } else {
      flatsLoaded = true;
      if (readingsLoaded) finishBackup();
    }
  };

  readingsStore.openCursor().onsuccess = e => {
    const c = e.target.result;
    if (c) {
      backup.readings.push(c.value);
      c.continue();
    } else {
      readingsLoaded = true;
      if (flatsLoaded) finishBackup();
    }
  };

  function finishBackup() {
    const json = JSON.stringify(backup, null, 2);
    downloadJSON(`gasreading_backup_${new Date().toISOString().slice(0, 10)}.json`, json);
    alert(`Backup complete!\nFlats: ${backup.flats.length}\nReadings: ${backup.readings.length}`);
  }
}

function restoreDatabase(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const backup = JSON.parse(e.target.result);

      if (!backup.version || !Array.isArray(backup.flats) || !Array.isArray(backup.readings)) {
        alert("Invalid backup file format");
        return;
      }

      if (!confirm(`Restore backup with ${backup.flats.length} flats and ${backup.readings.length} readings?\n\nThis will replace all current data!`)) {
        return;
      }

      const tx = db.transaction(["flats", "readings"], "readwrite");
      const flatsStore = tx.objectStore("flats");
      const readingsStore = tx.objectStore("readings");

      // Clear existing data
      flatsStore.clear();
      readingsStore.clear();

      // Restore flats
      backup.flats.forEach(flat => {
        flatsStore.put(flat);
      });

      // Restore readings
      backup.readings.forEach(reading => {
        readingsStore.put(reading);
      });

      tx.oncomplete = () => {
        alert(`Restore complete!\nRestored ${backup.flats.length} flats and ${backup.readings.length} readings.`);
        document.getElementById('restoreFile').value = '';
        loadFlats();
      };

      tx.onerror = () => {
        alert('Error restoring backup: ' + tx.error);
      };
    } catch (err) {
      console.error('Restore error:', err);
      alert('Error parsing backup file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function downloadJSON(filename, content) {
  const blob = new Blob([content], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
