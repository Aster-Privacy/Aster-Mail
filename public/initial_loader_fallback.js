(function () {
  var timeout_id = window.setTimeout(function () {
    var el = document.getElementById("initial-loader-fallback");

    if (el) el.classList.add("visible");
  }, 10000);

  var loader_gone = new MutationObserver(function () {
    if (!document.getElementById("initial-loader")) {
      window.clearTimeout(timeout_id);
      loader_gone.disconnect();
    }
  });

  loader_gone.observe(document.body, { childList: true });

  document.addEventListener("click", function (event) {
    var target = event.target;

    if (target && target.id === "initial-loader-reload") {
      window.location.reload();
    }

    if (target && target.id === "initial-loader-hard-reset") {
      Promise.resolve()
        .then(function () {
          if (window.caches && caches.keys) {
            return caches.keys().then(function (keys) {
              return Promise.all(
                keys.map(function (key) {
                  return caches.delete(key);
                }),
              );
            });
          }
        })
        .then(function () {
          if (
            navigator.serviceWorker &&
            navigator.serviceWorker.getRegistrations
          ) {
            return navigator.serviceWorker
              .getRegistrations()
              .then(function (regs) {
                return Promise.all(
                  regs.map(function (reg) {
                    return reg.unregister();
                  }),
                );
              });
          }
        })
        .catch(function () {})
        .then(function () {
          window.location.reload();
        });
    }
  });
})();
