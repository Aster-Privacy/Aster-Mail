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
import { afterEach, describe, expect, it } from "vitest";

import { has_tauri_runtime } from "./tauri_runtime";

const window_chain = Object.getPrototypeOf(window) as object;

function expose_by_id(element: HTMLElement): void {
  document.body.appendChild(element);
  Object.defineProperty(window_chain, element.id, {
    configurable: true,
    get: () => document.getElementById(element.id),
  });
}

afterEach(() => {
  Reflect.deleteProperty(window_chain, "__TAURI_INTERNALS__");
  Reflect.deleteProperty(window_chain, "__TAURI__");
  document.body.innerHTML = "";
});

describe("has_tauri_runtime with elements named by id", () => {
  it("stays false when an element has the internals id", () => {
    const element = document.createElement("div");

    element.id = "__TAURI_INTERNALS__";
    expose_by_id(element);

    expect("__TAURI_INTERNALS__" in window).toBe(true);
    expect(has_tauri_runtime()).toBe(false);
  });

  it("stays false when a form has the public global id", () => {
    const form = document.createElement("form");

    form.id = "__TAURI__";
    expose_by_id(form);

    expect("__TAURI__" in window).toBe(true);
    expect(has_tauri_runtime()).toBe(false);
  });
});
