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

import { evaluate_sender_trust } from "./sender_trust";
import {
  clear_sender_trust_context,
  get_sender_trust_context,
  safe_sender_name,
  set_trust_contacts,
  set_trust_primary_address,
  subscribe_sender_trust_context,
} from "./sender_trust_store";

describe("safe_sender_name", () => {
  afterEach(() => {
    set_trust_primary_address("");
    clear_sender_trust_context();
  });

  it("drops a name that shows a different address", () => {
    expect(safe_sender_name("support@paypal.com", "eve@evil.example")).toBe("");
  });

  it("drops a name that imitates a brand with lookalike letters", () => {
    expect(safe_sender_name("PaypaI Support", "eve@evil.example")).toBe("");
  });

  it("keeps an ordinary name", () => {
    expect(safe_sender_name("Jane Doe", "jane@company.example")).toBe(
      "Jane Doe",
    );
  });

  it("keeps a brand name on the brand's own domain", () => {
    expect(safe_sender_name("PayPal", "service@paypal.com")).toBe("PayPal");
  });

  it("keeps the name on the user's own address", () => {
    set_trust_primary_address("me@astermail.org");

    expect(safe_sender_name("Me", "me@astermail.org")).toBe("Me");
  });

  it("returns an empty string for a missing name", () => {
    expect(safe_sender_name(null, "jane@company.example")).toBe("");
    expect(safe_sender_name("", "jane@company.example")).toBe("");
  });
});

describe("set_trust_contacts", () => {
  const base = () => [
    { name: "Jane Doe", emails: ["jane@company.example"] },
    { name: "John Roe", emails: ["john@company.example", "jr@home.example"] },
  ];
  let unsubscribe: () => void = () => {};

  afterEach(() => {
    unsubscribe();
    clear_sender_trust_context();
  });

  function notice(email: string): string | null {
    return evaluate_sender_trust({
      name: "Jane Doe",
      email,
      ...get_sender_trust_context(),
    }).contact_notice;
  }

  function watch(): { count: () => number } {
    let calls = 0;

    unsubscribe = subscribe_sender_trust_context(() => {
      calls += 1;
    });

    return { count: () => calls };
  }

  it("does not republish identical contacts", () => {
    set_trust_contacts(base());
    const before = get_sender_trust_context();
    const listener = watch();

    set_trust_contacts(base());

    expect(listener.count()).toBe(0);
    expect(get_sender_trust_context()).toBe(before);
    expect(get_sender_trust_context().contacts).toBe(before.contacts);
  });

  it("keeps flagging a contact name from a stranger after an identical refresh", () => {
    set_trust_contacts(base());
    set_trust_contacts(base());

    expect(notice("jane@company.example")).toBeNull();
    expect(notice("jane@evil.example")).toBe("Jane Doe");
  });

  it.each([
    [
      "a renamed contact",
      (list: ReturnType<typeof base>) => {
        list[0].name = "Jane Smith";
      },
    ],
    [
      "a changed email",
      (list: ReturnType<typeof base>) => {
        list[1].emails[1] = "jr@other.example";
      },
    ],
    [
      "an added email",
      (list: ReturnType<typeof base>) => {
        list[0].emails.push("jane@home.example");
      },
    ],
    [
      "an added contact",
      (list: ReturnType<typeof base>) => {
        list.push({ name: "Ann Poe", emails: ["ann@company.example"] });
      },
    ],
    [
      "a removed contact",
      (list: ReturnType<typeof base>) => {
        list.pop();
      },
    ],
    [
      "reordered contacts",
      (list: ReturnType<typeof base>) => {
        list.reverse();
      },
    ],
  ])("publishes %s", (_label, change) => {
    set_trust_contacts(base());
    const before = get_sender_trust_context();
    const listener = watch();
    const next = base();

    change(next);
    set_trust_contacts(next);

    expect(listener.count()).toBe(1);
    expect(get_sender_trust_context()).not.toBe(before);
    expect(get_sender_trust_context().contacts).toEqual(next);
  });

  it("re-evaluates senders after a contact changes", () => {
    set_trust_contacts(base());
    expect(notice("jane@evil.example")).toBe("Jane Doe");

    const moved = base();

    moved[0].emails = ["jane@evil.example"];
    set_trust_contacts(moved);
    expect(notice("jane@evil.example")).toBeNull();
    expect(notice("jane@company.example")).toBe("Jane Doe");

    const renamed = base();

    renamed[0].name = "Jane Smith";
    set_trust_contacts(renamed);
    expect(notice("jane@evil.example")).toBeNull();
  });

  it("publishes when contacts are cleared", () => {
    set_trust_contacts(base());
    const listener = watch();

    set_trust_contacts([]);

    expect(listener.count()).toBe(1);
    expect(get_sender_trust_context().contacts).toEqual([]);
  });

  it("does not publish an empty list twice", () => {
    const listener = watch();

    set_trust_contacts([]);

    expect(listener.count()).toBe(0);
  });
});
