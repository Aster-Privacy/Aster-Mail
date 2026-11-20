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
import { describe, it, expect } from "vitest";

import {
  is_missing_mail_item,
  resolve_welcome_auto_open,
} from "./stale_open_email";

describe("is_missing_mail_item", () => {
  it("treats a not found response as missing", () => {
    expect(is_missing_mail_item({ code: "NOT_FOUND", status: 404 })).toBe(
      true,
    );
    expect(is_missing_mail_item({ status: 404 })).toBe(true);
    expect(is_missing_mail_item({ status: 410 })).toBe(true);
    expect(is_missing_mail_item({ code: "NOT_FOUND" })).toBe(true);
  });

  it("keeps other failures as errors", () => {
    expect(is_missing_mail_item({ code: "SERVER_ERROR", status: 500 })).toBe(
      false,
    );
    expect(is_missing_mail_item({ code: "NETWORK_ERROR" })).toBe(false);
    expect(is_missing_mail_item({ code: "FORBIDDEN", status: 403 })).toBe(
      false,
    );
    expect(is_missing_mail_item({})).toBe(false);
  });
});

describe("resolve_welcome_auto_open", () => {
  it("waits until the list has loaded", () => {
    expect(resolve_welcome_auto_open({})).toEqual({ kind: "wait" });
  });

  it("opens the welcome message when it is in the list", () => {
    expect(
      resolve_welcome_auto_open({
        a: "Weekly update",
        b: "Welcome to Aster Mail",
      }),
    ).toEqual({ kind: "open", email_id: "b" });
  });

  it("gives up once the list loads without a welcome message", () => {
    expect(resolve_welcome_auto_open({ a: "Weekly update" })).toEqual({
      kind: "none",
    });
  });
});
