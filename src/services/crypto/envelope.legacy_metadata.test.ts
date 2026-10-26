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

import { decrypt_metadata, encrypt_metadata } from "./envelope";
import {
  append_legacy_key_raw_bytes,
  clear_legacy_keks_from_memory,
} from "./legacy_keks";

const CONTEXT = "mail-item-metadata";

function random_key(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

describe("decrypt_metadata with older keys", () => {
  afterEach(() => {
    clear_legacy_keks_from_memory();
  });

  it("opens a blob another client sealed with an older key", async () => {
    const primary_key = random_key();
    const other_client_key = random_key();
    const blob = await encrypt_metadata(
      { inbox_category: "travel" },
      other_client_key,
      CONTEXT,
    );

    expect(blob).not.toBeNull();
    expect(await decrypt_metadata(blob!, primary_key, CONTEXT)).toBeNull();

    await append_legacy_key_raw_bytes(other_client_key);

    expect(await decrypt_metadata(blob!, primary_key, CONTEXT)).toEqual({
      inbox_category: "travel",
    });
  });

  it("keeps the primary key path unchanged", async () => {
    const primary_key = random_key();

    await append_legacy_key_raw_bytes(random_key());

    const blob = await encrypt_metadata(
      { is_read: true },
      primary_key,
      CONTEXT,
    );

    expect(await decrypt_metadata(blob!, primary_key, CONTEXT)).toEqual({
      is_read: true,
    });
  });

  it("does not open a blob sealed for another context", async () => {
    const primary_key = random_key();
    const other_client_key = random_key();
    const blob = await encrypt_metadata(
      { inbox_category: "travel" },
      other_client_key,
      "folder-metadata",
    );

    await append_legacy_key_raw_bytes(other_client_key);

    expect(await decrypt_metadata(blob!, primary_key, CONTEXT)).toBeNull();
  });

  it("returns null when no key opens the blob", async () => {
    const blob = await encrypt_metadata(
      { inbox_category: "travel" },
      random_key(),
      CONTEXT,
    );

    await append_legacy_key_raw_bytes(random_key());

    expect(await decrypt_metadata(blob!, random_key(), CONTEXT)).toBeNull();
  });
});
