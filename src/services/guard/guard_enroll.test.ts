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
import type { GuardDevice } from "@/services/guard/guard_device";

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  setup: vi.fn(),
  nonce: vi.fn(),
}));

vi.mock("@/services/api/guard", () => ({
  guard_setup: h.setup,
  guard_setup_nonce: h.nonce,
}));
vi.mock("@/services/guard/guard_device", () => ({
  create_guard_device: vi.fn(),
  forget_guard_device: vi.fn(),
  get_guard_device: vi.fn(),
  rekey_guard_device: vi.fn(),
}));

import {
  enroll_guard,
  setup_failure,
  type GuardEnrollDeps,
  type GuardEnrollStep,
} from "@/services/guard/guard_enroll";

const USER_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

function fake_device(): GuardDevice {
  return {
    public_keys: async () => ({
      ed25519_pk: new Uint8Array(32).fill(1),
      mlkem_pk: new Uint8Array(1184).fill(2),
      x25519_pk: new Uint8Array(32).fill(3),
      action_pk: new Uint8Array(33).fill(4),
      device_type: "web",
      name: "Chrome · Windows",
    }),
    device_id: async () => null,
    set_device_id: async () => undefined,
    sign: async () => new Uint8Array(64).fill(5),
    open_seal: async () => new Uint8Array(0),
    open_envelope: async () => new Uint8Array(0),
    store_code_secret: async () => undefined,
    code_secret: async () => null,
    forget: async () => undefined,
  } as unknown as GuardDevice;
}

function deps(patch: Partial<GuardEnrollDeps> = {}): GuardEnrollDeps {
  return {
    create_device: vi.fn(async () => fake_device()),
    get_device: vi.fn(async () => fake_device()),
    rekey_device: vi.fn(async () => undefined),
    forget_device: vi.fn(async () => undefined),
    device_name: () => "Chrome · Windows",
    ...patch,
  };
}

function input(steps: GuardEnrollStep[]) {
  return {
    user_id: USER_ID,
    switches: 1,
    hold_scopes: 1,
    rescue_code: "AAAAA-BBBBB",
    proof: { type: "password" as const, password_hash: "x", totp_code: null },
    on_step: (step: GuardEnrollStep) => steps.push(step),
  };
}

beforeEach(() => {
  h.nonce.mockReset().mockResolvedValue({
    data: { nonce: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
  });
  h.setup.mockReset();
});

describe("enroll_guard", () => {
  it("reports each step in order and keeps the server code on failure", async () => {
    h.setup.mockResolvedValue({
      error: "paused",
      server_code: "GUARD_PAUSED",
      status: 429,
    });
    const steps: GuardEnrollStep[] = [];
    const outcome = await enroll_guard(input(steps), deps());

    expect(steps).toEqual(["keys", "server"]);
    expect(outcome).toEqual({
      kind: "error",
      server_code: "GUARD_PAUSED",
      status: 429,
    });
  });

  it("reaches the device step after the server accepts", async () => {
    h.setup.mockResolvedValue({
      data: { device_id: "d1", code_secret_sealed: "", status: {} },
    });
    const steps: GuardEnrollStep[] = [];
    const outcome = await enroll_guard(
      input(steps),
      deps({
        rekey_device: vi.fn(async () => {
          throw new Error("rekey");
        }),
      }),
    );

    expect(steps).toEqual(["keys", "server", "device"]);
    expect(outcome.kind).toBe("error");
  });

  it("keeps network codes from the nonce request", async () => {
    h.nonce.mockResolvedValue({ error: "offline", code: "NETWORK_ERROR" });
    const steps: GuardEnrollStep[] = [];
    const outcome = await enroll_guard(input(steps), deps());

    expect(steps).toEqual(["keys"]);
    expect(outcome).toEqual({ kind: "error", code: "NETWORK_ERROR" });
  });
});

describe("setup_failure", () => {
  it("maps known codes and keeps the rest", () => {
    expect(setup_failure("GUARD_ALREADY_ON")).toEqual({ kind: "already_on" });
    expect(setup_failure("OTHER", 500)).toEqual({
      kind: "error",
      server_code: "OTHER",
      status: 500,
    });
  });
});
