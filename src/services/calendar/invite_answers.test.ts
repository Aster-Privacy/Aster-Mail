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
import { beforeEach, describe, expect, it } from "vitest";

import {
  answer_is_current,
  clear_invite_answers,
  forget_invite_answer,
  INVITE_ANSWER_PREFIX,
  MAX_INVITE_ANSWERS,
  read_invite_answer,
  write_invite_answer,
} from "./invite_answers";

const target = {
  account_id: "account-1",
  uid: "event-uid@example.com",
  recurrence_id: null,
};

function stored_keys(): string[] {
  return Object.keys(localStorage).filter((key) =>
    key.startsWith(INVITE_ANSWER_PREFIX),
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("invite answers", () => {
  it("keeps one answer per event and overwrites it", async () => {
    await write_invite_answer(target, "accepted", 0);
    await write_invite_answer(target, "declined", 1);

    expect(stored_keys()).toHaveLength(1);
    expect(await read_invite_answer(target)).toMatchObject({
      response: "declined",
      sequence: 1,
    });
  });

  it("stores no event details in the key or the value", async () => {
    await write_invite_answer(target, "tentative", 2);

    const [key] = stored_keys();

    expect(key).not.toContain("event-uid");
    expect(key).not.toContain("account-1");
    expect(key).toMatch(new RegExp(`^${INVITE_ANSWER_PREFIX}[0-9a-f]{64}$`));
    expect(localStorage.getItem(key)).not.toContain("event-uid");
  });

  it("separates accounts and occurrences", async () => {
    await write_invite_answer(target, "accepted", 0);

    expect(
      await read_invite_answer({ ...target, account_id: "account-2" }),
    ).toBeNull();
    expect(
      await read_invite_answer({
        ...target,
        recurrence_id: "2026-10-12T13:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("ignores targets without an account or uid", async () => {
    await write_invite_answer({ ...target, uid: null }, "accepted", 0);
    await write_invite_answer({ ...target, account_id: "" }, "accepted", 0);

    expect(stored_keys()).toHaveLength(0);
    expect(await read_invite_answer({ ...target, uid: null })).toBeNull();
  });

  it("rejects tampered values", async () => {
    await write_invite_answer(target, "accepted", 0);

    const [key] = stored_keys();

    localStorage.setItem(
      key,
      JSON.stringify({ response: "maybe", sequence: 0, at: 1 }),
    );
    expect(await read_invite_answer(target)).toBeNull();
    localStorage.setItem(key, "{not json");
    expect(await read_invite_answer(target)).toBeNull();
  });

  it("caps how many answers it keeps", async () => {
    for (let i = 0; i < MAX_INVITE_ANSWERS + 5; i += 1) {
      await write_invite_answer({ ...target, uid: `uid-${i}` }, "accepted", 0);
    }

    expect(stored_keys()).toHaveLength(MAX_INVITE_ANSWERS);
  });

  it("forgets and clears answers", async () => {
    await write_invite_answer(target, "accepted", 0);
    await write_invite_answer({ ...target, uid: "other" }, "declined", 0);
    await forget_invite_answer(target);

    expect(await read_invite_answer(target)).toBeNull();
    expect(stored_keys()).toHaveLength(1);

    clear_invite_answers();
    expect(stored_keys()).toHaveLength(0);
  });

  it("treats an older answer as stale after an update", () => {
    const answer = { response: "accepted" as const, sequence: 1, at: 1 };

    expect(answer_is_current(answer, "accepted", 1)).toBe(true);
    expect(answer_is_current(answer, "accepted", 2)).toBe(false);
    expect(answer_is_current(answer, "declined", 1)).toBe(false);
    expect(answer_is_current(null, "accepted", 0)).toBe(false);
  });
});
