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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";

const h = vi.hoisted(() => ({
  preferences: {
    external_link_warning_dismissed: false as boolean,
    unsubscribe_confirm_dismissed: false as boolean,
  },
  update_preference: vi.fn(),
  lockdown_active: false as boolean,
  trusted: false as boolean,
  open_external: vi.fn(),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: h.preferences,
    update_preference: h.update_preference,
  }),
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => h.lockdown_active,
  LOCKDOWN_CHANGED_EVENT: "aster-lockdown-changed",
}));

vi.mock("@/lib/trusted_link_domains", () => ({
  is_trusted_link: () => h.trusted,
}));

vi.mock("@/utils/open_link", () => ({
  open_external: (url: string) => h.open_external(url),
}));

vi.mock("@/components/modals/external_link_warning_modal", () => ({
  ExternalLinkWarningModal: ({
    is_open,
    url,
    kind,
    link_text,
    return_focus_to,
    on_confirm,
    on_close,
    on_dismiss_permanently,
  }: {
    is_open: boolean;
    url: string;
    kind?: string;
    link_text?: string | null;
    return_focus_to?: HTMLElement | null;
    on_confirm: () => void;
    on_close: () => void;
    on_dismiss_permanently: () => void;
  }) =>
    is_open ? (
      <div
        data-kind={kind ?? ""}
        data-link-text={link_text ?? ""}
        data-return-focus={return_focus_to?.id ?? ""}
        data-testid="link_warning"
        data-url={url}
      >
        <button data-action="confirm" type="button" onClick={on_confirm}>
          confirm
        </button>
        <button data-action="cancel" type="button" onClick={on_close}>
          cancel
        </button>
        <button
          data-action="dismiss"
          type="button"
          onClick={on_dismiss_permanently}
        >
          dismiss
        </button>
      </div>
    ) : null,
}));

const { ExternalLinkProvider, use_external_link } =
  await import("./external_link_context");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FIRST_URL = "https://sender.example/page";
const SECOND_URL = "https://other.example/page";

type HandleExternalLink = ReturnType<
  typeof use_external_link
>["handle_external_link"];

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let handle_external_link: HandleExternalLink | null = null;

function Capture() {
  handle_external_link = use_external_link().handle_external_link;

  return null;
}

function ShowPath() {
  const location = useLocation();

  return (
    <span data-testid="path">{`${location.pathname}${location.search}`}</span>
  );
}

function current_path() {
  return container!.querySelector('[data-testid="path"]')!.textContent;
}

function render_provider() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <ExternalLinkProvider>
          <Capture />
          <ShowPath />
        </ExternalLinkProvider>
      </MemoryRouter>,
    );
  });
}

function warning() {
  return container!.querySelector<HTMLElement>('[data-testid="link_warning"]');
}

function click_warning(action: "confirm" | "cancel" | "dismiss") {
  act(() =>
    warning()!
      .querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!
      .click(),
  );
}

function request(url: string) {
  const on_result = vi.fn();

  act(() => handle_external_link!(url, on_result));

  return on_result;
}

