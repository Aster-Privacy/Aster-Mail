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

import {
  CSRF_WAIT_POLL_MS,
  clear_csrf_cache,
  set_csrf_token,
  wait_for_csrf_token,
} from "./csrf";

let cookie_value = "";

describe("wait_for_csrf_token", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cookie_value = "";
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => cookie_value,
    });
    clear_csrf_cache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a token that is already there", async () => {
    set_csrf_token("ready");

    await expect(wait_for_csrf_token(3000)).resolves.toBe("ready");
  });

  it("wakes up as soon as a token is stored", async () => {
    const waiting = wait_for_csrf_token(3000);

    set_csrf_token("stored_later");

    await expect(waiting).resolves.toBe("stored_later");
  });

  it("picks up a cookie that appears while waiting", async () => {
    const waiting = wait_for_csrf_token(3000);

    cookie_value = "csrf_token=from_cookie";
    await vi.advanceTimersByTimeAsync(CSRF_WAIT_POLL_MS);

    await expect(waiting).resolves.toBe("from_cookie");
  });

  it("gives up with null once the wait runs out", async () => {
    const waiting = wait_for_csrf_token(500);

    await vi.advanceTimersByTimeAsync(500);

    await expect(waiting).resolves.toBeNull();
  });

  it("does not wait at all with no time allowed", async () => {
    await expect(wait_for_csrf_token(0)).resolves.toBeNull();
  });
});
