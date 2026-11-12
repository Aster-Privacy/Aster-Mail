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
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sender_uses_account_key } from "./send_queue_body_encryption";

const h = vi.hoisted(() => ({ primary: "me@astermail.org" as string | null }));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () =>
    h.primary ? { user: { email: h.primary } } : null,
}));

describe("sender_uses_account_key", () => {
  beforeEach(() => {
    h.primary = "me@astermail.org";
  });

  it("is true for the primary address", async () => {
    expect(await sender_uses_account_key("me@astermail.org")).toBe(true);
  });

  it("is true when no sender address is given", async () => {
    expect(await sender_uses_account_key(undefined)).toBe(true);
  });

  it("is false for an alias", async () => {
    expect(await sender_uses_account_key("shop@astermail.org")).toBe(false);
  });

  it("is false for a custom domain address", async () => {
    expect(await sender_uses_account_key("me@my-domain.example")).toBe(false);
  });

  it("is true when the primary address is unknown", async () => {
    h.primary = null;
    expect(await sender_uses_account_key("shop@astermail.org")).toBe(true);
  });

  it("is true for a dotted form of the primary address", async () => {
    h.primary = "first.last@astermail.org";
    expect(await sender_uses_account_key("firstlast@astermail.org")).toBe(true);
    expect(await sender_uses_account_key("First.Last@AsterMail.org")).toBe(
      true,
    );
  });

  it("is true for a tagged form of the primary address", async () => {
    h.primary = "firstlast@astermail.org";
    expect(await sender_uses_account_key("first.last+news@astermail.org")).toBe(
      true,
    );
  });

  it("is false for a dotted primary on another domain", async () => {
    h.primary = "first.last@astermail.org";
    expect(await sender_uses_account_key("firstlast@aster.cx")).toBe(false);
  });
});
