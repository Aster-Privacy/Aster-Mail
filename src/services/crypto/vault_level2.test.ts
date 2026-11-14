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
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  VAULT_KDF_ITERATIONS_LEGACY,
  VAULT_KDF_ITERATIONS_LEVEL2,
  ENVELOPE_V2_ADMISSION_PATH,
  get_level2_admission,
  known_vault_kdf_iterations,
  get_current_vault_iterations,
  mark_level2_admitted,
  note_opened_vault_iterations,
  note_vault_written,
  record_vault_iterations_from_response,
  request_level2_admission,
  reset_level2_admission,
  reset_level2_state,
  vault_kdf_attempt_order,
  vault_write_iterations,
  write_vault_at_level,
} from "./vault_level2";
import { decrypt_vault, encrypt_vault } from "./key_manager";

const PASSWORD = "correct horse battery staple";
const VAULT_NONCE = "MDEyMzQ1Njc4OTo7";
const VAULT_600K_NO_AAD =
  "EBESExQVFhcYGRobHB0eHzSa66nA+rHMINpdiOTpkjSCLhwwf3wsJL83mK7tmNaM7vJPzgxj+NUyvRlcWDdrwRNULF7InqurSUTICamu5KacrQS2IjGLyOnx9LZ0MC2EoKMAMr5335JJHdmKF1VwBXA=";
const VAULT_600K_AAD =
  "EBESExQVFhcYGRobHB0eHzSa66nA+rHMINpdiOTpkjSCLhwwf3wsJL83mK7tmNaM7vJPzgxj+NUyvRlcWDdrwRNULF7InqurSUTICamu5KacrQS2IjGLyOnx9LZ0MC2EoHqqTrmesmoHLQ6kNpv6xHU=";
const VAULT_310K_NO_AAD =
  "EBESExQVFhcYGRobHB0eH50xxkcJB5SCtgtwRihOGlJpA8baPelSa7kLsGCC/XD/WniEAFD+wtkjtM9nC5jHqjiir62dXVYDU2og79rnDzdr682La1IW1eHEi6OMTTtMkITkVo8ts1yICXjRFG6sx9o=";
const DATA_KEK = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";

beforeEach(() => {
  reset_level2_state();
});

describe("vault work factor vectors", () => {
  it.each([
    ["600k without AAD", VAULT_600K_NO_AAD],
    ["600k with AAD", VAULT_600K_AAD],
    ["310k without AAD", VAULT_310K_NO_AAD],
  ])("opens the %s vector", async (_label, encrypted) => {
    const vault = await decrypt_vault(encrypted, VAULT_NONCE, PASSWORD);

    expect(vault.identity_key).toBe("test");
    expect(vault.data_kek).toBe(DATA_KEK);
  }, 30_000);

  it("records the work factor that opened a vault", async () => {
    await decrypt_vault(VAULT_600K_NO_AAD, VAULT_NONCE, PASSWORD);

    expect(known_vault_kdf_iterations(VAULT_600K_NO_AAD)).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
  }, 30_000);

  it("uses the server hint before trying the other work factor", async () => {
    record_vault_iterations_from_response({
      vault: { encrypted_vault: VAULT_600K_AAD, vault_kdf_iterations: 600000 },
    });

    expect(vault_kdf_attempt_order(VAULT_600K_AAD)).toEqual([
      VAULT_KDF_ITERATIONS_LEVEL2,
      VAULT_KDF_ITERATIONS_LEGACY,
    ]);

    record_vault_iterations_from_response({
      encrypted_vault: VAULT_310K_NO_AAD,
      vault_kdf_iterations: null,
    });

    expect(known_vault_kdf_iterations(VAULT_310K_NO_AAD)).toBe(
      VAULT_KDF_ITERATIONS_LEGACY,
    );
  });

  it("round trips a vault sealed at the higher work factor", async () => {
    const sealed = await encrypt_vault(
      { identity_key: "round", data_kek: DATA_KEK } as never,
      PASSWORD,
      VAULT_KDF_ITERATIONS_LEVEL2,
    );

    reset_level2_state();

    const opened = await decrypt_vault(
      sealed.encrypted_vault,
      sealed.vault_nonce,
      PASSWORD,
    );

    expect(opened.identity_key).toBe("round");
  }, 30_000);
});

