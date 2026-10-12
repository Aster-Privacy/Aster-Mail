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
import { describe, it, expect } from "vitest";

import {
  detect_unsubscribe_info,
  is_mailing_list_mail,
} from "@/utils/unsubscribe_detector";

function list_mail(
  html?: string,
  text?: string,
  headers?: { list_unsubscribe?: string },
): boolean {
  return is_mailing_list_mail(
    detect_unsubscribe_info(html, text, headers),
    html,
    text,
  );
}

describe("is_mailing_list_mail", () => {
  it("counts a List-Unsubscribe header, link or mailto", () => {
    expect(
      list_mail(undefined, undefined, {
        list_unsubscribe: "<https://news.example.com/u/1>",
      }),
    ).toBe(true);
    expect(
      list_mail(undefined, undefined, {
        list_unsubscribe: "<mailto:leave@news.example.com>",
      }),
    ).toBe(true);
  });

  it("counts a body link that says unsubscribe or opt out", () => {
    expect(
      list_mail('<a href="https://shop.example.com/unsubscribe?id=4">here</a>'),
    ).toBe(true);
    expect(
      list_mail('<a href="https://shop.example.com/x/9f3a">Unsubscribe</a>'),
    ).toBe(true);
    expect(
      list_mail('<a href="https://shop.example.com/opt-out/7">Opt out</a>'),
    ).toBe(true);
    expect(
      list_mail(
        undefined,
        "To stop these emails: https://shop.example.com/unsubscribe/7",
      ),
    ).toBe(true);
  });

  it("does not count a preferences or remove-from-list link on its own", () => {
    const preferences =
      '<a href="https://bank.example.com/account/manage-email-preferences">Manage your email preferences</a>';

    expect(list_mail(preferences)).toBe(false);
    expect(
      list_mail(
        '<a href="https://parcel.example.com/remove-from-list">remove</a>',
      ),
    ).toBe(false);
  });

  it("still offers the unsubscribe button for a preferences link", () => {
    const preferences =
      '<a href="https://bank.example.com/account/manage-email-preferences">Manage your email preferences</a>';

    expect(detect_unsubscribe_info(preferences).has_unsubscribe).toBe(true);
  });

  it("does not count ordinary mail", () => {
    expect(
      list_mail(undefined, "Dinner on Friday? https://maps.example.com/p/1"),
    ).toBe(false);
    expect(list_mail("<p>Thanks for your order.</p>")).toBe(false);
  });
});
