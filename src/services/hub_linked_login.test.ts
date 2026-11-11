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
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fingerprint_of_encoded_device_keys } from "@/lib/crypto/device_fingerprint";

const state = vi.hoisted(() => ({
  request: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/native/desktop_device_auth", () => ({
  request_device_code: state.request,
  poll_device_code_status: vi.fn(),
  device_challenge: vi.fn(),
  device_login: vi.fn(),
}));

vi.mock("@/services/account_hub_link", () => {
  class HubAccountError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }

  return { HubAccountError, confirm_hub_link: state.confirm };
});

const { sign_in_with_hub_account } = await import("./hub_linked_login");

describe("hub linked sign-in", () => {
  beforeEach(() => {
    state.request.mockReset();
    state.confirm.mockReset();
    state.request.mockResolvedValue({ code: "ABCD2345", expires_in: 600 });
    state.confirm.mockRejectedValue(new Error("stop"));
  });

  it("sends the fingerprint of the keys it generated with the link request", async () => {
    await expect(sign_in_with_hub_account("acct_a", "Mail")).rejects.toThrow(
      "stop",
    );

    const keys = state.request.mock.calls[0][0];
    const fingerprint = fingerprint_of_encoded_device_keys(keys);

    expect(fingerprint).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){4}$/);
    expect(state.confirm).toHaveBeenCalledWith(
      "ABCD2345",
      "acct_a",
      fingerprint,
    );
  });
});
