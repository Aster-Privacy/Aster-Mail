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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(resolve(here, name), "utf8").replace(/\r\n/g, "\n");
}

function count(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

describe("level 2 storage start sites", () => {
  it("starts level 2 after password login and add account", () => {
    const source = read("use_auth_account_state.ts");
    const after_identity =
      /store_vault_in_memory\(vault, passphrase, user\.id\);\n\s*api_client\.set_expected_user_id\(user\.id\);\n\s*ensure_level2_storage\(user\.id\);/g;

    expect(count(source, /store_vault_in_memory\(/g)).toBe(2);
    expect(count(source, after_identity)).toBe(2);
  });

  it("starts level 2 when a vault is set on the provider", () => {
    const source = read("use_auth_provider_state.ts");
    const set_vault = source.slice(source.indexOf("const set_vault"));

    expect(count(source, /store_vault_in_memory\(/g)).toBe(1);
    expect(set_vault.indexOf("ensure_level2_storage(")).toBeGreaterThan(
      set_vault.indexOf("store_vault_in_memory("),
    );
  });

  it("starts level 2 after decrypting a vault", () => {
    const source = read("vault_decryption.ts");

    expect(count(source, /ensure_level2_storage\(owner_user_id\)/g)).toBe(1);
    expect(source).not.toContain("start_level2_storage");
    expect(source).not.toContain("reset_level2_admission");
  });
});
