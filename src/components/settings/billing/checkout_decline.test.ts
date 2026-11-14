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

import {
  alternate_checkout_method,
  checkout_decline_kind,
  checkout_decline_message_key,
} from "./checkout_decline";

describe("checkout_decline_kind", () => {
  it("reads the decline code on a declined card", () => {
    expect(
      checkout_decline_kind({
        type: "card_error",
        code: "card_declined",
        decline_code: "insufficient_funds",
      }),
    ).toBe("insufficient_funds");
    expect(
      checkout_decline_kind({
        type: "card_error",
        code: "card_declined",
        decline_code: "transaction_not_allowed",
      }),
    ).toBe("card_not_supported");
  });

  it("reads the error code when the field itself is wrong", () => {
    expect(
      checkout_decline_kind({ type: "card_error", code: "incorrect_cvc" }),
    ).toBe("card_details");
    expect(
      checkout_decline_kind({ type: "card_error", code: "expired_card" }),
    ).toBe("expired_card");
    expect(
      checkout_decline_kind({ type: "card_error", code: "processing_error" }),
    ).toBe("try_again");
  });

  it("never reveals a fraud, lost, stolen, or block-list reason", () => {
    for (const decline_code of [
      "fraudulent",
      "lost_card",
      "stolen_card",
      "pickup_card",
      "restricted_card",
      "merchant_blacklist",
      "do_not_honor",
      "generic_decline",
    ]) {
      expect(
        checkout_decline_kind({
          type: "card_error",
          code: "card_declined",
          decline_code,
        }),
      ).toBe("contact_bank");
    }
  });

  it("treats a failed bank check as an authentication problem", () => {
    expect(
      checkout_decline_kind({
        type: "invalid_request_error",
        code: "payment_intent_authentication_failure",
      }),
    ).toBe("authentication");
  });

  it("leaves form validation errors to the caller", () => {
    expect(
      checkout_decline_kind({
        type: "validation_error",
        code: "incomplete_number",
      }),
    ).toBeNull();
    expect(checkout_decline_kind({})).toBeNull();
  });
});

describe("checkout_decline_message_key", () => {
  it("gives every kind a message", () => {
    expect(checkout_decline_message_key("contact_bank")).toBe(
      "settings.checkout_decline_contact_bank",
    );
    expect(checkout_decline_message_key("authentication")).toBe(
      "settings.checkout_sca_required",
    );
  });
});

describe("alternate_checkout_method", () => {
  const all = ["card", "wallet", "cashapp", "crypto"] as const;

  it("offers a wallet first, then Cash App", () => {
    expect(alternate_checkout_method("contact_bank", "card", all)).toBe(
      "wallet",
    );
    expect(
      alternate_checkout_method("insufficient_funds", "card", [
        "card",
        "cashapp",
        "crypto",
      ]),
    ).toBe("cashapp");
  });

  it("offers a card after a Cash App decline", () => {
    expect(
      alternate_checkout_method("contact_bank", "cashapp", [
        "card",
        "cashapp",
      ]),
    ).toBe("card");
  });

  it("offers nothing when the same card can still work", () => {
    expect(alternate_checkout_method("card_details", "card", all)).toBeNull();
    expect(alternate_checkout_method("try_again", "card", all)).toBeNull();
    expect(
      alternate_checkout_method("authentication", "card", all),
    ).toBeNull();
  });

  it("offers nothing when no other method exists", () => {
    expect(
      alternate_checkout_method("contact_bank", "card", ["card"]),
    ).toBeNull();
  });
});
