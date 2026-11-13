//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/services/api/client", () => ({
  api_client: { post: h.post, get: h.get },
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: vi.fn(async () => null),
  get_all_accounts: vi.fn(async () => []),
  get_current_account: vi.fn(async () => null),
}));

import { array_to_base64, base64_to_array } from "@/services/crypto/base64";
import { derive_password_hash } from "@/services/crypto/key_manager_pgp_keygen";
import {
  clear_pending_login_enrollment,
  derive_sign_in_proof,
  flush_pending_login_enrollment,
} from "@/services/crypto/login_proof";
import {
  derive_login_v3_input,
  enroll_login_v3,
  set_pending_login_v3,
  sign_in_v3,
  take_pending_login_v3,
} from "@/services/crypto/login_v3";
import {
  create_opaque_client,
  OpaqueRejectedError,
  OpaqueUnavailableError,
  set_opaque_module_source,
  type OpaqueClient,
} from "@/services/crypto/opaque_wasm";

const SERVER_MODULE = readFileSync(
  resolve(__dirname, "../../tests/fixtures/aster_opaque_server.wasm"),
);
const CLIENT_MODULE = readFileSync(resolve(__dirname, "./aster_opaque.wasm"));
const PASSWORD = "correct horse battery staple";
const USER_ID = new TextEncoder().encode("3f2b8c1e-7a4d-4e9b-9c60-5d1a2b3c4d5e");
const START = "/core/v1/auth/login/v3/start";
const FINISH = "/core/v1/auth/login/v3/finish";
const ENROLL_START = "/core/v1/auth/me/password-v3/start";
const ENROLL_FINISH = "/core/v1/auth/me/password-v3/finish";

type RawExports = Record<string, (...args: number[]) => number> & {
  memory: WebAssembly.Memory;
};

class TestServer {
  private readonly wasm: RawExports;
  private readonly setup: Uint8Array;
  private readonly states = new Map<string, Uint8Array>();
  record: Uint8Array = new Uint8Array(0);

  constructor(instance_exports: WebAssembly.Exports) {
    this.wasm = instance_exports as unknown as RawExports;
    this.setup = this.call("aster_opaque_server_setup", ["seed"]);
  }

  private call(name: string, parts: (Uint8Array | "seed")[]): Uint8Array {
    const args: number[] = [];

    for (const part of parts) {
      const bytes =
        part === "seed" ? crypto.getRandomValues(new Uint8Array(32)) : part;
      const ptr = bytes.length ? this.wasm.aster_opaque_alloc(bytes.length) : 0;

      new Uint8Array(this.wasm.memory.buffer, ptr, bytes.length).set(bytes);
      args.push(ptr);
      if (part !== "seed") args.push(bytes.length);
    }

    const reply = this.wasm[name](...args);
    const body_len = new DataView(this.wasm.memory.buffer).getUint32(
      reply,
      true,
    );
    const body = new Uint8Array(
      this.wasm.memory.buffer,
      reply + 4,
      body_len,
    ).slice();

    if (body[0] !== 0) {
      throw new Error(`status ${body[0]}`);
    }

    return body.slice(1);
  }

  registration_response(request: string): string {
    return array_to_base64(
      this.call("aster_opaque_server_registration_response", [
        this.setup,
        base64_to_array(request),
        USER_ID,
      ]),
    );
  }

  store(upload: string): void {
    this.record = this.call("aster_opaque_server_registration_record", [
      base64_to_array(upload),
    ]);
  }

  login_start(request: string): { state_id: string; response: string } {
    const payload = this.call("aster_opaque_server_login_start", [
      this.setup,
      this.record,
      base64_to_array(request),
      USER_ID,
      "seed",
    ]);
    const state_len = new DataView(payload.buffer).getUint32(0, true);
    const state_id = `state-${this.states.size + 1}`;

    this.states.set(state_id, payload.slice(4, 4 + state_len));

    return { state_id, response: array_to_base64(payload.slice(4 + state_len)) };
  }

  login_finish(state_id: string, finalization: string): boolean {
    const state = this.states.get(state_id);

    if (!state) return false;
    this.states.delete(state_id);

    try {
      this.call("aster_opaque_server_login_finish", [
        state,
        base64_to_array(finalization),
      ]);

      return true;
    } catch {
      return false;
    }
  }
}

let server: TestServer;
let client: OpaqueClient;

async function v1_proof_for(password: string): Promise<string> {
  return (await derive_password_hash(password, new Uint8Array(32).fill(3)))
    .hash;
}

function serve(overrides: Record<string, () => unknown> = {}) {
  h.post.mockImplementation(async (path: string, body: Record<string, string>) => {
    if (overrides[path]) return overrides[path]();

    switch (path) {
      case ENROLL_START:
        return {
          data: {
            registration_response: server.registration_response(
              body.registration_request,
            ),
          },
        };
      case ENROLL_FINISH:
        server.store(body.registration_upload);

        return { data: { login_version: 3 } };
      case START: {
        const { state_id, response } = server.login_start(
          body.credential_request,
        );

        return { data: { state_id, credential_response: response } };
      }
      case FINISH:
        return server.login_finish(body.state_id, body.credential_finalization)
          ? { data: { user_id: "user-1" } }
          : {
              error: "Invalid credentials",
              status: 401,
              server_code: "INVALID_CREDENTIALS",
            };
      default:
        return { data: { kdf_version: 2 } };
    }
  });
}