describe("level 2 admission", () => {
  it("records admission from the envelope endpoint", async () => {
    const post = vi.fn().mockResolvedValue({
      data: { level2_admitted: true, storage_rekey_level: 2 },
    });

    expect(await request_level2_admission({ post })).toBe("admitted");
    expect(post).toHaveBeenCalledWith(ENVELOPE_V2_ADMISSION_PATH);
    expect(vault_write_iterations()).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
  });

  it("records a refusal and keeps the lower work factor", async () => {
    const post = vi.fn().mockResolvedValue({
      error: "x",
      status: 409,
      server_code: "VAULT_LEVEL2_NOT_ADMITTED",
    });

    expect(await request_level2_admission({ post })).toBe("refused");
    expect(vault_write_iterations()).toBe(VAULT_KDF_ITERATIONS_LEGACY);
  });

  it("keeps the higher work factor once a vault is at 600k", () => {
    record_vault_iterations_from_response({
      encrypted_vault: "current",
      vault_kdf_iterations: 600000,
    });

    expect(get_level2_admission()).toBe("unknown");
    expect(vault_write_iterations("current")).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
    expect(vault_write_iterations("other")).toBe(VAULT_KDF_ITERATIONS_LEGACY);
  });

  it("never lowers an opened 600k vault while admission is unknown", () => {
    note_opened_vault_iterations(VAULT_KDF_ITERATIONS_LEVEL2);

    expect(get_level2_admission()).toBe("unknown");
    expect(vault_write_iterations()).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
    expect(vault_write_iterations("unseen")).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
  });

  it("never lowers a written 600k vault after a refusal", async () => {
    note_vault_written(
      { encrypted_vault: "written", vault_nonce: "n" },
      VAULT_KDF_ITERATIONS_LEVEL2,
    );

    const post = vi.fn().mockResolvedValue({
      error: "x",
      status: 409,
      server_code: "VAULT_LEVEL2_NOT_ADMITTED",
    });

    expect(await request_level2_admission({ post })).toBe("refused");
    expect(vault_write_iterations()).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
    expect(vault_write_iterations("written")).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
  });

  it("follows a server-mandated fallback to 310k", () => {
    note_vault_written(
      { encrypted_vault: "high", vault_nonce: "n" },
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
    note_vault_written(
      { encrypted_vault: "low", vault_nonce: "n" },
      VAULT_KDF_ITERATIONS_LEGACY,
    );

    expect(vault_write_iterations()).toBe(VAULT_KDF_ITERATIONS_LEGACY);
  });

  it("does not let a later 310k open lower a known 600k vault", () => {
    note_opened_vault_iterations(VAULT_KDF_ITERATIONS_LEVEL2);
    note_opened_vault_iterations(VAULT_KDF_ITERATIONS_LEGACY);

    expect(get_current_vault_iterations()).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
  });

  it("forgets the current vault work factor on a full reset", () => {
    note_opened_vault_iterations(VAULT_KDF_ITERATIONS_LEVEL2);
    reset_level2_state();

    expect(get_current_vault_iterations()).toBeNull();
    expect(vault_write_iterations()).toBe(VAULT_KDF_ITERATIONS_LEGACY);
  });

  it("ignores an admission answer that lands after a reset", async () => {
    let resolve_post: (value: unknown) => void = () => undefined;
    const post = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolve_post = resolve;
      }),
    );

    const pending = request_level2_admission({ post });

    reset_level2_admission();
    resolve_post({ data: { level2_admitted: true } });

    expect(await pending).toBe("unknown");
    expect(get_level2_admission()).toBe("unknown");
  });

  it("issues a fresh request after a reset drops the in-flight one", async () => {
    let resolve_first: (value: unknown) => void = () => undefined;
    const post = vi
      .fn()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolve_first = resolve;
        }),
      )
      .mockResolvedValueOnce({ data: { level2_admitted: true } });

    const first = request_level2_admission({ post });

    reset_level2_admission();

    const second = request_level2_admission({ post });

    resolve_first({ data: { level2_admitted: false } });

    expect(await first).toBe("unknown");
    expect(await second).toBe("admitted");
    expect(post).toHaveBeenCalledTimes(2);
    expect(get_level2_admission()).toBe("admitted");
  });
});

describe("write_vault_at_level", () => {
  it("sends the field at 600k", async () => {
    mark_level2_admitted();
    const seal = vi.fn(async (iterations: number) => ({
      encrypted_vault: `v${iterations}`,
      vault_nonce: "n",
    }));
    const send = vi.fn(async () => ({ status: 200 }));

    const result = await write_vault_at_level(
      vault_write_iterations(),
      seal,
      send,
    );

    expect(result.iterations).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
    expect(send).toHaveBeenCalledWith(
      { encrypted_vault: "v600000", vault_nonce: "n" },
      { vault_kdf_iterations: 600000 },
    );
  });

  it("falls back to 310k without the field on a refusal", async () => {
    mark_level2_admitted();
    const seal = vi.fn(async (iterations: number) => ({
      encrypted_vault: `v${iterations}`,
      vault_nonce: "n",
    }));
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        status: 409,
        server_code: "VAULT_LEVEL2_NOT_ADMITTED",
      })
      .mockResolvedValueOnce({ status: 200 });

    const result = await write_vault_at_level(
      VAULT_KDF_ITERATIONS_LEVEL2,
      seal,
      send,
    );

    expect(result.iterations).toBe(VAULT_KDF_ITERATIONS_LEGACY);
    expect(result.sealed.encrypted_vault).toBe("v310000");
    expect(send).toHaveBeenLastCalledWith(
      { encrypted_vault: "v310000", vault_nonce: "n" },
      {},
    );
    expect(get_level2_admission()).toBe("refused");
  });

  it("does not retry other conflicts", async () => {
    const seal = vi.fn(async () => ({ encrypted_vault: "v", vault_nonce: "n" }));
    const send = vi.fn(async () => ({ status: 409, server_code: "OTHER" }));

    await write_vault_at_level(VAULT_KDF_ITERATIONS_LEVEL2, seal, send);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never reseals an opened 600k vault at 310k on a refusal", async () => {
    note_opened_vault_iterations(VAULT_KDF_ITERATIONS_LEVEL2);
    const seal = vi.fn(async (iterations: number) => ({
      encrypted_vault: `v${iterations}`,
      vault_nonce: "n",
    }));
    const refusal = {
      status: 409,
      server_code: "VAULT_LEVEL2_NOT_ADMITTED",
    };
    const send = vi.fn(async () => refusal);

    const result = await write_vault_at_level(
      vault_write_iterations(),
      seal,
      send,
    );

    expect(result.iterations).toBe(VAULT_KDF_ITERATIONS_LEVEL2);
    expect(result.response).toBe(refusal);
    expect(seal).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("verified vault level", () => {
  it("does not let a reported 310k lower an opened 600k vault", () => {
    note_opened_vault_iterations(VAULT_KDF_ITERATIONS_LEVEL2);
    record_vault_iterations_from_response({
      encrypted_vault: "current",
      vault_kdf_iterations: 310000,
    });

    expect(vault_write_iterations("current")).toBe(
      VAULT_KDF_ITERATIONS_LEVEL2,
    );
  });
});
