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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { use_email_dark_mode } from "./use_email_dark_mode";

import {
  get_resolved_accent,
  refresh_resolved_accent,
} from "@/lib/resolved_accent";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let current: ReturnType<typeof use_email_dark_mode>;
let renders = 0;
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;

function Viewer({ force = true }: { force?: boolean }) {
  renders += 1;
  current = use_email_dark_mode(force);

  return <span>{String(current.is_dark_mode_message("message"))}</span>;
}

function render(force = true) {
  act(() => root.render(<Viewer force={force} />));
}

function set_dark_class(is_dark: boolean) {
  act(() => {
    document.documentElement.classList.toggle("dark", is_dark);
    document.documentElement.classList.toggle("light", !is_dark);
    refresh_resolved_accent();
  });
}

function set_root_style(name: string, value: string) {
  act(() => {
    document.documentElement.style.setProperty(name, value);
    refresh_resolved_accent();
  });
}

function mount(force = true) {
  set_dark_class(true);
  root = createRoot(container);
  render(force);
}

beforeEach(() => {
  renders = 0;
  document.documentElement.removeAttribute("style");
});

afterEach(() => {
  act(() => root.unmount());
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.removeAttribute("style");
  refresh_resolved_accent();
});

describe("email dark mode follows app appearance", () => {
  it("turns a forced-dark email off immediately when the app becomes light", () => {
    mount();
    expect(current.is_dark_mode_message("message")).toBe(true);
    set_dark_class(false);
    expect(container.textContent).toBe("false");
    expect(current.is_dark_mode_message("message")).toBe(false);
    set_dark_class(true);
    expect(current.is_dark_mode_message("message")).toBe(true);
  });

  it("clears message and conversation overrides on theme changes", () => {
    mount(false);
    act(() => current.toggle_dark_mode("message"));
    expect(current.is_dark_mode_message("message")).toBe(true);
    act(() => current.set_all_dark_mode(["message", "other"], true));
    set_dark_class(false);
    expect(current.is_dark_mode_message("message")).toBe(false);
    expect(current.is_dark_mode_message("other")).toBe(false);
    expect(current.is_dark_mode_opted_out("message")).toBe(false);
  });

  it("still allows a deliberate dark-mode override in the light app", () => {
    mount();
    set_dark_class(false);
    act(() => current.toggle_dark_mode("message"));
    expect(current.is_dark_mode_message("message")).toBe(true);
    act(() => current.toggle_dark_mode("message"));
    expect(current.is_dark_mode_message("message")).toBe(false);
  });

  it("clears a light-mode opt-out when app appearance changes", () => {
    mount();
    act(() => current.toggle_dark_mode("message"));
    expect(current.is_dark_mode_opted_out("message")).toBe(true);
    set_dark_class(false);
    expect(current.is_dark_mode_opted_out("message")).toBe(false);
    set_dark_class(true);
    expect(current.is_dark_mode_opted_out("message")).toBe(false);
    expect(current.is_dark_mode_message("message")).toBe(true);
  });

  it("keeps overrides when only the accent or surface colour changes", () => {
    mount();
    act(() => current.toggle_dark_mode("message"));
    act(() => current.set_all_dark_mode(["message", "other"], false));
    const before = renders;

    set_root_style("--accent-color", "#ff0000");
    set_root_style("--bg-primary", "#101010");
    expect(get_resolved_accent().accent).toBe("#ff0000");
    expect(get_resolved_accent().surface).toBe("#101010");
    expect(renders).toBe(before);
    expect(current.is_dark_mode_opted_out("message")).toBe(true);
    expect(current.is_dark_mode_opted_out("other")).toBe(true);
  });

  it("keeps overrides when the same appearance is applied again", () => {
    mount();
    act(() => current.toggle_dark_mode("message"));
    set_dark_class(true);
    render();
    expect(current.is_dark_mode_opted_out("message")).toBe(true);
  });

  it("keeps a choice made after a theme change through a callback captured before it", () => {
    mount(false);
    const { toggle_dark_mode, set_all_dark_mode } = current;

    set_dark_class(false);
    act(() => toggle_dark_mode("message"));
    render(false);
    expect(current.is_dark_mode_message("message")).toBe(true);

    act(() => set_all_dark_mode(["message", "other"], true));
    render(false);
    expect(current.is_dark_mode_message("other")).toBe(true);
  });

  it("keeps a choice made after a theme change until the next real change", () => {
    mount();
    set_dark_class(false);
    act(() => current.toggle_dark_mode("message"));
    set_root_style("--accent-color", "#00ff00");
    render();
    expect(current.is_dark_mode_message("message")).toBe(true);
    set_dark_class(true);
    set_dark_class(false);
    expect(current.is_dark_mode_message("message")).toBe(false);
  });
});
