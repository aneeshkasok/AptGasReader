const DB_NAME = "gasMeterDB";
const DB_VERSION = 1;
let db;

function initDB() {
  const req = indexedDB.open(DB_NAME, DB_VERSION);

  req.onupgradeneeded = e => {
    db = e.target.result;

    db.createObjectStore("settings", { keyPath: "key" });
    db.createObjectStore("flats", { keyPath: "key" });
    db.createObjectStore("readings", { keyPath: ["flatKey", "month"] });
  };

  req.onsuccess = e => {
    db = e.target.result;
    ensureDefaultPin();
  };
}

function ensureDefaultPin() {
  const tx = db.transaction("settings", "readwrite");
  const store = tx.objectStore("settings");

  store.get("pin").onsuccess = e => {
    if (!e.target.result) {
      store.put({ key: "pin", value: "1234" });
    }
  };
}
