function login() {
  if (!db) {
    alert("App loading, please try again");
    return;
  }

  const enteredPin = document.getElementById("pin").value;

  db.transaction("settings", "readonly")
    .objectStore("settings")
    .get("pin").onsuccess = e => {

      const savedPin = e.target.result?.value;

      if (enteredPin === savedPin) {
        document.getElementById("login").classList.add("hidden");
        document.getElementById("app").classList.remove("hidden");
      } else {
        alert("Wrong PIN");
      }
    };
}
