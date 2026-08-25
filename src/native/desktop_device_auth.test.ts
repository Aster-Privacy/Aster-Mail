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

const invoke_mock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invoke_mock(cmd, args),
}));

const post_mock = vi.fn();

vi.mock("@/services/api/client", () => ({
  api_client: {
    post: (path: string, body: unknown) => post_mock(path, body),
    set_dev_token: vi.fn(),
    set_csrf: vi.fn(),
    set_authenticated: vi.fn(),
  },
}));

const device_state = {
  device_id: null as string | null,
  identity: "identity-a",
};

function install_tauri(): void {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

beforeEach(() => {
  vi.resetModules();
  invoke_mock.mockReset();
  post_mock.mockReset();
  device_state.device_id = "device-1";
  device_state.identity = "identity-a";
  install_tauri();

  invoke_mock.mockImplementation((cmd: string) => {
    if (cmd === "device_get_pubkeys") {
      return Promise.resolve({
        device_id: device_state.device_id,
        ed25519_pk: device_state.identity,
        mlkem_pk: "mlkem",
        x25519_pk: "x25519",
        machine_name: "machine",
      });
    }
    if (cmd === "device_clear_session") {
      device_state.device_id = null;

      return Promise.resolve();
    }
    if (cmd === "device_clear_identity") {
      device_state.device_id = null;
      device_state.identity = "identity-b";

      return Promise.resolve();
    }
    if (cmd === "device_sign_challenge") return Promise.resolve("signature");
    if (cmd === "device_get_stored_passphrase") {
      return Promise.resolve("cGFzcw");
    }

    return Promise.resolve(null);
  });

  post_mock.mockImplementation((path: string) => {
    if (path === "/core/v1/auth/device/challenge") {
      return Promise.resolve({
        data: { challenge_id: "challenge-1", nonce: "nonce" },
        error: null,
      });
    }
    if (path === "/core/v1/auth/device/login") {
      return Promise.resolve({
        data: { access_token: "token", csrf_token: "csrf" },
        error: null,
      });
    }

    return Promise.resolve({ data: null, error: "unexpected" });
  });
});

describe("desktop device session lifecycle", () => {
  it("signs in silently while a device session is stored", async () => {
    const module = await import("./desktop_device_auth");
    const events: string[] = [];
    const listener = () => events.push("success");

    window.addEventListener("astermail:device-login-success", listener);
    await module.init_desktop_device_auth();
    window.removeEventListener("astermail:device-login-success", listener);

    expect(events).toEqual(["success"]);
  });

  it("does not sign back in after the device session is cleared", async () => {
    const module = await import("./desktop_device_auth");

    await module.init_desktop_device_auth();
    await module.clear_device_session();

    const events: string[] = [];
    const success = () => events.push("success");
    const pairing = () => events.push("pairing");

    window.addEventListener("astermail:device-login-success", success);
    window.addEventListener("astermail:device-needs-pairing", pairing);
    await module.init_desktop_device_auth();
    window.removeEventListener("astermail:device-login-success", success);
    window.removeEventListener("astermail:device-needs-pairing", pairing);

    expect(events).toEqual(["pairing"]);
  });

  it("drops the stored passphrase when the session is cleared", async () => {
    const module = await import("./desktop_device_auth");

    await module.init_desktop_device_auth();
    await module.clear_device_session();

    expect(module.consume_pending_device_login()).toBeNull();
  });

  it("rotates the device identity when the identity is cleared", async () => {
    const module = await import("./desktop_device_auth");

    await module.init_desktop_device_auth();
    await module.clear_device_identity();

    const events: string[] = [];

    window.addEventListener("astermail:device-needs-pairing", ((
      event: Event,
    ) => {
      const detail = (event as CustomEvent<{ pubkeys: { ed25519_pk: string } }>)
        .detail;

      events.push(detail.pubkeys.ed25519_pk);
    }) as EventListener);
    await module.init_desktop_device_auth();

    expect(events).toEqual(["identity-b"]);
    expect(invoke_mock).toHaveBeenCalledWith(
      "device_clear_identity",
      undefined,
    );
  });
});
