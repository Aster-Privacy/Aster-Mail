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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/crypto/memory_key_store", () => ({
  clear_vault_from_memory: () => undefined,
}));

import { is_desktop } from "@/native/invoke_bridge";
import {
  check_session_expired,
  stop_session_timeout,
} from "@/services/session_timeout_service";

const ACCOUNT = "acct-dom";
const MINUTE = 60 * 1000;
const globals = window as unknown as Record<string, unknown>;
const window_chain = Object.getPrototypeOf(window) as object;

function enable_timeout(minutes: number): void {
  localStorage.setItem(
    "astermail_session_timeout_config",
    JSON.stringify({ enabled: true, timeout_minutes: minutes }),
  );
  localStorage.setItem("astermail_session_timeout_migrated_v2", "1");
  localStorage.setItem(
    `astermail_last_activity_${ACCOUNT}`,
    String(Date.now() - (minutes + 1) * MINUTE),
  );
}

function shadow_global_with_element(name: string): void {
  const element = document.createElement("img");

  element.setAttribute("name", name);
  document.body.appendChild(element);
  Object.defineProperty(window_chain, name, {
    configurable: true,
    get: () => element,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  stop_session_timeout();
  delete globals.__TAURI_INTERNALS__;
  delete globals.__TAURI__;
  Reflect.deleteProperty(window_chain, "__TAURI_INTERNALS__");
  Reflect.deleteProperty(window_chain, "__TAURI__");
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("desktop detection with page elements named after desktop globals", () => {
  it("stays on the web path when an element shadows the internals global", () => {
    shadow_global_with_element("__TAURI_INTERNALS__");

    expect(is_desktop()).toBe(false);
  });

  it("stays on the web path when an element shadows the public global", () => {
    shadow_global_with_element("__TAURI__");

    expect(is_desktop()).toBe(false);
  });

  it("still enforces the idle timeout when an element shadows the global", () => {
    enable_timeout(5);
    shadow_global_with_element("__TAURI_INTERNALS__");

    expect(check_session_expired(ACCOUNT)).toBe(true);
  });

  it("recognizes the real desktop runtime object", () => {
    globals.__TAURI_INTERNALS__ = { invoke: () => undefined };

    expect(is_desktop()).toBe(true);
  });
});
