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

const { ExternalLinkProvider } = await import(
  "@/contexts/external_link_context"
);
const { request_external_link } = await import("./external_link_request");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const URL_UNDER_TEST = "https://sender.example/unsubscribe?u=1";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_provider() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <ExternalLinkProvider>
        <span />
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

function capture(request: () => Promise<boolean>) {
  let result!: Promise<boolean>;

  act(() => {
    result = request();
  });

  return result;
}

async function is_settled(promise: Promise<boolean>) {
  const marker = Symbol("pending");
  const value = await Promise.race([promise, Promise.resolve(marker)]);

  return value !== marker;
}

describe("request_external_link", () => {
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
  });

  it("shows the external link warning before opening", async () => {
    render_provider();
    const result = capture(() => request_external_link(URL_UNDER_TEST));

    expect(h.open_external).not.toHaveBeenCalled();
    expect(warning()?.dataset.url).toBe(URL_UNDER_TEST);
    expect(await is_settled(result)).toBe(false);

    click_warning("confirm");

    expect(h.open_external).toHaveBeenCalledWith(URL_UNDER_TEST);
    expect(await result).toBe(true);
  });

  it("resolves false when the warning is canceled", async () => {
    render_provider();
    const result = capture(() => request_external_link(URL_UNDER_TEST));

    click_warning("cancel");

    expect(h.open_external).not.toHaveBeenCalled();
    expect(await result).toBe(false);
  });

  it("opens at once when the warning is dismissed, like a body link", async () => {
    h.preferences.external_link_warning_dismissed = true;
    render_provider();
    const result = capture(() => request_external_link(URL_UNDER_TEST));

    expect(warning()).toBeNull();
    expect(h.open_external).toHaveBeenCalledWith(URL_UNDER_TEST);
    expect(await result).toBe(true);
  });

  it("never opens the link while a lockdown is active", async () => {
    h.preferences.external_link_warning_dismissed = true;
    h.lockdown_active = true;
    render_provider();
    const result = capture(() => request_external_link(URL_UNDER_TEST));

    expect(warning()).not.toBeNull();
    click_warning("confirm");

    expect(h.open_external).not.toHaveBeenCalled();
    expect(await result).toBe(false);
  });

  it("resolves false when no provider handles the request", async () => {
    expect(await request_external_link(URL_UNDER_TEST)).toBe(false);
    expect(h.open_external).not.toHaveBeenCalled();
  });
});