function paths(): string[] {
  return h.post.mock.calls.map((call) => call[0] as string);
}

beforeAll(async () => {
  const [server_instance, client_instance] = await Promise.all([
    WebAssembly.instantiate(SERVER_MODULE, {}),
    WebAssembly.instantiate(CLIENT_MODULE, {}),
  ]);

  server = new TestServer(server_instance.instance.exports);
  client = create_opaque_client(client_instance.instance.exports);
});

beforeEach(() => {
  localStorage.clear();
  clear_pending_login_enrollment();
  h.post.mockReset();
  h.get.mockReset();
  server.record = new Uint8Array(0);
  set_opaque_module_source(async () => CLIENT_MODULE);
});

describe("shipped module", () => {
  it("exports only the client half", async () => {
    const { instance } = await WebAssembly.instantiate(CLIENT_MODULE, {});
    const names = Object.keys(instance.exports);

    expect(names.some((name) => name.includes("server"))).toBe(false);
    expect(WebAssembly.Module.imports(new WebAssembly.Module(CLIENT_MODULE)))
      .toEqual([]);
  });

  it("rejects a module without the expected exports", () => {
    expect(() => create_opaque_client({})).toThrow(OpaqueUnavailableError);
  });

  it("reports a malformed server message as unavailable", () => {
    const input = new Uint8Array(32).fill(7);
    const started = client.login_start(input);

    expect(() =>
      client.login_finish(started.state, input, new Uint8Array(5)),
    ).toThrow(OpaqueUnavailableError);
  });

  it("produces fresh messages for the same input", () => {
    const input = new Uint8Array(32).fill(7);

    expect(client.login_start(input).message).not.toEqual(
      client.login_start(input).message,
    );
    expect(client.login_start(input).message).toHaveLength(96);
    expect(client.registration_start(input).message).toHaveLength(32);
  });
});

describe("derive_login_v3_input", () => {
  it("is stable, 32 bytes, and separate from the proof it is derived from", async () => {
    const proof = await v1_proof_for(PASSWORD);
    const first = await derive_login_v3_input(proof);
    const second = await derive_login_v3_input(proof);

    expect(first).toHaveLength(32);
    expect(first).toEqual(second);
    expect(array_to_base64(first)).not.toBe(proof);
    expect(await derive_login_v3_input(await v1_proof_for("other"))).not.toEqual(
      first,
    );
  });
});

describe("enrollment and sign-in", () => {
  it("enrolls, then signs in with the same password", async () => {
    serve();
    const proof = await v1_proof_for(PASSWORD);

    expect(await enroll_login_v3(proof, "current-proof")).toBe(true);
    expect(server.record).toHaveLength(192);
    expect(h.post).toHaveBeenCalledWith(
      ENROLL_FINISH,
      expect.objectContaining({ password_hash: "current-proof" }),
    );

    const response = await sign_in_v3<{ user_id: string }>(
      {
        user_hash: "abc",
        remember_me: true,
        captcha_token: "captcha",
        client_platform: "web",
      },
      proof,
    );

    expect(response?.data).toEqual({ user_id: "user-1" });
    expect(h.post).toHaveBeenCalledWith(
      START,
      expect.objectContaining({
        user_hash: "abc",
        remember_me: true,
        captcha_token: "captcha",
        client_platform: "web",
      }),
    );
  });

  it("never sends the proof or the password input to the sign-in endpoints", async () => {
    serve();
    const proof = await v1_proof_for(PASSWORD);
    const input = array_to_base64(await derive_login_v3_input(proof));

    await enroll_login_v3(proof, "current-proof");
    h.post.mockClear();
    await sign_in_v3({ user_hash: "abc" }, proof);

    const sent = JSON.stringify(h.post.mock.calls);

    expect(sent).not.toContain(proof);
    expect(sent).not.toContain(input);
    expect(paths()).toEqual([START, FINISH]);
  });

  it("rejects a wrong password without calling finish", async () => {
    serve();
    await enroll_login_v3(await v1_proof_for(PASSWORD), "current-proof");
    h.post.mockClear();

    const response = await sign_in_v3(
      { user_hash: "abc" },
      await v1_proof_for("wrong password"),
    );

    expect(response).toMatchObject({
      status: 401,
      server_code: "INVALID_CREDENTIALS",
    });
    expect(response?.data).toBeUndefined();
    expect(paths()).toEqual([START]);
  });

  it("rejects an unknown account the same way", async () => {
    serve();

    const response = await sign_in_v3(
      { user_hash: "abc" },
      await v1_proof_for(PASSWORD),
    );

    expect(response).toMatchObject({ server_code: "INVALID_CREDENTIALS" });
    expect(paths()).toEqual([START]);
  });

  it.each([404, 503])(
    "falls back when the server answers %i to start",
    async (status) => {
      serve({ [START]: () => ({ error: "unavailable", status }) });

      expect(
        await sign_in_v3({ user_hash: "abc" }, await v1_proof_for(PASSWORD)),
      ).toBeNull();
      expect(paths()).toEqual([START]);
    },
  );

  it.each([401, 403, 429, 500])(
    "returns a %i from start without falling back",
    async (status) => {
      serve({ [START]: () => ({ error: "denied", status }) });

      const response = await sign_in_v3(
        { user_hash: "abc" },
        await v1_proof_for(PASSWORD),
      );

      expect(response).toMatchObject({ error: "denied", status });
    },
  );

  it("falls back before any request when the module cannot load", async () => {
    serve();
    set_opaque_module_source(async () => new Uint8Array([0, 1, 2, 3]));

    expect(
      await sign_in_v3({ user_hash: "abc" }, await v1_proof_for(PASSWORD)),
    ).toBeNull();
    expect(h.post).not.toHaveBeenCalled();
    expect(await enroll_login_v3("AAAA", "current-proof")).toBe(false);
  });

  it("reports a failed enrollment without throwing", async () => {
    serve({ [ENROLL_START]: () => ({ error: "nope", status: 404 }) });

    expect(
      await enroll_login_v3(await v1_proof_for(PASSWORD), "current-proof"),
    ).toBe(false);
    expect(paths()).toEqual([ENROLL_START]);
  });
});

