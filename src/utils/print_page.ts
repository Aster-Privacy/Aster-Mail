//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
const PRINT_ROOT_ID = "aster-print-root";
const PRINT_STYLES_ID = "aster-print-styles";
const PRINT_CLEANUP_FALLBACK_MS = 60000;

function is_desktop_shell(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

function is_mac_platform(): boolean {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = (
    nav.userAgentData?.platform ||
    navigator.platform ||
    ""
  ).toLowerCase();

  return platform.includes("mac");
}

function print_with_desktop_shell(): void {
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("print_webview"))
    .catch(() => window.print());
}

export function request_print(): void {
  if (is_desktop_shell() && is_mac_platform()) {
    print_with_desktop_shell();

    return;
  }

  window.print();
}

export function print_page_css(
  margin: string,
  padded_selector: string,
): string {
  if (!is_desktop_shell()) return `@page { margin: ${margin}; }`;

  return `@page { margin: 0; }
    ${padded_selector} {
      padding: ${margin} !important;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }`;
}

export function release_pointer_events_lock(): void {
  if (document.body.style.pointerEvents !== "none") return;

  const open_layer = document.querySelector(
    '[data-radix-menu-content][data-state="open"], [role="dialog"][data-state="open"], [data-radix-popper-content-wrapper]',
  );

  if (open_layer) return;

  document.body.style.removeProperty("pointer-events");
  document.body.removeAttribute("data-scroll-locked");
}

export function run_web_print(cleanup: () => void): void {
  let finished = false;
  let fallback_timer = 0;

  const finish = () => {
    if (finished) return;

    finished = true;
    window.removeEventListener("afterprint", finish);
    if (fallback_timer) window.clearTimeout(fallback_timer);
    cleanup();
    window.setTimeout(release_pointer_events_lock, 0);
  };

  window.addEventListener("afterprint", finish);
  fallback_timer = window.setTimeout(finish, PRINT_CLEANUP_FALLBACK_MS);

  try {
    request_print();
  } catch {
    finish();
  }
}

export function print_document_in_page(
  title: string,
  body_html: string,
  css: string,
): void {
  document.getElementById(PRINT_ROOT_ID)?.remove();
  document.getElementById(PRINT_STYLES_ID)?.remove();

  const style_el = document.createElement("style");

  style_el.id = PRINT_STYLES_ID;
  style_el.textContent = `
    #${PRINT_ROOT_ID} { display: none; }
    @media print {
      html, body {
        height: auto !important;
        overflow: visible !important;
        background: #fff !important;
      }
      body > *:not(#${PRINT_ROOT_ID}):not(#${PRINT_STYLES_ID}) { display: none !important; }
      #${PRINT_ROOT_ID} { display: block !important; position: static !important; }
      ${css}
    }
  `;

  const container = document.createElement("div");

  container.id = PRINT_ROOT_ID;
  container.innerHTML = body_html;

  document.head.appendChild(style_el);
  document.body.appendChild(container);

  const previous_title = document.title;

  document.title = title;

  run_web_print(() => {
    container.remove();
    style_el.remove();
    if (document.title === title) document.title = previous_title;
  });
}

export function print_current_page(margin = "0.5in"): void {
  if (!is_desktop_shell()) {
    window.print();

    return;
  }

  const style_el = document.createElement("style");

  style_el.textContent = `@media print { ${print_page_css(margin, "body")} }`;
  document.head.appendChild(style_el);

  const cleanup = () => {
    window.removeEventListener("afterprint", cleanup);
    style_el.remove();
  };

  window.addEventListener("afterprint", cleanup);
  window.setTimeout(cleanup, PRINT_CLEANUP_FALLBACK_MS);
  request_print();
}
