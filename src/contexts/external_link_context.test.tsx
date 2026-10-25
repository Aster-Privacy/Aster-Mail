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

const h = vi.hoisted(() => ({
  preferences: { external_link_warning_dismissed: false as boolean },
  lockdown_active: false as boolean,
  trusted: false as boolean,
  open_external: vi.fn(),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: h.preferences,
    update_preference: vi.fn(),
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
    on_confirm,
    on_close,
  }: {
    is_open: boolean;
    url: string;
    on_confirm: () => void;
    on_close: () => void;
  }) =>
    is_open ? (
      <div data-testid="link_warning" data-url={url}>
        <button type="button" data-action="confirm" onClick={on_confirm}>
          confirm
        </button>
        <button type="button" data-action="cancel" onClick={on_close}>
          cancel
        </button>
      </div>
    ) : null,
}));

const { ExternalLinkProvider, use_external_link } = await import(
  "./external_link_context"
);

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

function render_provider() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <ExternalLinkProvider>
        <Capture />
      </ExternalLinkProvider>,
    );
  });
}

function warning() {
  return container!.querySelector<HTMLElement>('[data-testid="link_warning"]');
}

function click_warning(action: "confirm" | "cancel") {
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
});