describe("pending sign-in", () => {
  it("is handed out once, to the matching account only", () => {
    set_pending_login_v3("abc", "proof");
    expect(take_pending_login_v3("other")).toBeNull();
    expect(take_pending_login_v3("abc")).toBeNull();

    set_pending_login_v3("abc", "proof");
    expect(take_pending_login_v3("abc")).toBe("proof");
    expect(take_pending_login_v3("abc")).toBeNull();
  });

  it("expires", () => {
    vi.useFakeTimers();
    try {
      set_pending_login_v3("abc", "proof");
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      expect(take_pending_login_v3("abc")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("is set only when the server reports the account as enrolled", async () => {
    const salt = new Uint8Array(32).fill(3);
    const { hash } = await derive_password_hash(PASSWORD, salt);

    await derive_sign_in_proof(PASSWORD, salt, 2, "abc");
    expect(take_pending_login_v3("abc")).toBeNull();

    await derive_sign_in_proof(PASSWORD, salt, 2, "abc", { login_v3: "true" });
    expect(take_pending_login_v3("abc")).toBeNull();

    await derive_sign_in_proof(PASSWORD, salt, 2, "abc", { login_v3: true });
    expect(take_pending_login_v3("abc")).toBe(hash);

    await derive_sign_in_proof(PASSWORD, salt, 2, "abc", { login_v3: true });
    clear_pending_login_enrollment();
    expect(take_pending_login_v3("abc")).toBeNull();
  });
});

describe("enrollment after sign-in", () => {
  const salt = new Uint8Array(32).fill(3);

  it("enrolls when the server asks for it and the account has no record", async () => {
    serve();
    const { hash, hash_v2 } = await derive_password_hash(PASSWORD, salt);

    await derive_sign_in_proof(PASSWORD, salt, 2, "abc", {
      login_v3_enroll: true,
    });

    expect(await flush_pending_login_enrollment("user-1")).toBe(true);
    expect(paths()).toEqual([ENROLL_START, ENROLL_FINISH]);
    expect(h.post).toHaveBeenCalledWith(
      ENROLL_FINISH,
      expect.objectContaining({ password_hash: hash_v2 }),
    );

    h.post.mockClear();
    expect(
      (await sign_in_v3<{ user_id: string }>({ user_hash: "abc" }, hash))?.data,
    ).toEqual({ user_id: "user-1" });
  });

  it("does not enroll an account that already has a record", async () => {
    serve();
    await derive_sign_in_proof(PASSWORD, salt, 2, "abc", {
      login_v3: true,
      login_v3_enroll: true,
    });

    expect(await flush_pending_login_enrollment("user-1")).toBe(true);
    expect(h.post).not.toHaveBeenCalled();
  });

  it("does not enroll when the server does not ask", async () => {
    serve();
    await derive_sign_in_proof(PASSWORD, salt, 2, "abc");

    expect(await flush_pending_login_enrollment("user-1")).toBe(true);
    expect(h.post).not.toHaveBeenCalled();
  });

  it("keeps the earlier result when the new enrollment fails", async () => {
    serve({ [ENROLL_START]: () => Promise.reject(new Error("network")) });
    await derive_sign_in_proof(PASSWORD, salt, 2, "abc", {
      login_v3_enroll: true,
    });

    expect(await flush_pending_login_enrollment("user-1")).toBe(true);
  });
});

describe("error types", () => {
  it("keeps a rejection distinct from an unavailable module", () => {
    expect(new OpaqueRejectedError()).not.toBeInstanceOf(OpaqueUnavailableError);
  });
});
