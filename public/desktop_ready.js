(function () {
  if (!Object.getOwnPropertyDescriptor(window, "__TAURI_INTERNALS__")) return;

  var internals = window.__TAURI_INTERNALS__;

  if (typeof internals !== "object" || internals === null) return;

  var prototype = Object.getPrototypeOf(internals);

  if (prototype !== Object.prototype && prototype !== null) return;
  if (typeof internals.invoke !== "function") return;

  var send = function (command) {
    try {
      internals.invoke(command).catch(function () {});
    } catch (e) {}
  };

  send("frontend_ready");

  var reported = false;
  var report_painted = function () {
    if (reported) return;
    reported = true;
    send("frontend_painted");
  };

  var supported =
    PerformanceObserver && PerformanceObserver.supportedEntryTypes;

  if (
    typeof PerformanceObserver !== "function" ||
    !supported ||
    supported.indexOf("paint") === -1
  ) {
    report_painted();
    return;
  }

  try {
    var observer = new PerformanceObserver(function (list) {
      var entries = list.getEntries();

      for (var i = 0; i < entries.length; i++) {
        if (entries[i].name === "first-contentful-paint") {
          observer.disconnect();
          report_painted();
          return;
        }
      }
    });

    observer.observe({ type: "paint", buffered: true });
  } catch (e) {
    report_painted();
  }
})();
