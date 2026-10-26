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
function is_desktop_shell(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
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
  try {
    window.print();
  } finally {
    window.setTimeout(cleanup, 60000);
  }
}
