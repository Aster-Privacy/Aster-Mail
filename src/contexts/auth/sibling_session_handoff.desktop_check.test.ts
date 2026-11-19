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

vi.mock("./vault_decryption", () => ({
  decrypt_vault_with_lock: vi.fn(async () => null),
}));
vi.mock("@/services/api/client", () => ({
  api_client: { get_cached_user_info: () => null },
}));
vi.mock("@/services/api/csrf", () => ({
  get_csrf_token_from_cookie: () => null,
}));
vi.mock("@/services/api/auth", () => ({
  verify_auth_status: vi.fn(async () => true),
}));
vi.mock("@/services/app_lock_store", () => ({
  get_app_lock_config: () => null,
}));
vi.mock("@/lib/session_handoff/session_handoff_client", () => ({
  await_sibling_approval: vi.fn(async () => true),
  open_bridge_channel: vi.fn(),
  request_sibling_session: vi.fn(async () => null),
}));

import { sibling_app_origin } from "./sibling_session_handoff";

import {
  CALENDAR_WEB_ORIGIN,
  MAIL_WEB_ORIGIN,
} from "@/lib/session_handoff/session_handoff_protocol";

const globals = window as unknown as Record<string, unknown>;
const window_chain = Object.getPrototypeOf(window) as object;

function expose_on_window_chain(element: HTMLElement): void {
  document.body.appendChild(element);
  const named_value =
    element instanceof HTMLIFrameElement ? element.contentWindow : element;

  Object.defineProperty(window_chain, "__TAURI_INTERNALS__", {
    configurable: true,
    get: () => named_value,
  });
}
const original_location = window.location;

beforeEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(`${MAIL_WEB_ORIGIN}/`),
  });
});

afterEach(() => {
  delete globals.__TAURI_INTERNALS__;
  Reflect.deleteProperty(window_chain, "__TAURI_INTERNALS__");
  document.body.innerHTML = "";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: original_location,
  });
});

describe("sibling_app_origin desktop check", () => {
  it("offers the sibling app on the web", () => {
    expect(sibling_app_origin()).toBe(CALENDAR_WEB_ORIGIN);
  });

  it("keeps the sibling app when a page element is named after the desktop global", () => {
    const anchor = document.createElement("a");

    anchor.setAttribute("name", "__TAURI_INTERNALS__");
    expose_on_window_chain(anchor);

    expect(sibling_app_origin()).toBe(CALENDAR_WEB_ORIGIN);
  });

  it("keeps the sibling app when a frame is named after the desktop global", () => {
    const frame = document.createElement("iframe");

    frame.setAttribute("name", "__TAURI_INTERNALS__");
    expose_on_window_chain(frame);

    expect(sibling_app_origin()).toBe(CALENDAR_WEB_ORIGIN);
  });

  it("offers no sibling app inside the desktop runtime", () => {
    globals.__TAURI_INTERNALS__ = { invoke: () => undefined };

    expect(sibling_app_origin()).toBe(null);
  });
});