describe("ExternalLinkProvider results", () => {
  beforeEach(() => {
    h.preferences.external_link_warning_dismissed = false;
    h.preferences.unsubscribe_confirm_dismissed = false;
    h.update_preference.mockClear();
    h.lockdown_active = false;
    h.trusted = false;
    h.open_external.mockClear();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    handle_external_link = null;
  });

  it("reports an opened link after the warning is confirmed", () => {
    render_provider();
    const on_result = request(FIRST_URL);

    expect(on_result).not.toHaveBeenCalled();
    expect(warning()?.dataset.url).toBe(FIRST_URL);

    click_warning("confirm");

    expect(h.open_external).toHaveBeenCalledWith(FIRST_URL);
    expect(on_result).toHaveBeenCalledTimes(1);
    expect(on_result).toHaveBeenCalledWith(true);
  });

  it("reports a closed link when the warning is canceled", () => {
    render_provider();
    const on_result = request(FIRST_URL);

    click_warning("cancel");

    expect(h.open_external).not.toHaveBeenCalled();
    expect(on_result).toHaveBeenCalledTimes(1);
    expect(on_result).toHaveBeenCalledWith(false);
    expect(warning()).toBeNull();
  });

  it("reports a closed link when a lockdown blocks the confirm", () => {
    h.preferences.external_link_warning_dismissed = true;
    h.trusted = true;
    h.lockdown_active = true;
    render_provider();
    const on_result = request(FIRST_URL);

    expect(warning()).not.toBeNull();
    click_warning("confirm");

    expect(h.open_external).not.toHaveBeenCalled();
    expect(on_result).toHaveBeenCalledWith(false);
  });

  it("reports a closed link when a lockdown starts while the warning is open", () => {
    render_provider();
    const on_result = request(FIRST_URL);

    h.lockdown_active = true;
    click_warning("confirm");

    expect(h.open_external).not.toHaveBeenCalled();
    expect(on_result).toHaveBeenCalledWith(false);
  });

  it("opens a family invite link in this tab without a new window", () => {
    render_provider();
    const token = "b".repeat(64);
    const on_result = request(
      `https://app.astermail.org/join/family?token=${token}`,
    );

    expect(warning()).toBeNull();
    expect(h.open_external).not.toHaveBeenCalled();
    expect(on_result).toHaveBeenCalledWith(true);
    expect(current_path()).toBe(`/join/family?token=${token}`);
  });

  it("still warns before a lookalike invite link on another origin", () => {
    render_provider();
    request("https://app.astermail.org.example.test/join/family?token=x");

    expect(warning()).not.toBeNull();
    expect(current_path()).toBe("/inbox");
  });

  it("reports an opened link at once when the warning is dismissed", () => {
    h.preferences.external_link_warning_dismissed = true;
    render_provider();
    const on_result = request(FIRST_URL);

    expect(warning()).toBeNull();
    expect(h.open_external).toHaveBeenCalledWith(FIRST_URL);
    expect(on_result).toHaveBeenCalledWith(true);
  });

  it("reports an opened link at once for a trusted domain", () => {
    h.trusted = true;
    render_provider();
    const on_result = request(FIRST_URL);

    expect(warning()).toBeNull();
    expect(h.open_external).toHaveBeenCalledWith(FIRST_URL);
    expect(on_result).toHaveBeenCalledWith(true);
  });

  it("reports a closed link when a newer request replaces the warning", () => {
    render_provider();
    const first = request(FIRST_URL);
    const second = request(SECOND_URL);

    expect(first).toHaveBeenCalledWith(false);
    expect(second).not.toHaveBeenCalled();
    expect(warning()?.dataset.url).toBe(SECOND_URL);

    click_warning("confirm");

    expect(h.open_external).toHaveBeenCalledTimes(1);
    expect(h.open_external).toHaveBeenCalledWith(SECOND_URL);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(true);
  });

  it("reports a closed link when the provider unmounts with the warning open", () => {
    render_provider();
    const on_result = request(FIRST_URL);

    act(() => root!.unmount());
    root = null;

    expect(on_result).toHaveBeenCalledWith(false);
  });

  it("still opens a link from an event without a result callback", () => {
    render_provider();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("aster-external-link", { detail: { url: FIRST_URL } }),
      );
    });

    expect(warning()?.dataset.url).toBe(FIRST_URL);
    click_warning("confirm");

    expect(h.open_external).toHaveBeenCalledWith(FIRST_URL);
  });

  it("keeps working for callers that pass no result callback", () => {
    h.trusted = true;
    render_provider();

    act(() => handle_external_link!(FIRST_URL));

    expect(h.open_external).toHaveBeenCalledWith(FIRST_URL);
  });

  it("opens exactly the href it was given", () => {
    const href =
      "https://click.example-mail.com/ls/click?upn=a%2Fb&utm_source=x#frag";

    render_provider();
    request(href);
    click_warning("confirm");

    expect(h.open_external).toHaveBeenCalledWith(href);
  });

  it("passes the link text from an event to the warning", () => {
    render_provider();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("aster-external-link", {
          detail: { url: FIRST_URL, link_text: "paypal.com" },
        }),
      );
    });

    expect(warning()?.dataset.linkText).toBe("paypal.com");
  });

  it("passes the link that opened the warning so focus can return to it", () => {
    const link = document.createElement("a");

    link.id = "message_link";
    document.body.appendChild(link);
    render_provider();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("aster-external-link", {
          detail: { url: FIRST_URL, trigger: link },
        }),
      );
    });

    expect(warning()?.dataset.returnFocus).toBe("message_link");
    link.remove();
  });

  it("always shows the warning for a blocked link and never opens it", () => {
    h.preferences.external_link_warning_dismissed = true;
    h.trusted = true;
    render_provider();

    for (const url of ["javascript:alert(1)", "data:text/html,hi"]) {
      const on_result = request(url);

      expect(warning()?.dataset.url).toBe(url);
      click_warning("confirm");

      expect(h.open_external).not.toHaveBeenCalled();
      expect(on_result).toHaveBeenCalledWith(false);
    }
  });
});

