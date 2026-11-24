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

import { resolve_toast_icon } from "@/components/toast/action_toast";
import { resolve_unsubscribe_toast_copy } from "@/utils/unsubscribe_toast";
import { en } from "@/lib/i18n/translations/en";

describe("unsubscribe toast copy", () => {
  it("confirms a completed one-click unsubscribe", () => {
    expect(resolve_unsubscribe_toast_copy("api", true)).toEqual({
      message_key: "mail.successfully_unsubscribed",
      tone: "success",
      offers_page: false,
    });
  });

  it("points to the website when the sender has no automatic method", () => {
    expect(resolve_unsubscribe_toast_copy("link", true)).toEqual({
      message_key: "mail.unsubscribe_on_website",
      tone: "info",
      offers_page: true,
    });
  });

  it("never says the sender lacks support after a rejected request", () => {
    const copy = resolve_unsubscribe_toast_copy("failed", true);

    expect(copy.message_key).toBe("mail.unsubscribe_not_confirmed");
    expect(copy.tone).toBe("error");
    expect(copy.offers_page).toBe(true);
  });

  it("reports a plain failure when no page is available", () => {
    expect(resolve_unsubscribe_toast_copy("error", false)).toEqual({
      message_key: "mail.unsubscribe_failed",
      tone: "error",
      offers_page: false,
    });
  });

  it("falls back to the email link when nothing can be opened", () => {
    expect(resolve_unsubscribe_toast_copy("mailto", false)).toEqual({
      message_key: "mail.unsubscribe_use_email_link",
      tone: "info",
      offers_page: false,
    });
  });

  it("keeps every manual message short enough for a two line toast", () => {
    const mail = en.mail as unknown as Record<string, string>;

    for (const key of [
      "successfully_unsubscribed",
      "unsubscribe_failed",
      "unsubscribe_on_website",
      "unsubscribe_not_confirmed",
      "unsubscribe_use_email_link",
      "open_page",
    ]) {
      expect(mail[key].length).toBeLessThanOrEqual(60);
    }
  });

  it("uses an info icon rather than a checkmark for manual steps", () => {
    const base = {
      id: "t",
      message: "m",
      action_type: "unsubscribe",
      email_ids: [],
    } as never;

    expect(
      resolve_toast_icon({ ...(base as object), result_tone: "info" } as never),
    ).toBe("info");
    expect(resolve_toast_icon(base)).toBe("info");
    expect(
      resolve_toast_icon({
        ...(base as object),
        result_tone: "error",
      } as never),
    ).toBe("error");
  });
});
