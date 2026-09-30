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

  it("does not let a higher-timestamp cookie override the cached token", () => {
    const cached = "session-a:1000000000.real_sig";
    const injected = "attacker:2000000000.forged_sig";

    set_csrf_token(cached);
    set_document_cookie(`csrf_token=${injected}`);

    expect(get_csrf_token_from_cookie()).toBe(cached);
  });

  it("ignores duplicate injected cookies once a token is cached", () => {
    const cached = "session-a:1000000000.real_sig";

    set_csrf_token(cached);
    set_document_cookie(
      "csrf_token=attacker:2000000000.a; csrf_token=attacker:3000000000.b",
    );

    expect(get_csrf_token_from_cookie()).toBe(cached);
  });

  it("adopts a rotated token from the response body over an older cache", () => {
    const before_rotation = "session-a:1000000000.old_sig";
    const after_rotation = "session-a:2000000000.new_sig";

    set_csrf_token(before_rotation);
    set_csrf_token(after_rotation);

    expect(get_csrf_token_from_cookie()).toBe(after_rotation);
  });

  it("keeps returning unparseable tokens unchanged", () => {
    set_document_cookie("csrf_token=opaque_value");
    expect(get_csrf_token_from_cookie()).toBe("opaque_value");
  });
});
