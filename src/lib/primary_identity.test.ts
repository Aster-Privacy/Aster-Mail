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
import { describe, expect, it } from "vitest";

import { resolve_primary_identity } from "@/lib/primary_identity";
import { sender_id_matches } from "@/lib/preferred_sender";

import type { SenderOption } from "@/hooks/use_sender_aliases";

function domain_option(): SenderOption {
  return {
    id: "domain-abc",
    email: "me@my-domain.com",
    type: "domain",
    is_enabled: true,
  } as SenderOption;
}

function primary_option(): SenderOption {
  return {
    id: "primary",
    email: "me@astermail.org",
    type: "primary",
    is_enabled: true,
  } as SenderOption;
}

describe("sender_id_matches", () => {
  it("matches identical ids", () => {
    expect(sender_id_matches("primary", "primary")).toBe(true);
  });

  it("matches a bare custom domain id against a prefixed option", () => {
    expect(sender_id_matches("domain-abc", "abc")).toBe(true);
  });

  it("matches a prefixed id against a bare option", () => {
    expect(sender_id_matches("abc", "domain-abc")).toBe(true);
  });

  it("does not match unrelated ids", () => {
    expect(sender_id_matches("domain-abc", "domain-xyz")).toBe(false);
    expect(sender_id_matches("ghost-abc", "abc")).toBe(false);
  });
});

describe("resolve_primary_identity", () => {
  it("resolves a default sender stored without the domain prefix", () => {
    const identity = resolve_primary_identity(
      [primary_option(), domain_option()],
      "abc",
      "me@astermail.org",
    );

    expect(identity.email).toBe("me@my-domain.com");
    expect(identity.is_custom).toBe(true);
  });

  it("falls back to the primary address when nothing matches", () => {
    const identity = resolve_primary_identity(
      [primary_option(), domain_option()],
      "missing",
      "me@astermail.org",
    );

    expect(identity.email).toBe("me@astermail.org");
    expect(identity.is_custom).toBe(false);
  });
});
