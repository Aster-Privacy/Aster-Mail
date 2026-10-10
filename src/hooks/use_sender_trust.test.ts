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

import { sender_trust_input } from "./use_sender_trust";

const context = { own_addresses: ["me@astermail.org"], contacts: [] };

describe("sender_trust_input", () => {
  it("treats a message as internal only when the server marked it so", () => {
    const base = { sender_name: "Ana", sender_email: "ana@astermail.org" };

    expect(
      sender_trust_input({ ...base, is_external: false }, context).is_internal,
    ).toBe(true);
    expect(
      sender_trust_input({ ...base, is_external: true }, context).is_internal,
    ).toBe(false);
    expect(sender_trust_input(base, context).is_internal).toBe(false);
    expect(
      sender_trust_input(
        { ...base, is_external: false, sender_verification: "invalid" },
        context,
      ).is_internal,
    ).toBe(false);
  });

  it("drops internal and verified status when the shown sender is rewritten", () => {
    const input = sender_trust_input(
      {
        sender_name: "Relay",
        sender_email: "relay@forwarder.example",
        display_sender_email: "ceo@bank.example",
        is_external: false,
        sender_verified: true,
        sender_verified_domain: "forwarder.example",
      },
      context,
    );

    expect(input.email).toBe("ceo@bank.example");
    expect(input.is_internal).toBe(false);
    expect(input.sender_verified).toBe(false);
    expect(input.sender_verified_domain).toBeUndefined();
  });

  it("reads a verified domain as verified when no flag is carried", () => {
    const message = {
      sender_name: "Shop",
      sender_email: "news@shop.example",
      is_external: true,
    };

    expect(
      sender_trust_input(
        { ...message, sender_verified_domain: "shop.example" },
        context,
      ).sender_verified,
    ).toBe(true);
    expect(sender_trust_input(message, context).sender_verified).toBe(false);
    expect(
      sender_trust_input(
        {
          ...message,
          sender_verified: false,
          sender_verified_domain: "shop.example",
        },
        context,
      ).sender_verified,
    ).toBe(false);
  });

  it("evaluates the name that is shown, not the stored one", () => {
    const input = sender_trust_input(
      { sender_name: "Stored", sender_email: "a@b.example" },
      context,
      { shown_name: "Shown" },
    );

    expect(input.name).toBe("Shown");
  });
});
