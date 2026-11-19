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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const key_holder: { key: CryptoKey | null } = { key: null };

vi.mock("@/services/crypto/storage_write_key", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/storage_write_key")
  >()),
  get_storage_write_crypto_key: async () => key_holder.key,
}));

vi.mock("./client", () => ({
  api_client: {
    post: vi.fn(async () => ({ data: { id: "tpl-1" } })),
    put: vi.fn(async () => ({ data: { success: true } })),
  },
}));

const { api_client } = await import("./client");
const { create_template, decrypt_template, update_template } = await import(
  "./templates"
);
const { array_to_base64, base64_to_array } = await import(
  "@/services/crypto/base64"
);
const {
  FIELD_FORMAT_V1,
  FIELD_FORMAT_V2,
  seal_field,
  set_field_format_write_v2,
} = await import("@/services/crypto/field_format");

type Sealed = { encrypted: string; nonce: string };
type Version = typeof FIELD_FORMAT_V1 | typeof FIELD_FORMAT_V2;

async function seal_template_field(
  value: string,
  field: string,
  record_id: string | null,
  version: Version,
): Promise<Sealed> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await seal_field(
    key_holder.key!,
    new TextEncoder().encode(value),
    nonce,
    { kind: "template", field, record_id },
    version,
  );

  return { encrypted: array_to_base64(sealed), nonce: array_to_base64(nonce) };
}

async function template_row(
  id: string,
  version: Version,
  record_id: string | null = id,
) {
  const name = await seal_template_field(
    "Follow up",
    "name",
    record_id,
    version,
  );
  const category = await seal_template_field(
    "Sales",
    "category",
    record_id,
    version,
  );
  const content = await seal_template_field(
    "Checking in.",
    "content",
    record_id,
    version,
  );

  return {
    id,
    encrypted_name: name.encrypted,
    name_nonce: name.nonce,
    encrypted_category: category.encrypted,
    category_nonce: category.nonce,
    encrypted_content: content.encrypted,
    content_nonce: content.nonce,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

async function opens_without_binding(sealed: Sealed): Promise<boolean> {
  try {
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(sealed.nonce) },
      key_holder.key!,
      base64_to_array(sealed.encrypted),
    );

    return true;
  } catch {
    return false;
  }
}

function last_body(method: "post" | "put"): Record<string, string> {
  const calls = vi.mocked(api_client[method]).mock.calls;

  return calls[calls.length - 1][1] as Record<string, string>;
}

beforeAll(async () => {
  key_holder.key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
});

describe("template field format", () => {
  afterEach(() => set_field_format_write_v2(false));

  it("reads templates written by older versions", async () => {
    const decrypted = await decrypt_template(
      await template_row("tpl-1", FIELD_FORMAT_V1),
    );

    expect(decrypted.name).toBe("Follow up");
    expect(decrypted.category).toBe("Sales");
    expect(decrypted.content).toBe("Checking in.");
  });

  it("reads templates whose fields are bound to the record", async () => {
    const decrypted = await decrypt_template(
      await template_row("tpl-1", FIELD_FORMAT_V2),
    );

    expect(decrypted.name).toBe("Follow up");
    expect(decrypted.content).toBe("Checking in.");
  });

  it("reads bound templates created before the record had an id", async () => {
    const decrypted = await decrypt_template(
      await template_row("tpl-7", FIELD_FORMAT_V2, null),
    );

    expect(decrypted.category).toBe("Sales");
  });

  it("refuses a bound field moved to another template", async () => {
    const source = await template_row("tpl-1", FIELD_FORMAT_V2);
    const target = await template_row("tpl-2", FIELD_FORMAT_V2);

    await expect(
      decrypt_template({
        ...target,
        encrypted_content: source.encrypted_content,
        content_nonce: source.content_nonce,
      }),
    ).rejects.toThrow();
  });

  it("refuses a bound field moved to another field", async () => {
    const row = await template_row("tpl-1", FIELD_FORMAT_V2);

    await expect(
      decrypt_template({
        ...row,
        encrypted_name: row.encrypted_content,
        name_nonce: row.content_nonce,
      }),
    ).rejects.toThrow();
  });

  it("writes unbound fields while the switch is off", async () => {
    await create_template({ name: "A", category: "B", content: "C" });
    const body = last_body("post");

    expect(
      await opens_without_binding({
        encrypted: body.encrypted_content,
        nonce: body.content_nonce,
      }),
    ).toBe(true);
  });

  it("writes bound fields once the switch is on", async () => {
    set_field_format_write_v2(true);
    await update_template("tpl-3", { content: "Bound" });
    const body = last_body("put");

    expect(
      await opens_without_binding({
        encrypted: body.encrypted_content,
        nonce: body.content_nonce,
      }),
    ).toBe(false);

    const row = await template_row("tpl-3", FIELD_FORMAT_V1);
    const decrypted = await decrypt_template({
      ...row,
      encrypted_content: body.encrypted_content,
      content_nonce: body.content_nonce,
    });

    expect(decrypted.content).toBe("Bound");
  });
});
