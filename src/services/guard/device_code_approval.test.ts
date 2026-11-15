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

const status_mock = vi.fn();
const challenge_mock = vi.fn();
const device_mock = vi.fn();

vi.mock("@/services/api/guard", () => ({
  GUARD_SWITCH: {
    new_device_approval: 1,
    hold_changes: 2,
    approve_mail_apps: 4,
    recovery_wait: 8,
  },
  get_guard_status: () => status_mock(),
  guard_challenge: () => challenge_mock(),
  guard_step_up_passkey_options: vi.fn(),
}));

vi.mock("@/services/guard/guard_device", () => ({
  get_guard_device: (user_id: string) => device_mock(user_id),
}));

vi.mock("@/services/api/webauthn", () => ({
  perform_webauthn_assertion_with_options: vi.fn(),
}));

import {
  device_code_digest,
  guard_device_code_action,
} from "./device_code_approval";
import {
  base64url_decode,
  base64url_encode,
} from "@/lib/crypto/device_envelope";
import {
  approve_subject,
  build_action_message,
  GUARD_ACTION,
  keys_digest,
} from "@/lib/crypto/guard_action";

const USER = "11111111-1111-4111-8111-111111111111";
const NONCE = base64url_encode(new Uint8Array(32).fill(7));

function keys(action_pk: Uint8Array | null = null) {
  return {
    ed25519_pk: base64url_encode(new Uint8Array(32).fill(1)),
    mlkem_pk: base64url_encode(new Uint8Array(1184).fill(2)),
    x25519_pk: base64url_encode(new Uint8Array(32).fill(3)),
    action_pk: action_pk ? base64url_encode(action_pk) : null,
  };
}

function fake_device() {
  const sign = vi.fn(async () => new Uint8Array(64).fill(5));

  return { sign, device: { sign } as unknown as GuardDevice };
}

describe("guard approval for a device code", () => {
  beforeEach(() => {
    status_mock.mockReset();
    challenge_mock.mockReset();
    device_mock.mockReset();
    challenge_mock.mockResolvedValue({ data: { nonce: NONCE } });
  });

  it("stays out of the way on a server without guard", async () => {
    status_mock.mockResolvedValue({ error: "not found", status: 404 });

    await expect(guard_device_code_action(USER, keys())).resolves.toEqual({
      kind: "off",
    });
    expect(device_mock).not.toHaveBeenCalled();
    expect(challenge_mock).not.toHaveBeenCalled();
  });

  it("stays out of the way when new device approval is off", async () => {
    status_mock.mockResolvedValue({ data: { switches: 2, hold_scopes: 7 } });

    await expect(guard_device_code_action(USER, keys())).resolves.toEqual({
      kind: "off",
    });
    expect(challenge_mock).not.toHaveBeenCalled();
  });

  it("needs an approving device when this one has no guard keys", async () => {
    status_mock.mockResolvedValue({ data: { switches: 1, hold_scopes: 0 } });
    device_mock.mockResolvedValue(null);

    await expect(guard_device_code_action(USER, keys())).resolves.toEqual({
      kind: "needs_approver",
    });
    expect(challenge_mock).not.toHaveBeenCalled();
  });

  it.each([
    ["without an action key", null],
    ["with an action key", new Uint8Array(33).fill(4)],
  ])("signs an approval over the device keys %s", async (_label, action_pk) => {
    status_mock.mockResolvedValue({ data: { switches: 1, hold_scopes: 0 } });
    const { sign, device } = fake_device();

    device_mock.mockResolvedValue(device);
    const input = keys(action_pk);
    const digest = keys_digest(
      new Uint8Array(32).fill(1),
      new Uint8Array(1184).fill(2),
      new Uint8Array(32).fill(3),
      action_pk,
    );

    const result = await guard_device_code_action(USER, {
      ...input,
      keys_digest: base64url_encode(digest),
    });

    expect(result.kind).toBe("signed");
    if (result.kind !== "signed") return;
    expect(base64url_decode(result.action.signature)).toHaveLength(64);
    expect(result.action.nonce).toBe(NONCE);
    expect(result.action.proof).toBeNull();
    expect(device_mock).toHaveBeenCalledWith(USER);
    expect(sign).toHaveBeenCalledWith(
      build_action_message(
        GUARD_ACTION.approve,
        USER,
        base64url_decode(NONCE),
        approve_subject(null, digest, 0),
      ),
    );
    expect(device_code_digest(input)).toEqual(digest);
  });

  it("refuses when the server describes different keys", async () => {
    status_mock.mockResolvedValue({ data: { switches: 1, hold_scopes: 0 } });
    const { sign, device } = fake_device();

    device_mock.mockResolvedValue(device);

    await expect(
      guard_device_code_action(USER, {
        ...keys(),
        keys_digest: base64url_encode(new Uint8Array(32).fill(9)),
      }),
    ).resolves.toEqual({ kind: "keys_mismatch" });
    expect(sign).not.toHaveBeenCalled();
  });
});
