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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const complete_mock = vi.fn(async (request: unknown) => ({
  data: { key_id: "key_1", success: true },
  request,
}));

vi.mock("./webauthn", () => ({
  initiate_hardware_key_registration: vi.fn(),
  complete_hardware_key_registration: (request: unknown) =>
    complete_mock(request),
}));

vi.mock("./client", () => ({
  api_client: { post: vi.fn(async () => ({ data: {} })) },
}));

vi.mock("./csrf", () => ({ clear_csrf_cache: vi.fn() }));

vi.mock("@/lib/i18n/translations", () => ({
  get_active_translations: () => ({
    passkeys: {
      unnamed_passkey: "Passkey",
      unnamed_security_key: "Hardware key",
    },
    errors: {},
  }),
}));

vi.mock("@/services/crypto/passkey_prf_wrap", () => ({
  assertion_verified_user: () => false,
  seal_passphrase_with_prf: vi.fn(),
}));

import { register_platform_passkey } from "./passkeys";

const registration_options = {
  challenge: "AAAA",
  challenge_token: "token",
  rp: { name: "Aster", id: "app.astermail.org" },
  user: { id: "user", name: "fate", displayName: "fate" },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  timeout: 60000,
  attestation: "none",
  authenticatorSelection: {
    residentKey: "required",
    userVerification: "required",
  },
};

const fake_credential = {
  rawId: new Uint8Array([1, 2, 3]).buffer,
  type: "public-key",
  response: {
    attestationObject: new Uint8Array([4]).buffer,
    clientDataJSON: new Uint8Array([5]).buffer,
    getTransports: () => ["hybrid"],
  },
};

type CreateCall = {
  publicKey: Record<string, unknown> & {
    authenticatorSelection: Record<string, unknown>;
  };
};

describe("register_platform_passkey authenticator choice", () => {
  const create_mock = vi.fn(async () => fake_credential);
  const uvpaa = { value: false };
  const original_credentials = Object.getOwnPropertyDescriptor(
    navigator,
    "credentials",
  );
  const original_public_key_credential = (
    window as { PublicKeyCredential?: unknown }
  ).PublicKeyCredential;

  beforeEach(() => {
    create_mock.mockClear();
    complete_mock.mockClear();
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { create: create_mock, get: vi.fn() },
    });
    (window as { PublicKeyCredential?: unknown }).PublicKeyCredential = {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => uvpaa.value,
    };
    (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = (
      window as { PublicKeyCredential?: unknown }
    ).PublicKeyCredential;
  });

  afterEach(() => {
    if (original_credentials) {
      Object.defineProperty(navigator, "credentials", original_credentials);
    }
    (window as { PublicKeyCredential?: unknown }).PublicKeyCredential =
      original_public_key_credential;
    (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential =
      original_public_key_credential;
  });

  const last_create_call = () =>
    (create_mock.mock.calls.at(-1) as unknown as [CreateCall])[0];

  it("lets any authenticator answer when the device has no platform authenticator", async () => {
    uvpaa.value = false;

    const result = await register_platform_passkey(
      null,
      undefined,
      registration_options,
    );

    expect(result.data?.success).toBe(true);
    const { publicKey } = last_create_call();

    expect(
      publicKey.authenticatorSelection.authenticatorAttachment,
    ).toBeUndefined();
    expect(publicKey.authenticatorSelection.residentKey).toBe("required");
    expect(publicKey.hints).toBeUndefined();
  });

  it("keeps preferring the device when a platform authenticator is present", async () => {
    uvpaa.value = true;

    await register_platform_passkey(null, undefined, registration_options);
    const { publicKey } = last_create_call();

    expect(publicKey.authenticatorSelection.authenticatorAttachment).toBe(
      "platform",
    );
    expect(publicKey.hints).toEqual(["client-device"]);
  });

  it("registers a credential made elsewhere as a passkey", async () => {
    uvpaa.value = false;

    await register_platform_passkey(null, undefined, registration_options);

    expect(complete_mock).toHaveBeenCalledWith(
      expect.objectContaining({ is_passkey: true }),
    );
  });
});
