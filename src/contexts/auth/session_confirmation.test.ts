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
import { afterEach, describe, expect, it } from "vitest";

import {
  begin_session_confirmation,
  end_session_confirmation,
  is_session_confirmation_pending,
  session_confirmed_for,
} from "./session_confirmation";

afterEach(() => {
  end_session_confirmation();
});

describe("session confirmation gate", () => {
  it("passes when no check is pending", async () => {
    await expect(session_confirmed_for("user-a")).resolves.toBe(true);
  });

  it("waits for the verdict of the same account", async () => {
    let settle: (value: boolean) => void = () => undefined;

    begin_session_confirmation(
      "user-a",
      new Promise<boolean>((resolve) => {
        settle = resolve;
      }),
    );

    const result = session_confirmed_for("user-a");

    expect(is_session_confirmation_pending()).toBe(true);
    settle(true);
    await expect(result).resolves.toBe(true);
    expect(is_session_confirmation_pending()).toBe(false);
  });

  it("refuses another account while a check is pending", async () => {
    begin_session_confirmation("user-a", new Promise<boolean>(() => {}));

    await expect(session_confirmed_for("user-b")).resolves.toBe(false);
  });

  it("stays refused after a rejected verdict until a new sign-in", async () => {
    begin_session_confirmation("user-a", Promise.resolve(false));

    await expect(session_confirmed_for("user-a")).resolves.toBe(false);
    await expect(session_confirmed_for("user-a")).resolves.toBe(false);

    end_session_confirmation();
    await expect(session_confirmed_for("user-a")).resolves.toBe(true);
  });

  it("treats a failed check as rejected", async () => {
    begin_session_confirmation("user-a", Promise.reject(new Error("offline")));

    await expect(session_confirmed_for("user-a")).resolves.toBe(false);
  });
});
