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
import { describe, expect, it } from "vitest";

import {
  describe_link_error,
  keys_failure_detail,
  request_failure_detail,
} from "./desktop_link_error";

class FakeDeviceAuthError extends Error {
  code = "code_generation_failed";
  status: number | undefined;
  constructor(status?: number) {
    super("code_generation_failed");
    this.status = status;
  }
}

const view_for = (detail: string) => describe_link_error(detail);

describe("describe_link_error", () => {
  it("tells a locked keychain apart from a missing one", () => {
    const locked = view_for(
      keys_failure_detail("keychain_unavailable: the keychain could not be read"),
    );
    const missing = view_for(
      keys_failure_detail("keychain_store_failed: storage is unavailable"),
    );

    expect(locked.title_key).toBe("auth.link_keys_locked_title");
    expect(locked.reference).toBe("keys:keychain_unavailable");
    expect(missing.title_key).toBe("auth.link_keys_no_keyring_title");
    expect(missing.reference).toBe("keys:keychain_store_failed");
  });

  it("falls back to a generic key message for any other key failure", () => {
    const view = view_for(keys_failure_detail(new Error("Disk Full at /x/y")));

    expect(view.title_key).toBe("auth.link_keys_failed_title");
    expect(view.action_key).toBe("common.try_again");
    expect(view.reference).toBe("keys:unknown");
  });

  it("reports a code request with no response as offline", () => {
    const view = view_for(request_failure_detail(new FakeDeviceAuthError()));

    expect(view.title_key).toBe("auth.link_code_offline_title");
    expect(view.reference).toBe("request:network");
  });

  it("reports the server status for a rejected code request", () => {
    const limited = view_for(
      request_failure_detail(new FakeDeviceAuthError(429)),
    );
    const rejected = view_for(
      request_failure_detail(new FakeDeviceAuthError(400)),
    );

    expect(limited.title_key).toBe("auth.link_code_rate_limited_title");
    expect(limited.reference).toBe("request:429");
    expect(rejected.title_key).toBe("auth.link_code_failed_title");
    expect(rejected.reference).toBe("request:400");
  });

  it("does not call an unrelated client error a network problem", () => {
    const view = view_for(request_failure_detail(new TypeError("boom")));

    expect(view.title_key).toBe("auth.link_code_failed_title");
    expect(view.reference).toBe("request:client");
  });

  it("keeps the original message for later stages", () => {
    const view = view_for("complete:something broke");

    expect(view.title_key).toBe("auth.link_device_failed");
    expect(view.action_key).toBe("auth.device_code_get_new");
    expect(view.reference).toBe("complete:unknown");
  });

  it("never puts free text into the reference", () => {
    for (const detail of [
      "",
      "garbage",
      "keys:",
      "keys:Keychain Unavailable: Upper",
      "request:<script>",
      "pair:user@example.com",
      `keys:${"a".repeat(200)}`,
    ]) {
      expect(view_for(detail).reference).toMatch(/^[a-z]+:[a-z0-9_]{1,40}$/);
    }
  });
});
