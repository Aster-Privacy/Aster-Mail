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
import { describe, it, expect, vi } from "vitest";

vi.mock("@/hooks/use_sender_aliases", () => ({
  is_signature_bindable_sender_type: (type: string) =>
    type === "alias" || type === "domain" || type === "ghost",
}));

import {
  signature_for_sender,
  signatures_for_sender,
} from "@/lib/sender_signature";

interface Sig {
  id: string;
  alias_id: string | null;
}

const DEFAULT: Sig = { id: "default", alias_id: null };
const signatures: Sig[] = [
  DEFAULT,
  { id: "work", alias_id: "alias-1" },
  { id: "hidden", alias_id: "ghost-2" },
];

function resolve(alias_id: string | null): Sig | null {
  return (
    signatures.find((s) => alias_id !== null && s.alias_id === alias_id) ??
    DEFAULT
  );
}

describe("signature_for_sender", () => {
  it("uses the default signature for the primary address", () => {
    expect(
      signature_for_sender({ id: "primary", type: "primary" }, resolve, DEFAULT),
    ).toBe(DEFAULT);
  });

  it("uses the signature bound to an alias", () => {
    expect(
      signature_for_sender({ id: "alias-1", type: "alias" }, resolve, DEFAULT)
        ?.id,
    ).toBe("work");
  });

  it("keeps the default signature for an alias without its own", () => {
    expect(
      signature_for_sender({ id: "alias-9", type: "alias" }, resolve, DEFAULT),
    ).toBe(DEFAULT);
  });

  it("adds no signature for a Ghost Mode address without its own", () => {
    expect(
      signature_for_sender({ id: "ghost-1", type: "ghost" }, resolve, DEFAULT),
    ).toBeNull();
  });

  it("uses the signature bound to a Ghost Mode address", () => {
    expect(
      signature_for_sender({ id: "ghost-2", type: "ghost" }, resolve, DEFAULT)
        ?.id,
    ).toBe("hidden");
  });

  it("uses the default signature before a sender is chosen", () => {
    expect(signature_for_sender(null, resolve, DEFAULT)).toBe(DEFAULT);
  });
});

describe("signatures_for_sender", () => {
  const list: Sig[] = [
    DEFAULT,
    { id: "work", alias_id: "alias-1" },
    { id: "side", alias_id: "alias-2" },
    { id: "hidden", alias_id: "ghost-2" },
  ];
  const ids = (sigs: Sig[]) => sigs.map((s) => s.id);

  it("shows only unassigned signatures for the primary address", () => {
    expect(
      ids(signatures_for_sender({ id: "primary", type: "primary" }, list)),
    ).toEqual(["default"]);
  });

  it("shows the alias's own signatures and unassigned ones, not other aliases'", () => {
    expect(
      ids(signatures_for_sender({ id: "alias-1", type: "alias" }, list)),
    ).toEqual(["default", "work"]);
    expect(
      ids(signatures_for_sender({ id: "alias-2", type: "alias" }, list)),
    ).toEqual(["default", "side"]);
  });

  it("applies the same rule to custom domain addresses", () => {
    expect(
      ids(signatures_for_sender({ id: "alias-2", type: "domain" }, list)),
    ).toEqual(["default", "side"]);
  });

  it("shows only the bound signature for a ghost address", () => {
    expect(
      ids(signatures_for_sender({ id: "ghost-2", type: "ghost" }, list)),
    ).toEqual(["hidden"]);
    expect(
      ids(signatures_for_sender({ id: "ghost-9", type: "ghost" }, list)),
    ).toEqual([]);
  });

  it("does not match an external account's id against alias bindings", () => {
    expect(
      ids(signatures_for_sender({ id: "alias-1", type: "external" }, list)),
    ).toEqual(["default"]);
  });

  it("shows only unassigned signatures before a sender is known", () => {
    expect(ids(signatures_for_sender(null, list))).toEqual(["default"]);
  });
});
