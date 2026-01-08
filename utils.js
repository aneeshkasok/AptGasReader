// utils.js

function getPreviousMonth(month) {
  const d = new Date(month + "-01");
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function downloadCSV(filename, content) {
  const blob = new Blob([content], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function getFirstDayOfMonth(month) {
  // month = "2026-01"
  const [year, m] = month.split("-");
  return `01/${m}/${year}`; // DD/MM/YYYY
}

