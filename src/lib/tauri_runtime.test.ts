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

const globals = window as unknown as Record<string, unknown>;

const window_chain = Object.getPrototypeOf(window) as object;

afterEach(() => {
  delete globals.__TAURI_INTERNALS__;
  delete globals.__TAURI__;
  Reflect.deleteProperty(window_chain, "__TAURI_INTERNALS__");
  Reflect.deleteProperty(window_chain, "__TAURI__");
  document.body.innerHTML = "";
});

describe("has_tauri_runtime", () => {
  it("is false in a plain browser window", () => {
    expect(has_tauri_runtime()).toBe(false);
  });

  it("is true when the desktop runtime sets its internals object", () => {
    globals.__TAURI_INTERNALS__ = { invoke: () => undefined };

    expect(has_tauri_runtime()).toBe(true);
  });

  it("is true when only the public desktop global is present", () => {
    globals.__TAURI__ = Object.create(null);

    expect(has_tauri_runtime()).toBe(true);
  });

  it("ignores an element that shares the global's name", () => {
    const anchor = document.createElement("a");

    anchor.setAttribute("name", "__TAURI_INTERNALS__");
    anchor.id = "__TAURI__";
    document.body.appendChild(anchor);

    expect(has_tauri_runtime()).toBe(false);
  });

  it("ignores values that are not plain objects", () => {
    globals.__TAURI_INTERNALS__ = document.createElement("a");
    globals.__TAURI__ = "desktop";

    expect(has_tauri_runtime()).toBe(false);
  });

  it("ignores a frame named after the global", () => {
    const frame = document.createElement("iframe");

    frame.setAttribute("name", "__TAURI_INTERNALS__");
    document.body.appendChild(frame);

    expect(has_tauri_runtime()).toBe(false);
  });

  it("ignores a null-prototype object that is not set on the window itself", () => {
    for (const name of ["__TAURI_INTERNALS__", "__TAURI__"]) {
      Object.defineProperty(window_chain, name, {
        configurable: true,
        get: () => Object.create(null),
      });
    }

    expect(globals.__TAURI_INTERNALS__).not.toBe(undefined);
    expect(has_tauri_runtime()).toBe(false);
  });
});
