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

describe("deep link routing", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("opens the screens the widgets link to from the app scheme", () => {
    for (const screen of ["starred", "drafts"]) {
      expect(handle_deep_link(`astermail://${screen}`)).toBe(true);
      expect(window.location.pathname).toBe(`/${screen}`);
    }

    expect(handle_deep_link("astermail://inbox")).toBe(true);
    expect(window.location.pathname).toBe("/");
  });

  it("opens other app paths from the app scheme inside the app", () => {
    expect(handle_deep_link("astermail://link-device?code=123456")).toBe(true);
    expect(window.location.pathname).toBe("/link-device");
    expect(window.location.search).toBe("");
  });

  it("refuses app paths the app does not link to", () => {
    for (const url of [
      "astermail://admin",
      "astermail://settings-export?all=1",
      "https://app.astermail.org/internal/debug",
      "astermail://link-device/extra",
    ]) {
      expect(handle_deep_link(url)).toBe(false);
      expect(window.location.pathname).toBe("/");
    }
  });

  it("refuses paths with dot segments", () => {
    for (const url of [
      "astermail://view/../admin",
      "astermail://view/%2e%2e/admin",
      "astermail://view/.%2E/admin",
      "https://app.astermail.org/invite/%2E%2E/admin",
    ]) {
      expect(handle_deep_link(url)).toBe(false);
      expect(window.location.pathname).toBe("/");
    }
  });

  it("keeps only the query keys a route reads", () => {
    expect(
      handle_deep_link(
        "https://app.astermail.org/reset-password?token=abc&next=%2F%2Fevil.example&debug=1",
      ),
    ).toBe(true);
    expect(window.location.pathname).toBe("/reset-password");
    expect(window.location.search).toBe("?token=abc");
  });

  it("opens routes with a path parameter and keeps their query keys", () => {
    expect(handle_deep_link("astermail://invite/ABC123?ref=xyz&mode=1")).toBe(
      true,
    );
    expect(window.location.pathname).toBe("/invite/ABC123");
    expect(window.location.search).toBe("?ref=xyz");
  });

  it("opens sign-in with its query keys and a trailing slash", () => {
    expect(
      handle_deep_link("astermail://sign-in/?reason=session_expired&x=1"),
    ).toBe(true);
    expect(window.location.pathname).toBe("/sign-in/");
    expect(window.location.search).toBe("?reason=session_expired");
  });

  it("opens the guard veto link with its id and token", () => {
    expect(
      handle_deep_link(
        "https://app.astermail.org/guard/veto?id=42&t=tok&other=1",
      ),
    ).toBe(true);
    expect(window.location.pathname).toBe("/guard/veto");
    expect(window.location.search).toBe("?id=42&t=tok");
  });

  it("keeps the billing return keys on the root path", () => {
    window.history.replaceState({}, "", "/starred");

    expect(
      handle_deep_link(
        "https://app.astermail.org/?addon_purchase=success&stripe_redirect=1&redirect_status=succeeded&payment_intent=pi_1",
      ),
    ).toBe(true);
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe(
      "?addon_purchase=success&stripe_redirect=1&redirect_status=succeeded",
    );
  });

  it("keeps the compose query keys on the root path", () => {
    window.history.replaceState({}, "", "/starred");

    expect(
      handle_deep_link(
        "astermail://?compose=true&to=a%40example.com&subject=hi&evil=1",
      ),
    ).toBe(true);
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe(
      "?compose=true&to=a%40example.com&subject=hi",
    );
  });

  it("leaves shared content to the share handler without navigating", () => {
    expect(handle_deep_link("astermail://share?text=hi")).toBe(true);
    expect(window.location.pathname).toBe("/");
  });

  it("refuses app scheme paths that would leave the app", () => {
    for (const url of [
      "astermail:////evil.example/x",
      "astermail:///\\evil.example/x",
      "astermail://\t/evil.example/x",
      "astermail://\n/evil.example/x",
    ]) {
      expect(() => handle_deep_link(url)).not.toThrow();
      expect(handle_deep_link(url)).toBe(false);
      expect(window.location.pathname).toBe("/");
    }
  });

  it("refuses web links whose path would leave the app", () => {
    expect(handle_deep_link("https://app.astermail.org//evil.example/x")).toBe(
      false,
    );
    expect(window.location.pathname).toBe("/");
  });

  it("opens a known settings section from the app scheme", () => {
    expect(handle_deep_link("astermail://settings/security")).toBe(true);
    expect(window.location.pathname).toBe("/settings/security");

    expect(handle_deep_link("astermail://settings/signatures")).toBe(true);
    expect(window.location.pathname).toBe("/settings/signatures");
  });

  it("falls back to the settings home for an unknown section", () => {
    expect(handle_deep_link("astermail://settings/%2F%2Fevil.example")).toBe(
      true,
    );
    expect(window.location.pathname).toBe("/settings");
  });

  it("still opens other app paths from a verified web link", () => {
    expect(
      handle_deep_link("https://app.astermail.org/reset-password?token=abc"),
    ).toBe(true);
    expect(window.location.pathname).toBe("/reset-password");
    expect(window.location.search).toBe("?token=abc");
  });

  it("ignores links from other sites", () => {
    expect(handle_deep_link("https://evil.example/starred")).toBe(false);
    expect(window.location.pathname).toBe("/");
  });
});
