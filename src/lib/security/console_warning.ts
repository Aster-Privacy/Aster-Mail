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
const has_been_shown = { current: false };

export function show_self_xss_warning(): void {
  if (has_been_shown.current) return;
  has_been_shown.current = true;

  if (typeof window === "undefined" || typeof console === "undefined") return;
  if ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return;

  console.log("%cStop!", "color: #dc2626; font-size: 60px; font-weight: 800;");
  console.log(
    "This is a browser feature intended for developers. If someone instructed you to copy and paste code here in order to enable a feature or gain access to another user's account, this is a known attack referred to as Self-XSS and would grant that party full access to your Aster Mail account.",
  );
  console.log(
    "If you're a developer or security researcher, Aster's source code can be located at https://github.com/Aster-Privacy",
  );
}
