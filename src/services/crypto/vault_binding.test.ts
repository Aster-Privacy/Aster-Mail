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

const capabilities = { bound_vault_writes: false };
const retired = new Set<string>();

vi.mock("@/services/api/account_key", () => ({
  peek_account_key_capabilities: () => capabilities,
}));

vi.mock("@/services/format_retirement/record", () => ({
  is_format_retired: (id: string) => retired.has(id),
}));

import {
  note_own_vault_opened,
  note_own_vault_sealed,
  own_vault_last_open_bound,
  reset_vault_binding_state,
  vault_write_binds,
} from "./vault_binding";

describe("vault_write_binds", () => {
  beforeEach(() => {
    capabilities.bound_vault_writes = false;
    retired.clear();
    reset_vault_binding_state();
  });

  it("keeps unbound writes when nothing asks for binding", () => {
    note_own_vault_opened(false);

    expect(vault_write_binds(true)).toBe(false);
    expect(own_vault_last_open_bound()).toBe(false);
  });

  it("binds every write when the server asks for it", () => {
    capabilities.bound_vault_writes = true;

    expect(vault_write_binds(true)).toBe(true);
    expect(vault_write_binds(false)).toBe(true);
  });

  it("keeps writing bound after the own vault opened bound", () => {
    note_own_vault_opened(true);
    note_own_vault_opened(false);

    expect(vault_write_binds(true)).toBe(true);
    expect(own_vault_last_open_bound()).toBe(false);
  });

  it("keeps writing bound after a bound seal", () => {
    note_own_vault_sealed(true);

    expect(vault_write_binds(true)).toBe(true);
  });

  it("binds once unbound vaults are retired", () => {
    retired.add("vault_unbound");

    expect(vault_write_binds(true)).toBe(true);
  });

  it("never carries the own vault state to another vault", () => {
    note_own_vault_opened(true);

    expect(vault_write_binds(false)).toBe(false);
  });

  it("forgets the bound state on reset", () => {
    note_own_vault_opened(true);
    reset_vault_binding_state();

    expect(vault_write_binds(true)).toBe(false);
    expect(own_vault_last_open_bound()).toBeNull();
  });
});
