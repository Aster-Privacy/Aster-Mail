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
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  auth: { is_authenticated: false, is_loading: false, user: null },
  preview_invite: vi.fn(),
}));

vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => h.auth,
}));

vi.mock("@/lib/i18n/context", () => {
  const t = (key: string) => key;

  return { use_i18n: () => ({ t }) };
});

vi.mock("@/services/api/family", () => ({
  preview_invite: (token: string) => h.preview_invite(token),
  join_family: vi.fn(),
}));

vi.mock("@/components/auth/auth_styles", () => ({
  Logo: () => <span data-testid="logo" />,
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => <span data-testid="spinner" />,
  ButtonSpinner: () => <span />,
}));

const { default: JoinFamilyPage } = await import("./join_family");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TOKEN = "c".repeat(64);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_page() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={[`/join/family?token=${TOKEN}`]}>
        <JoinFamilyPage />
      </MemoryRouter>,
    );
  });
}

function text() {
  return container!.textContent ?? "";
}

function spinning() {
  return container!.querySelector('[data-testid="spinner"]') !== null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("JoinFamilyPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.auth = { is_authenticated: false, is_loading: false, user: null };
    h.preview_invite.mockReset();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  });

  it("shows the invite and tells the boot screen it is ready", async () => {
    const ready = vi.fn();

    window.addEventListener("astermail:app-ready", ready);
    h.preview_invite.mockResolvedValue({
      data: { valid: true, inviter_name: "Sam", plan_name: "Nova" },
    });
    render_page();
    await flush();

    expect(spinning()).toBe(false);
    expect(text()).toContain("settings.family_join_title");
    expect(ready).toHaveBeenCalled();
    window.removeEventListener("astermail:app-ready", ready);
  });

  it("offers a retry when the preview never answers", async () => {
    h.preview_invite.mockReturnValue(new Promise(() => {}));
    render_page();
    await flush();

    expect(spinning()).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    expect(spinning()).toBe(false);
    expect(text()).toContain("common.retry");
  });

  it("offers a retry when the preview request throws", async () => {
    h.preview_invite.mockRejectedValue(new Error("offline"));
    render_page();
    await flush();

    expect(spinning()).toBe(false);
    expect(text()).toContain("common.retry");
  });

  it("stops waiting on a sign-in check that never finishes", async () => {
    h.auth = { is_authenticated: false, is_loading: true, user: null };
    h.preview_invite.mockResolvedValue({ data: { valid: true } });
    render_page();
    await flush();

    expect(spinning()).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    expect(spinning()).toBe(false);
    expect(text()).toContain("common.loading_stuck");
    expect(text()).toContain("common.retry");
  });

  it("shows an invalid invite for a token the server rejects", async () => {
    h.preview_invite.mockResolvedValue({ data: { valid: false } });
    render_page();
    await flush();

    expect(text()).toContain("settings.family_join_invalid");
  });
});
