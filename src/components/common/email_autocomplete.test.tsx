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
import type { DecryptedContact } from "@/types/contacts";
import type { DecryptedRecentRecipient } from "@/types/recent_recipients";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EmailAutocomplete } from "@/components/common/email_autocomplete";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/use_peer_profile", () => ({
  use_peer_profile: () => null,
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

function make_contact(
  first_name: string,
  last_name: string,
  email: string,
): DecryptedContact {
  return {
    id: `contact-${email}`,
    first_name,
    last_name,
    emails: [email],
    is_favorite: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function make_recent(email: string): DecryptedRecentRecipient {
  return {
    id: `recent-${email}`,
    email,
    send_count: 1,
    last_sent_at: "2026-01-01T00:00:00Z",
  };
}

const BRIAN = make_contact("Brian", "Stone", "brian@acme.com");
const IAN = make_contact("Ian", "Hart", "ian@acme.com");
const SAM = make_contact("Sam", "Ianelli", "sam@acme.com");
const JOANN = make_contact("Joann", "Price", "joann@x.io");
const LEEANN = make_contact("Leeann", "Cole", "leeann@x.io");

let container: HTMLDivElement;
let root: Root;
let added: string[];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  added = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function RecipientInput({
  contacts,
  recent_recipients,
}: {
  contacts: DecryptedContact[];
  recent_recipients?: DecryptedRecentRecipient[];
}) {
  const [value, set_value] = useState("");
  const [recipients, set_recipients] = useState<string[]>([]);

  return (
    <EmailAutocomplete
      contacts={contacts}
      existing_emails={recipients}
      on_change={set_value}
      on_select={(email) => {
        added.push(email);
        set_recipients((prev) => [...prev, email]);
        set_value("");
      }}
      recent_recipients={recent_recipients}
      value={value}
    />
  );
}

function render_input(
  contacts: DecryptedContact[],
  recent_recipients?: DecryptedRecentRecipient[],
) {
  act(() => {
    root.render(
      <RecipientInput
        contacts={contacts}
        recent_recipients={recent_recipients}
      />,
    );
  });
}

function get_input(): HTMLInputElement {
  return container.querySelector("input")!;
}

function type_text(text: string) {
  const input = get_input();
  const set_value = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  for (let end = 1; end <= text.length; end++) {
    act(() => {
      set_value.call(input, text.slice(0, end));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}

function press_key(key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });

  act(() => {
    get_input().dispatchEvent(event);
  });

  return event;
}

function suggestion_rows(): HTMLButtonElement[] {
  return Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
  );
}

function suggested_emails(): string[] {
  return suggestion_rows().map(
    (row) => row.querySelector(".text-xs")?.textContent ?? "",
  );
}

function highlighted_emails(): string[] {
  return suggestion_rows()
    .filter((row) => row.classList.contains("bg-surf-hover"))
    .map((row) => row.querySelector(".text-xs")?.textContent ?? "");
}

describe("email autocomplete with a complete address typed", () => {
  it("adds the typed address on Enter, not a contact whose address contains it", () => {
    render_input([BRIAN, IAN]);

    type_text("ian@acme.com");
    press_key("Enter");

    expect(added).toEqual(["ian@acme.com"]);
  });

  it("adds the typed address on Tab, not a longer contact address", () => {
    render_input([JOANN]);

    type_text("ann@x.io");
    const tab = press_key("Tab");

    expect(added).toEqual(["ann@x.io"]);
    expect(tab.defaultPrevented).toBe(true);
  });

  it("highlights no suggestion for an address no contact has, and Enter adds it", () => {
    render_input([JOANN]);

    type_text("ann@x.io");

    expect(suggested_emails()).toEqual(["joann@x.io"]);
    expect(highlighted_emails()).toEqual([]);

    press_key("Enter");

    expect(added).toEqual(["ann@x.io"]);
  });

  it("adds the typed address on a comma or semicolon", () => {
    render_input([JOANN]);

    type_text("ann@x.io,");
    type_text("nn@x.io;");

    expect(added).toEqual(["ann@x.io", "nn@x.io"]);
  });

  it("takes a suggestion the user moved to with the arrow keys", () => {
    render_input([JOANN]);

    type_text("ann@x.io");
    press_key("ArrowDown");
    press_key("Enter");

    expect(added).toEqual(["joann@x.io"]);
  });

  it("takes a suggestion the user moved the pointer onto", () => {
    render_input([JOANN, LEEANN]);

    type_text("ann@x.io");
    act(() => {
      const row = suggestion_rows()[1];

      row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      row.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    });
    press_key("Enter");

    expect(added).toEqual(["leeann@x.io"]);
  });

  it("ignores a suggestion that only opened under a resting pointer", () => {
    render_input([JOANN]);

    type_text("ann@x.io");
    act(() => {
      suggestion_rows()[0].dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
    });
    press_key("Enter");

    expect(added).toEqual(["ann@x.io"]);
  });
});

describe("email autocomplete ranking", () => {
  it("lists exact address matches first, then prefix matches, then substring matches", () => {
    render_input([BRIAN, IAN, SAM]);

    type_text("ian");
    expect(suggested_emails()).toEqual([
      "ian@acme.com",
      "sam@acme.com",
      "brian@acme.com",
    ]);

    type_text("ian@acme.com");
    expect(suggested_emails()).toEqual(["ian@acme.com", "brian@acme.com"]);
  });

  it("finds an exact address listed after five contacts that contain it", () => {
    render_input([
      BRIAN,
      make_contact("Adrian", "Ford", "adrian@acme.com"),
      make_contact("Julian", "Cross", "julian@acme.com"),
      make_contact("Vivian", "Shaw", "vivian@acme.com"),
      make_contact("Xian", "Lu", "xian@acme.com"),
      IAN,
    ]);

    type_text("ian@acme.com");

    expect(suggested_emails()).toHaveLength(5);
    expect(suggested_emails()[0]).toBe("ian@acme.com");
    expect(highlighted_emails()).toEqual(["ian@acme.com"]);
  });

  it("lists a recent recipient's exact address above a contact that contains it", () => {
    render_input([JOANN], [make_recent("ann@x.io")]);

    type_text("ann@x.io");
    expect(suggested_emails()).toEqual(["ann@x.io", "joann@x.io"]);

    press_key("Enter");
    expect(added).toEqual(["ann@x.io"]);
  });

  it("still takes the highlighted suggestion for partial input", () => {
    render_input([BRIAN, IAN, JOANN]);

    type_text("bri");
    press_key("Enter");

    type_text("jo");
    const tab = press_key("Tab");

    expect(added).toEqual(["brian@acme.com", "joann@x.io"]);
    expect(tab.defaultPrevented).toBe(true);
  });
});
