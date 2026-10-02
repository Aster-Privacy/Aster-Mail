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

import { handle_deep_link } from "./deep_link_handler";

type PendingCompose = { to: string; subject: string; body: string };

function read_pending(): PendingCompose | undefined {
  return (window as unknown as Record<string, unknown>)
    .__aster_pending_compose as PendingCompose | undefined;
}

describe("compose deep link", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)
      .__aster_pending_compose;
  });

  it("treats the body as plain text instead of html", () => {
    const body = '<a href="https://evil.example">Reset</a><img src=x>';

    handle_deep_link(
      `astermail://compose?to=a@example.com&body=${encodeURIComponent(body)}`,
    );

    const pending = read_pending();

    expect(pending?.body).toBe(
      "&lt;a href=&quot;https://evil.example&quot;&gt;Reset&lt;/a&gt;&lt;img src=x&gt;",
    );
    expect(pending?.body).not.toContain("<");
  });

  it("keeps line breaks and passes the plain-text body to the compose event", () => {
    let message = "";
    const listener = (event: Event) => {
      message = (event as CustomEvent<{ message: string }>).detail.message;
    };

    window.addEventListener("aster:mobile-compose", listener);
    handle_deep_link(
      `astermail://compose?body=${encodeURIComponent("first\nsecond & third")}`,
    );
    window.removeEventListener("aster:mobile-compose", listener);

    expect(message).toBe("first<br>second &amp; third");
    expect(read_pending()?.body).toBe(message);
  });

  it("drops a recipient that is not an email address", () => {
    handle_deep_link("astermail://compose?to=not-an-address&body=hi");

    expect(read_pending()?.to).toBe("");
  });
});
