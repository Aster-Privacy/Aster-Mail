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
import type { StepUpHardwareKeyAssertion } from "./webauthn";

import { describe, it, expect, vi, beforeEach } from "vitest";

import { to_reauth_proof } from "./step_up";
import { api_client } from "./client";
import { verify_codes_step_up } from "./recovery";
import { remove_recovery_email } from "./recovery_email";

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const assertion: StepUpHardwareKeyAssertion = {
  raw_id: "cred",
  response: {
    authenticator_data: "auth",
    client_data_json: "client",
    signature: "sig",
  },
  challenge_token: "token",
};

describe("re-auth proof carries every enrolled factor", () => {
  beforeEach(() => {
    vi.mocked(api_client.post)
      .mockReset()
      .mockResolvedValue({ data: {} } as never);
    vi.mocked(api_client.delete)
      .mockReset()
      .mockResolvedValue({ data: { success: true } } as never);
  });

  it("keeps the security key assertion in the proof", () => {
    expect(
      to_reauth_proof({
        password_hash: "PWHASH",
        hardware_key_assertion: assertion,
      }),
    ).toEqual({ password_hash: "PWHASH", hardware_key_assertion: assertion });
  });

  it("keeps the authenticator code in the proof", () => {
    expect(
      to_reauth_proof({ password_hash: "PWHASH", totp_code: "123456" }),
    ).toEqual({ password_hash: "PWHASH", totp_code: "123456" });
  });

  it("sends the security key assertion when removing the recovery email", async () => {
    await remove_recovery_email({
      password_hash: "PWHASH",
      hardware_key_assertion: assertion,
    });

    expect(vi.mocked(api_client.delete)).toHaveBeenCalledWith(
      "/core/v1/recovery/email",
      {
        data: { password_hash: "PWHASH", hardware_key_assertion: assertion },
      },
    );
  });

  it("sends the security key assertion when opening recovery codes", async () => {
    await (
      verify_codes_step_up as (...args: unknown[]) => Promise<unknown>
    )("PWHASH", undefined, assertion);

    expect(vi.mocked(api_client.post)).toHaveBeenCalledWith(
      "/core/v1/recovery/codes/verify-step-up",
      expect.objectContaining({ hardware_key_assertion: assertion }),
    );
  });
});
