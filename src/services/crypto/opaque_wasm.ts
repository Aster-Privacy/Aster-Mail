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
const SEED_BYTES = 32;
const LENGTH_PREFIX_BYTES = 4;
const STATUS_OK = 0;
const STATUS_REJECTED = 2;

interface OpaqueExports {
  memory: WebAssembly.Memory;
  aster_opaque_alloc(len: number): number;
  aster_opaque_free(ptr: number, len: number): void;
  aster_opaque_registration_start(
    password: number,
    password_len: number,
    seed: number,
  ): number;
  aster_opaque_registration_finish(
    state: number,
    state_len: number,
    password: number,
    password_len: number,
    response: number,
    response_len: number,
    seed: number,
  ): number;
  aster_opaque_login_start(
    password: number,
    password_len: number,
    seed: number,
  ): number;
  aster_opaque_login_finish(
    state: number,
    state_len: number,
    password: number,
    password_len: number,
    response: number,
    response_len: number,
    seed: number,
  ): number;
}

export class OpaqueRejectedError extends Error {
  constructor() {
    super("opaque_rejected");
    this.name = "OpaqueRejectedError";
  }
}

export class OpaqueUnavailableError extends Error {
  constructor() {
    super("opaque_unavailable");
    this.name = "OpaqueUnavailableError";
  }
}

export interface OpaqueStart {
  state: Uint8Array;
  message: Uint8Array;
}

export interface OpaqueClient {
  registration_start(password: Uint8Array): OpaqueStart;
  registration_finish(
    state: Uint8Array,
    password: Uint8Array,
    response: Uint8Array,
  ): Uint8Array;
  login_start(password: Uint8Array): OpaqueStart;
  login_finish(
    state: Uint8Array,
    password: Uint8Array,
    response: Uint8Array,
  ): Uint8Array;
}

type Region = [number, number];

function is_opaque_exports(value: WebAssembly.Exports): boolean {
  return (
    value.memory instanceof WebAssembly.Memory &&
    [
      "aster_opaque_alloc",
      "aster_opaque_free",
      "aster_opaque_registration_start",
      "aster_opaque_registration_finish",
      "aster_opaque_login_start",
      "aster_opaque_login_finish",
    ].every((name) => typeof value[name] === "function")
  );
}

function split_start(payload: Uint8Array): OpaqueStart {
  if (payload.length < LENGTH_PREFIX_BYTES) {
    throw new OpaqueUnavailableError();
  }

  const state_len = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  ).getUint32(0, true);
  const state_end = LENGTH_PREFIX_BYTES + state_len;

  if (state_end > payload.length) {
    throw new OpaqueUnavailableError();
  }

  const start = {
    state: payload.slice(LENGTH_PREFIX_BYTES, state_end),
    message: payload.slice(state_end),
  };

  payload.fill(0);

  return start;
}

export function create_opaque_client(
  instance_exports: WebAssembly.Exports,
): OpaqueClient {
  if (!is_opaque_exports(instance_exports)) {
    throw new OpaqueUnavailableError();
  }

  const wasm = instance_exports as unknown as OpaqueExports;

  const place = (bytes: Uint8Array, held: Region[]): number => {
    if (bytes.length === 0) {
      return 0;
    }

    const ptr = wasm.aster_opaque_alloc(bytes.length);

    if (ptr === 0) {
      throw new OpaqueUnavailableError();
    }

    held.push([ptr, bytes.length]);
    new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);

    return ptr;
  };

  const place_seed = (held: Region[]): number => {
    const seed = crypto.getRandomValues(new Uint8Array(SEED_BYTES));

    try {
      return place(seed, held);
    } finally {
      seed.fill(0);
    }
  };

  const take_reply = (ptr: number): Uint8Array => {
    if (ptr === 0) {
      throw new OpaqueUnavailableError();
    }

    const body_len = new DataView(wasm.memory.buffer).getUint32(ptr, true);
    const total = LENGTH_PREFIX_BYTES + body_len;

    if (body_len < 1 || ptr + total > wasm.memory.buffer.byteLength) {
      throw new OpaqueUnavailableError();
    }

    const body = new Uint8Array(wasm.memory.buffer, ptr, total).slice(
      LENGTH_PREFIX_BYTES,
    );

    wasm.aster_opaque_free(ptr, total);

    const status = body[0];

    if (status === STATUS_OK) {
      const payload = body.slice(1);

      body.fill(0);

      return payload;
    }

    if (status === STATUS_REJECTED) {
      throw new OpaqueRejectedError();
    }

    throw new OpaqueUnavailableError();
  };

  const run = (call: (held: Region[]) => number): Uint8Array => {
    const held: Region[] = [];

    try {
      return take_reply(call(held));
    } finally {
      for (const [ptr, len] of held) {
        wasm.aster_opaque_free(ptr, len);
      }
    }
  };

  const finish =
    (name: "aster_opaque_registration_finish" | "aster_opaque_login_finish") =>
    (
      state: Uint8Array,
      password: Uint8Array,
      response: Uint8Array,
    ): Uint8Array =>
      run((held) =>
        wasm[name](
          place(state, held),
          state.length,
          place(password, held),
          password.length,
          place(response, held),
          response.length,
          place_seed(held),
        ),
      );

  const start =
    (name: "aster_opaque_registration_start" | "aster_opaque_login_start") =>
    (password: Uint8Array): OpaqueStart =>
      split_start(
        run((held) =>
          wasm[name](place(password, held), password.length, place_seed(held)),
        ),
      );

  return {
    registration_start: start("aster_opaque_registration_start"),
    registration_finish: finish("aster_opaque_registration_finish"),
    login_start: start("aster_opaque_login_start"),
    login_finish: finish("aster_opaque_login_finish"),
  };
}

export type OpaqueModuleSource = () => Promise<BufferSource>;

let module_source: OpaqueModuleSource | null = null;
let loading: Promise<OpaqueClient> | null = null;

export function set_opaque_module_source(
  source: OpaqueModuleSource | null,
): void {
  module_source = source;
  loading = null;
}

async function default_module_source(): Promise<BufferSource> {
  const { default: url } = await import("./aster_opaque.wasm?url");
  const response = await fetch(url, { credentials: "omit" });

  if (!response.ok) {
    throw new OpaqueUnavailableError();
  }

  return response.arrayBuffer();
}

async function instantiate(): Promise<OpaqueClient> {
  const bytes = await (module_source ?? default_module_source)();
  const { instance } = await WebAssembly.instantiate(bytes, {});

  return create_opaque_client(instance.exports);
}

export function load_opaque_client(): Promise<OpaqueClient> {
  if (!loading) {
    const attempt = instantiate().catch((error) => {
      if (loading === attempt) {
        loading = null;
      }
      throw error instanceof OpaqueUnavailableError
        ? error
        : new OpaqueUnavailableError();
    });

    loading = attempt;
  }

  return loading;
}
