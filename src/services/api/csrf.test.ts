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
  get_csrf_token_from_cookie,
  set_csrf_token,
} from "./csrf";

function set_document_cookie(value: string): void {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => value,
  });
}

describe("get_csrf_token_from_cookie", () => {
  beforeEach(() => {
    clear_csrf_cache();
    set_document_cookie("");
  });

  it("reads the cookie when no token is cached", () => {
    set_document_cookie("csrf_token=from_cookie");
    expect(get_csrf_token_from_cookie()).toBe("from_cookie");
  });

  it("prefers a freshly cached token over a stale duplicate cookie", () => {
    set_document_cookie("csrf_token=stale_duplicate; csrf_token=other");
    set_csrf_token("fresh_from_refresh");
    expect(get_csrf_token_from_cookie()).toBe("fresh_from_refresh");
  });

  it("falls back to the cookie again after the cache is cleared", () => {
    set_csrf_token("fresh_from_refresh");
    clear_csrf_cache();
    set_document_cookie("csrf_token=from_cookie");
    expect(get_csrf_token_from_cookie()).toBe("from_cookie");
  });
});
