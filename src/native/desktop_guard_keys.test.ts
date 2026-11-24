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

const invoke_mock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invoke_mock(cmd, args),
}));

const records = new Map<string, unknown>();

vi.mock("@/services/crypto/guard_key_store", () => ({
  read_guard_record: async (user_id: string) => records.get(user_id) ?? null,
  write_guard_record: async (record: { user_id: string }) => {
    records.set(record.user_id, record);
  },
  delete_guard_record: async (user_id: string) => {
    records.delete(user_id);
  },
}));

vi.mock("@/services/crypto/device_key_store", () => ({
  get_device_wrap_key: async () => null,
}));

import {
  create_desktop_guard_device,
  get_desktop_guard_device,
} from "./desktop_guard_keys";
import { get_guard_device } from "@/services/guard/guard_device";
import { base64url_encode } from "@/lib/crypto/device_envelope";

const USER = "11111111-1111-4111-8111-111111111111";
const ED = new Uint8Array(32).fill(1);
const MLKEM = new Uint8Array(1184).fill(2);
const X = new Uint8Array(32).fill(3);

function pubkeys(x = X) {
  return {
    device_id: null,
    ed25519_pk: base64url_encode(ED),
    mlkem_pk: base64url_encode(MLKEM),
    x25519_pk: base64url_encode(x),
    machine_name: "Desk",
  };
}

describe("desktop guard keys", () => {
  beforeEach(() => {
    records.clear();
    invoke_mock.mockReset();
    invoke_mock.mockImplementation(async (cmd: string) => {
      if (cmd === "device_get_pubkeys") return pubkeys();
      if (cmd === "device_open_guard_seal") return base64url_encode(Uint8Array.of(9, 8, 7));
      throw new Error(cmd);
    });
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("returns the native keys plus a WebCrypto action key", async () => {
    const device = await create_desktop_guard_device(USER, "Desk");
    const pub = await device.public_keys();

    expect(Array.from(pub.ed25519_pk)).toEqual(Array.from(ED));
    expect(Array.from(pub.mlkem_pk)).toEqual(Array.from(MLKEM));
    expect(Array.from(pub.x25519_pk)).toEqual(Array.from(X));
    expect(pub.action_pk.length).toBe(33);
    expect(pub.device_type).toBe("desktop");
    expect(records.get(USER)).toMatchObject({ wrapped_secrets: null });
  });

  it("signs with the action key, not the native key", async () => {
    const device = await create_desktop_guard_device(USER, "Desk");
    const signature = await device.sign(Uint8Array.of(1, 2, 3));

    expect(signature.length).toBe(64);
    expect(invoke_mock.mock.calls.map((c) => c[0])).not.toContain(
      "device_sign_challenge",
    );
  });

  it("opens seals through the native command", async () => {
    const device = await create_desktop_guard_device(USER, "Desk");
    const sealed = Uint8Array.of(1, 2);
    const aad = Uint8Array.of(3, 4);
    const opened = await device.open_seal(sealed, aad);

    expect(Array.from(opened)).toEqual([9, 8, 7]);
    expect(invoke_mock).toHaveBeenCalledWith("device_open_guard_seal", {
      sealedB64: base64url_encode(sealed),
      aadB64: base64url_encode(aad),
    });
  });

  it("drops the record when the native keys changed", async () => {
    await create_desktop_guard_device(USER, "Desk");
    invoke_mock.mockImplementation(async () => pubkeys(new Uint8Array(32).fill(4)));
    expect(await get_desktop_guard_device(USER)).toBeNull();
  });

  it("is chosen by get_guard_device inside the desktop app", async () => {
    await create_desktop_guard_device(USER, "Desk");
    const device = await get_guard_device(USER);

    expect(device).not.toBeNull();
    expect((await device!.public_keys()).device_type).toBe("desktop");
  });
});
