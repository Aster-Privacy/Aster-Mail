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
import type { GuardDevice } from "@/services/guard/guard_device";

import { beforeEach, describe, expect, it, vi } from "vitest";

const challenge_mock = vi.fn();
const passkey_options_mock = vi.fn();
const assertion_mock = vi.fn();

vi.mock("@/services/api/guard", () => ({
  guard_challenge: () => challenge_mock(),
  guard_step_up_passkey_options: () => passkey_options_mock(),
}));

vi.mock("@/services/api/webauthn", () => ({
  perform_passkey_assertion_with_options: (options: unknown) =>
    assertion_mock(options),
}));

import {
  build_step_up_proof,
  GuardActionError,
  passkey_step_up_proof,
  sign_guard_action,
} from "./sign_action";
import {
  base64url_decode,
  base64url_encode,
} from "@/lib/crypto/device_envelope";
import {
  build_action_message,
  GUARD_ACTION,
  id_subject,
} from "@/lib/crypto/guard_action";

const USER = "11111111-1111-4111-8111-111111111111";
const REQUEST = "22222222-2222-4222-8222-222222222222";

function fake_device() {
  const sign = vi.fn(async (message: Uint8Array) => {
    const out = new Uint8Array(64);

    out.set(message.subarray(message.length - 32));

    return out;
  });

  return { sign, device: { sign } as unknown as GuardDevice };
}

function nonce(fill: number): string {
  return base64url_encode(new Uint8Array(32).fill(fill));
}

const ASSERTION = {
  raw_id: "a",
  response: { authenticator_data: "b", client_data_json: "c", signature: "d" },
  challenge_token: "e",
};

describe("sign_guard_action", () => {
  beforeEach(() => {
    challenge_mock.mockReset();
    passkey_options_mock.mockReset();
    assertion_mock.mockReset();
  });

  it("fetches a fresh challenge for every action", async () => {
    challenge_mock
      .mockResolvedValueOnce({ data: { nonce: nonce(1), expires_at: "x" } })
      .mockResolvedValueOnce({ data: { nonce: nonce(2), expires_at: "x" } });
    const { sign, device } = fake_device();
    const subject = id_subject(REQUEST);

    const first = await sign_guard_action(device, USER, GUARD_ACTION.deny, subject);
    const second = await sign_guard_action(device, USER, GUARD_ACTION.deny, subject);

    expect(challenge_mock).toHaveBeenCalledTimes(2);
    expect(first.nonce).not.toBe(second.nonce);
    expect(sign.mock.calls[0][0]).not.toEqual(sign.mock.calls[1][0]);
  });

  it("signs the action message built from the challenge", async () => {
    challenge_mock.mockResolvedValue({ data: { nonce: nonce(7), expires_at: "x" } });
    const { sign, device } = fake_device();
    const subject = id_subject(REQUEST);
    const action = await sign_guard_action(device, USER, GUARD_ACTION.skip, subject);

    expect(Array.from(sign.mock.calls[0][0])).toEqual(
      Array.from(
        build_action_message(
          GUARD_ACTION.skip,
          USER,
          base64url_decode(nonce(7)),
          subject,
        ),
      ),
    );
    expect(base64url_decode(action.signature).length).toBe(64);
    expect(action.proof).toBeNull();
  });

  it("carries the step-up proof", async () => {
    challenge_mock.mockResolvedValue({ data: { nonce: nonce(3), expires_at: "x" } });
    const { device } = fake_device();
    const proof = { type: "password" as const, password_hash: "h", totp_code: null };
    const action = await sign_guard_action(
      device,
      USER,
      GUARD_ACTION.enroll,
      new Uint8Array(32),
      proof,
    );

    expect(action.proof).toEqual(proof);
  });

  it("rejects without signing when the challenge fails", async () => {
    challenge_mock.mockResolvedValue({
      error: "forbidden",
      server_code: "GUARD_DEVICE_REQUIRED",
      status: 403,
    });
    const { sign, device } = fake_device();
    const result = sign_guard_action(device, USER, GUARD_ACTION.veto, new Uint8Array(32));

    await expect(result).rejects.toBeInstanceOf(GuardActionError);
    await expect(result).rejects.toMatchObject({
      server_code: "GUARD_DEVICE_REQUIRED",
      status: 403,
    });
    expect(sign).not.toHaveBeenCalled();
  });
});

describe("step-up proofs", () => {
  it("builds a password proof", () => {
    expect(build_step_up_proof({ password_hash: "h", totp_code: "123456" })).toEqual({
      type: "password",
      password_hash: "h",
      totp_code: "123456",
    });
    expect(build_step_up_proof({ password_hash: "h" })).toEqual({
      type: "password",
      password_hash: "h",
      totp_code: null,
    });
  });

  it("prefers a hardware key assertion", () => {
    expect(
      build_step_up_proof({ password_hash: "h", hardware_key_assertion: ASSERTION }),
    ).toEqual({ type: "hardware_key", assertion: ASSERTION });
  });

  it("uses the guard passkey options for a passkey proof", async () => {
    passkey_options_mock.mockResolvedValue({ data: { challenge: "c" } });
    assertion_mock.mockResolvedValue(ASSERTION);

    await expect(passkey_step_up_proof()).resolves.toEqual({
      type: "passkey",
      assertion: ASSERTION,
    });
    expect(assertion_mock).toHaveBeenCalledWith({ challenge: "c" });
  });
});
