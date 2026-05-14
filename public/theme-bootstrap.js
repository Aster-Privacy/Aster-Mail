(function () {
  try {
    if (localStorage.getItem("astermail_theme") === "dark") {
      document.documentElement.classList.add("dark");
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", "#0a0a0a");
    }
  } catch (e) {}
})();
