//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, expect, it } from "vitest";

import {
  extract_delivered_to,
  resolve_received_on_address,
} from "./delivered_to";

describe("extract_delivered_to", () => {
  it("returns the first topmost delivered-to address", () => {
    const headers = [
      { name: "Delivered-To", value: "shopping@astermail.org" },
      { name: "Delivered-To", value: "other@astermail.org" },
    ];

    expect(extract_delivered_to(headers)).toBe("shopping@astermail.org");
  });

  it("strips angle brackets and lowercases", () => {
    const headers = [{ name: "delivered-to", value: "<Kid.Alias@Aster.CX>" }];

    expect(extract_delivered_to(headers)).toBe("kid.alias@aster.cx");
  });

  it("returns undefined without the header", () => {
    expect(extract_delivered_to([{ name: "To", value: "a@b.c" }])).toBe(
      undefined,
    );
    expect(extract_delivered_to(undefined)).toBe(undefined);
    expect(extract_delivered_to([])).toBe(undefined);
  });

  it("ignores values without an address", () => {
    expect(
      extract_delivered_to([{ name: "Delivered-To", value: "garbage" }]),
    ).toBe(undefined);
  });
});

describe("resolve_received_on_address", () => {
  const simplelogin_case = {
    raw_headers: [
      { name: "Delivered-To", value: "myalias@astermail.org" },
      { name: "X-SimpleLogin-Type", value: "Forward" },
    ],
    to_recipients: [{ name: "", email: "testing123.glitzy618@aleeas.com" }],
    cc_recipients: [],
    sender_email: "sender_at_proton_me_abc@simplelogin.co",
  };

  it("surfaces the aster address for forwarded mail", () => {
    expect(resolve_received_on_address(simplelogin_case)).toBe(
      "myalias@astermail.org",
    );
  });

  it("suppresses when the address is already in to", () => {
    expect(
      resolve_received_on_address({
        ...simplelogin_case,
        to_recipients: [{ name: "", email: "MyAlias@astermail.org" }],
      }),
    ).toBe(undefined);
  });

  it("suppresses when the address is already in cc", () => {
    expect(
      resolve_received_on_address({
        ...simplelogin_case,
        cc_recipients: [{ name: "", email: "myalias@astermail.org " }],
      }),
    ).toBe(undefined);
  });

  it("returns undefined without headers", () => {
    expect(
      resolve_received_on_address({
        to_recipients: [{ name: "", email: "a@b.c" }],
      }),
    ).toBe(undefined);
  });
});
