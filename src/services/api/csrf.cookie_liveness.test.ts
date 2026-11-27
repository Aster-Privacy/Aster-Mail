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
import { beforeEach, describe, expect, it } from "vitest";

import {
  clear_csrf_cache,
  csrf_cookie_went_missing,
  get_csrf_token_from_cookie,
  set_csrf_token,
} from "./csrf";

function set_document_cookie(value: string): void {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => value,
  });
}

describe("csrf_cookie_went_missing", () => {
  beforeEach(() => {
    clear_csrf_cache();
  });

  it("stays quiet while this tab has never seen the cookie", () => {
    set_document_cookie("");
    set_csrf_token("session-a:1000.from_body");

    expect(csrf_cookie_went_missing()).toBe(false);
  });

  it("reports nothing while the cookie is present", () => {
    set_document_cookie("csrf_token=session-a:1000.live");

    expect(get_csrf_token_from_cookie()).toBe("session-a:1000.live");
    expect(csrf_cookie_went_missing()).toBe(false);
  });

  it("reports a cookie that expired after this tab saw it", () => {
    set_document_cookie("csrf_token=session-a:1000.live");
    get_csrf_token_from_cookie();
    set_document_cookie("other=1");

    expect(csrf_cookie_went_missing()).toBe(true);
    expect(get_csrf_token_from_cookie()).toBe("session-a:1000.live");
  });

  it("stops reporting once the cookie comes back", () => {
    set_document_cookie("");
    expect(csrf_cookie_went_missing()).toBe(true);

    set_document_cookie("csrf_token=session-a:2000.renewed");
    expect(csrf_cookie_went_missing()).toBe(false);
  });
});
