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
import { describe, it, expect, afterEach } from "vitest";

import {
  safe_local_get,
  safe_local_keys,
  safe_local_remove,
  safe_local_set,
  safe_session_get,
  safe_session_keys,
  safe_session_remove,
  safe_session_set,
} from "./safe_storage";

const real_local = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const real_session = Object.getOwnPropertyDescriptor(
  globalThis,
  "sessionStorage",
);

function block(name: "localStorage" | "sessionStorage") {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
}

function fill(name: "localStorage" | "sessionStorage") {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: {
      length: 2,
      key: (index: number) => ["alpha", "beta"][index] ?? null,
      getItem: () => "value",
      setItem: () => {
        throw new DOMException("Quota exceeded.", "QuotaExceededError");
      },
      removeItem: () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    },
  });
}

describe("safe_storage", () => {
  afterEach(() => {
    if (real_local) {
      Object.defineProperty(globalThis, "localStorage", real_local);
    }
    if (real_session) {
      Object.defineProperty(globalThis, "sessionStorage", real_session);
    }
  });

  it("round-trips a value through local storage", () => {
    expect(safe_local_set("aster_test_key", "kept")).toBe(true);
    expect(safe_local_get("aster_test_key")).toBe("kept");
    safe_local_remove("aster_test_key");
    expect(safe_local_get("aster_test_key")).toBeNull();
  });

  it("round-trips a value through session storage", () => {
    expect(safe_session_set("aster_test_key", "kept")).toBe(true);
    expect(safe_session_get("aster_test_key")).toBe("kept");
    safe_session_remove("aster_test_key");
    expect(safe_session_get("aster_test_key")).toBeNull();
  });

  it("reads null instead of throwing when the browser blocks site data", () => {
    block("localStorage");
    block("sessionStorage");

    expect(safe_local_get("anything")).toBeNull();
    expect(safe_session_get("anything")).toBeNull();
  });

  it("reports a failed write instead of throwing", () => {
    block("localStorage");
    block("sessionStorage");

    expect(safe_local_set("anything", "value")).toBe(false);
    expect(safe_session_set("anything", "value")).toBe(false);
  });

  it("swallows a blocked remove so cleanup keeps going", () => {
    block("localStorage");
    block("sessionStorage");

    expect(() => safe_local_remove("anything")).not.toThrow();
    expect(() => safe_session_remove("anything")).not.toThrow();
  });

  it("returns no keys when enumeration is blocked", () => {
    block("localStorage");
    block("sessionStorage");

    expect(safe_local_keys()).toEqual([]);
    expect(safe_session_keys()).toEqual([]);
  });

  it("lists every stored key when enumeration works", () => {
    fill("localStorage");
    fill("sessionStorage");

    expect(safe_local_keys()).toEqual(["alpha", "beta"]);
    expect(safe_session_keys()).toEqual(["alpha", "beta"]);
  });

  it("keeps going when only a write is refused", () => {
    fill("localStorage");

    expect(safe_local_set("alpha", "value")).toBe(false);
    expect(safe_local_get("alpha")).toBe("value");
    expect(() => safe_local_remove("alpha")).not.toThrow();
  });
});
