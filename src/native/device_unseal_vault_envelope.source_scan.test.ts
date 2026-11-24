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

function read(path: string): string {
  return readFileSync(resolve(here, path), "utf8").replace(/\r\n/g, "\n");
}

describe("device_unseal_vault_envelope", () => {
  it("stores the passphrase without returning it to the page", () => {
    const rust = read("../../src-tauri/src/device/crypto.rs");
    const start = rust.indexOf("pub fn device_unseal_vault_envelope(");
    const body = rust.slice(start, rust.indexOf("\n}\n", start));

    expect(start).toBeGreaterThan(-1);
    expect(body).toContain(") -> Result<(), String> {");
    expect(body).toContain("Ok(())");
    expect(body).not.toMatch(/b64url\(&plaintext\)/);
  });

  it("is invoked without reading a result", () => {
    const ts = read("./desktop_device_auth.ts");

    expect(ts).toContain('await invoke<void>("device_unseal_vault_envelope"');
    expect(ts).not.toMatch(/=\s*await invoke[^(]*\("device_unseal_vault_envelope"/);
  });
});
