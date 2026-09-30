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
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  LOCKED_DATA_CHANGED_EVENT,
  read_locked_sent_mail,
  write_locked_sent_mail,
} from "./locked_sent_mail_store";

describe("locked sent mail store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads zero when nothing is stored", () => {
    expect(read_locked_sent_mail("account-1")).toBe(0);
  });

  it("stores the count per account", () => {
    write_locked_sent_mail("account-1", 3);

    expect(read_locked_sent_mail("account-1")).toBe(3);
    expect(read_locked_sent_mail("account-2")).toBe(0);
  });

  it("removes the entry when the count reaches zero", () => {
    write_locked_sent_mail("account-1", 3);
    write_locked_sent_mail("account-1", 0);

    expect(localStorage.getItem("aster_locked_sent_mail_account-1")).toBeNull();
  });

  it("treats negative, fractional, and invalid counts safely", () => {
    write_locked_sent_mail("account-1", -4);
    expect(read_locked_sent_mail("account-1")).toBe(0);

    write_locked_sent_mail("account-1", 2.7);
    expect(read_locked_sent_mail("account-1")).toBe(2);

    write_locked_sent_mail("account-1", Number.NaN);
    expect(read_locked_sent_mail("account-1")).toBe(0);

    localStorage.setItem("aster_locked_sent_mail_account-1", "garbage");
    expect(read_locked_sent_mail("account-1")).toBe(0);
  });

  it("ignores an empty account id", () => {
    write_locked_sent_mail("", 5);

    expect(localStorage.length).toBe(0);
    expect(read_locked_sent_mail("")).toBe(0);
  });

  it("announces every change", () => {
    const listener = vi.fn();

    window.addEventListener(LOCKED_DATA_CHANGED_EVENT, listener);
    write_locked_sent_mail("account-1", 2);
    write_locked_sent_mail("account-1", 0);
    window.removeEventListener(LOCKED_DATA_CHANGED_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not throw when storage is unavailable", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });

    expect(() => write_locked_sent_mail("account-1", 2)).not.toThrow();
    spy.mockRestore();
  });
});
