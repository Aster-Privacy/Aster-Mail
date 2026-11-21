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

const post_mock = vi.fn(async (_path: string, _body: unknown) => ({
  data: { key_id: "key_2", success: true },
}));

vi.mock("./client", () => ({
  api_client: {
    post: (path: string, body: unknown) => post_mock(path, body),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./csrf", () => ({ clear_csrf_cache: vi.fn() }));

vi.mock("@/lib/i18n/translations", () => ({
  get_active_translations: () => ({
    common: {
      security_key_error_canceled: "canceled_text",
      security_key_error_timed_out: "timed_out_text",
      security_key_error_already_registered: "already_registered_text",
      security_key_error_not_supported: "not_supported_text",
      security_key_error_needs_pin: "needs_pin_text",
      security_key_error_not_recognized: "not_recognized_text",
      security_key_error_failed: "failed_text",
    },
    errors: {},
  }),
}));

vi.mock("@/services/crypto/passkey_name", () => ({
  open_passkey_name: async (value: string | null) => value,
  passkey_name_for_server: async (value: string | null) => value,
}));

import {
  build_registration_public_key,
  perform_webauthn_assertion_with_options,
  perform_webauthn_registration,
  type HardwareKeyRegistrationOptions,
} from "./webauthn";
import { SECURITY_KEY_PROMPT_ERROR } from "./webauthn_errors";

const registration_options: HardwareKeyRegistrationOptions = {
  challenge: "AAAA",
  challenge_token: "token",
  rp: { name: "Aster", id: "app.astermail.org" },
  user: { id: "user", name: "fate", displayName: "fate" },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  timeout: 60000,
  attestation: "none",
  authenticatorSelection: {
    residentKey: "discouraged",
    userVerification: "preferred",
  },
};

const assertion_options = {
  challenge: "AAAA",
  challenge_token: "assert_token",
  rpId: "app.astermail.org",
  allowCredentials: [{ type: "public-key", id: "AQID" }],
  timeout: 60000,
  userVerification: "preferred",
};

const fake_credential = {
  rawId: new Uint8Array([1, 2, 3]).buffer,
  type: "public-key",
  response: {
    attestationObject: new Uint8Array([4]).buffer,
    clientDataJSON: new Uint8Array([5]).buffer,
  },
};

const named_error = (name: string) => new DOMException("prompt", name);

describe("build_registration_public_key", () => {
  it("passes the keys already on the account as excluded credentials", () => {
    const public_key = build_registration_public_key({
      ...registration_options,
      excludeCredentials: [
        { type: "public-key", id: "AQID" },
        { type: "public-key", id: "BAUG" },
      ],
    });

    expect(public_key.excludeCredentials).toHaveLength(2);
    expect(
      Array.from(
        new Uint8Array(public_key.excludeCredentials![0].id as ArrayBuffer),
      ),
    ).toEqual([1, 2, 3]);
    expect(
      Array.from(
        new Uint8Array(public_key.excludeCredentials![1].id as ArrayBuffer),
      ),
    ).toEqual([4, 5, 6]);
    expect(public_key.excludeCredentials![0].type).toBe("public-key");
  });

  it("sends an empty exclusion list when the server returns none", () => {
    const public_key = build_registration_public_key(registration_options);

    expect(public_key.excludeCredentials).toEqual([]);
  });

  it("keeps the relying party, timeout, and authenticator selection", () => {
    const public_key = build_registration_public_key(registration_options);

    expect(public_key.rp).toEqual({ name: "Aster", id: "app.astermail.org" });
    expect(public_key.timeout).toBe(60000);
    expect(public_key.attestation).toBe("none");
    expect(public_key.authenticatorSelection).toEqual({
      residentKey: "discouraged",
      userVerification: "preferred",
    });
    expect(public_key.pubKeyCredParams).toEqual([
      { type: "public-key", alg: -7 },
    ]);
  });
});

describe("security key prompts", () => {
  const create_mock = vi.fn();
  const get_mock = vi.fn();
  const original_credentials = Object.getOwnPropertyDescriptor(
    navigator,
    "credentials",
  );

  beforeEach(() => {
    create_mock.mockReset();
    get_mock.mockReset();
    post_mock.mockClear();
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { create: create_mock, get: get_mock },
    });
  });

  afterEach(() => {
    if (original_credentials) {
      Object.defineProperty(navigator, "credentials", original_credentials);
    } else {
      delete (navigator as { credentials?: unknown }).credentials;
    }
  });

  it("completes registration with the new credential", async () => {
    create_mock.mockResolvedValue(fake_credential);

    const result = await perform_webauthn_registration(
      registration_options,
      "Spare key",
    );

    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({ key_id: "key_2", success: true });
    expect(post_mock).toHaveBeenCalledTimes(1);
  });

  it("explains that the key is already on the account", async () => {
    create_mock.mockRejectedValue(named_error("InvalidStateError"));

    const result = await perform_webauthn_registration(
      registration_options,
      null,
    );

    expect(result.error).toBe("already_registered_text");
    expect(result.server_code).toBe(SECURITY_KEY_PROMPT_ERROR);
    expect(post_mock).not.toHaveBeenCalled();
  });

  it("explains a canceled registration prompt", async () => {
    create_mock.mockRejectedValue(named_error("NotAllowedError"));

    const result = await perform_webauthn_registration(
      registration_options,
      null,
    );

    expect(result.error).toBe("canceled_text");
    expect(result.server_code).toBe(SECURITY_KEY_PROMPT_ERROR);
  });

  it("explains a registration prompt that returns nothing", async () => {
    create_mock.mockResolvedValue(null);

    const result = await perform_webauthn_registration(
      registration_options,
      null,
    );

    expect(result.error).toBe("canceled_text");
    expect(result.server_code).toBe(SECURITY_KEY_PROMPT_ERROR);
  });

  it("explains a key that cannot meet the requirements", async () => {
    create_mock.mockRejectedValue(named_error("ConstraintError"));

    const result = await perform_webauthn_registration(
      registration_options,
      null,
    );

    expect(result.error).toBe("needs_pin_text");
  });

  it("explains an unsupported context", async () => {
    create_mock.mockRejectedValue(named_error("NotSupportedError"));

    const result = await perform_webauthn_registration(
      registration_options,
      null,
    );

    expect(result.error).toBe("not_supported_text");
  });

  it("explains a registration prompt that timed out", async () => {
    create_mock.mockRejectedValue(named_error("NotAllowedError"));

    const result = await perform_webauthn_registration(
      { ...registration_options, timeout: 500 },
      null,
    );

    expect(result.error).toBe("timed_out_text");
  });

  it("tells the user to use a key that is already on the account", async () => {
    get_mock.mockRejectedValue(named_error("NotAllowedError"));

    await expect(
      perform_webauthn_assertion_with_options(assertion_options),
    ).rejects.toThrow("not_recognized_text");
  });

  it("limits verification to the keys already on the account", async () => {
    get_mock.mockRejectedValue(named_error("AbortError"));

    await expect(
      perform_webauthn_assertion_with_options(assertion_options),
    ).rejects.toThrow("canceled_text");

    const request = get_mock.mock.calls[0][0] as {
      publicKey: PublicKeyCredentialRequestOptions;
    };

    expect(request.publicKey.allowCredentials).toHaveLength(1);
    expect(
      Array.from(
        new Uint8Array(
          request.publicKey.allowCredentials![0].id as ArrayBuffer,
        ),
      ),
    ).toEqual([1, 2, 3]);
  });
});
