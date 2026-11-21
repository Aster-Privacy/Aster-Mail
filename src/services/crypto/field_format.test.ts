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
import { afterEach, describe, expect, it } from "vitest";

import { array_to_base64, base64_to_array } from "./base64";
import {
  FIELD_FORMAT_V1,
  FIELD_FORMAT_V2,
  FIELD_KIND_TEMPLATE,
  field_format_write_version,
  open_bound_field,
  seal_field,
  set_field_format_write_v2,
} from "./field_format";

const plaintext = new TextEncoder().encode("Weekly update");
const nonce = new Uint8Array(12).fill(7);
const v2_vector = "WA/DNwN294G2+XL05SuAr1wmnmo4UvyWn/yWnL0=";
const v1_vector = "WA/DNwN294G2+XL05ViSxvqUHEsULJXX8cu5Xos=";

async function vector_key(): Promise<CryptoKey> {
  const raw = Uint8Array.from({ length: 32 }, (_, i) => i);

  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function binding(field: string, record_id: string | null) {
  return { kind: FIELD_KIND_TEMPLATE, field, record_id };
}

describe("field_format", () => {
  afterEach(() => set_field_format_write_v2(false));

  it("matches the shared v2 vector", async () => {
    const sealed = await seal_field(
      await vector_key(),
      plaintext,
      nonce,
      binding("content", "tpl-1"),
      FIELD_FORMAT_V2,
    );

    expect(array_to_base64(sealed)).toBe(v2_vector);
  });

  it("matches the shared v1 vector", async () => {
    const sealed = await seal_field(
      await vector_key(),
      plaintext,
      nonce,
      binding("content", "tpl-1"),
      FIELD_FORMAT_V1,
    );

    expect(array_to_base64(sealed)).toBe(v1_vector);
  });

  it("opens a v2 field only for its own field and record", async () => {
    const key = await vector_key();
    const sealed = base64_to_array(v2_vector);

    expect(
      await open_bound_field(key, sealed, nonce, binding("content", "tpl-1")),
    ).toEqual(plaintext);
    expect(
      await open_bound_field(key, sealed, nonce, binding("name", "tpl-1")),
    ).toBeNull();
    expect(
      await open_bound_field(key, sealed, nonce, binding("content", "tpl-2")),
    ).toBeNull();
  });

  it("opens a field sealed before its record had an id", async () => {
    const key = await vector_key();
    const sealed = await seal_field(
      key,
      plaintext,
      nonce,
      binding("name", null),
      FIELD_FORMAT_V2,
    );

    expect(
      await open_bound_field(key, sealed, nonce, binding("name", "tpl-9")),
    ).toEqual(plaintext);
    expect(
      await open_bound_field(key, sealed, nonce, binding("content", "tpl-9")),
    ).toBeNull();
  });

  it("writes v1 until the switch is turned on", async () => {
    expect(field_format_write_version()).toBe(FIELD_FORMAT_V1);
    set_field_format_write_v2(true);
    expect(field_format_write_version()).toBe(FIELD_FORMAT_V2);
  });
});