describe("ExternalLinkProvider unsubscribe pages", () => {
  beforeEach(() => {
    h.preferences.external_link_warning_dismissed = false;
    h.preferences.unsubscribe_confirm_dismissed = false;
    h.update_preference.mockClear();
    h.lockdown_active = false;
    h.trusted = false;
    h.open_external.mockClear();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    handle_external_link = null;
  });

  function request_unsubscribe(url: string) {
    const on_result = vi.fn();

    act(() => handle_external_link!(url, on_result, null, null, "unsubscribe"));

    return on_result;
  }

  it("confirms an unsubscribe page even when link warnings are off", () => {
    h.preferences.external_link_warning_dismissed = true;
    h.trusted = true;
    render_provider();
    const on_result = request_unsubscribe(FIRST_URL);

    expect(warning()?.dataset.kind).toBe("unsubscribe");
    expect(h.open_external).not.toHaveBeenCalled();

    click_warning("confirm");

    expect(h.open_external).toHaveBeenCalledWith(FIRST_URL);
    expect(on_result).toHaveBeenCalledWith(true);
  });

  it("opens an unsubscribe page at once after the confirmation is dismissed", () => {
    h.preferences.unsubscribe_confirm_dismissed = true;
    render_provider();
    const on_result = request_unsubscribe(FIRST_URL);

    expect(warning()).toBeNull();
    expect(h.open_external).toHaveBeenCalledWith(FIRST_URL);
    expect(on_result).toHaveBeenCalledWith(true);
  });

  it("keeps link warnings on when the unsubscribe confirmation is dismissed", () => {
    h.preferences.unsubscribe_confirm_dismissed = true;
    render_provider();
    request(SECOND_URL);

    expect(warning()?.dataset.kind).toBe("link");
  });

  it("stores the unsubscribe preference, not the link preference", () => {
    render_provider();
    request_unsubscribe(FIRST_URL);
    click_warning("dismiss");

    expect(h.update_preference).toHaveBeenCalledWith(
      "unsubscribe_confirm_dismissed",
      true,
      true,
    );
    expect(h.update_preference).not.toHaveBeenCalledWith(
      "external_link_warning_dismissed",
      true,
      true,
    );
  });

  it("still blocks an unsubscribe page during a lockdown", () => {
    h.preferences.unsubscribe_confirm_dismissed = true;
    h.lockdown_active = true;
    render_provider();
    const on_result = request_unsubscribe(FIRST_URL);

    expect(warning()).not.toBeNull();
    click_warning("confirm");

    expect(h.open_external).not.toHaveBeenCalled();
    expect(on_result).toHaveBeenCalledWith(false);
  });
});
