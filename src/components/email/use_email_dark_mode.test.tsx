//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const appearance = vi.hoisted(() => ({ is_dark: true }));

vi.mock("@/lib/resolved_accent", () => ({
  use_resolved_accent: () => appearance,
}));

import { use_email_dark_mode } from "./use_email_dark_mode";

let current: ReturnType<typeof use_email_dark_mode>;
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;

function Viewer({ force = true }: { force?: boolean }) {
  current = use_email_dark_mode(force);

  return <span>{String(current.is_dark_mode_message("message"))}</span>;
}

function render(force = true) {
  act(() => root.render(<Viewer force={force} />));
}

function mount(force = true) {
  appearance.is_dark = true;
  root = createRoot(container);
  render(force);
}

afterEach(() => act(() => root.unmount()));

describe("email dark mode follows app appearance", () => {
  it("turns a forced-dark email off immediately when the app becomes light", () => {
    mount();
    expect(current.is_dark_mode_message("message")).toBe(true);
    appearance.is_dark = false;
    render();
    expect(container.textContent).toBe("false");
    expect(current.is_dark_mode_message("message")).toBe(false);
    appearance.is_dark = true;
    render();
    expect(current.is_dark_mode_message("message")).toBe(true);
  });

  it("clears message and conversation overrides on theme changes", () => {
    mount(false);
    act(() => current.toggle_dark_mode("message"));
    expect(current.is_dark_mode_message("message")).toBe(true);
    act(() => current.set_all_dark_mode(["message", "other"], true));
    appearance.is_dark = false;
    render(false);
    expect(current.is_dark_mode_message("message")).toBe(false);
    expect(current.is_dark_mode_message("other")).toBe(false);
    expect(current.is_dark_mode_opted_out("message")).toBe(false);
  });

  it("still allows a deliberate dark-mode override in the light app", () => {
    mount();
    appearance.is_dark = false;
    render();
    act(() => current.toggle_dark_mode("message"));
    expect(current.is_dark_mode_message("message")).toBe(true);
    act(() => current.toggle_dark_mode("message"));
    expect(current.is_dark_mode_message("message")).toBe(false);
  });

  it("clears a light-mode opt-out when app appearance changes", () => {
    mount();
    act(() => current.toggle_dark_mode("message"));
    expect(current.is_dark_mode_opted_out("message")).toBe(true);
    appearance.is_dark = false;
    render();
    expect(current.is_dark_mode_opted_out("message")).toBe(false);
  });
});
