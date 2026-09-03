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

const toast_mock = vi.fn();
const invalidate_mock = vi.fn();
const invalidate_stats_mock = vi.fn();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => ({ is_authenticated: true }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => toast_mock(...args),
  TOAST_DURATION_BILLING_MS: 8000,
}));

vi.mock("@/services/api/request_cache", () => ({
  request_cache: { invalidate: (...args: unknown[]) => invalidate_mock(...args) },
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: () => invalidate_stats_mock(),
}));

const { CheckoutReturnHandler } = await import("./checkout_return_handler");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_at(search: string) {
  window.history.replaceState({}, "", search);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<CheckoutReturnHandler />);
  });
}

describe("CheckoutReturnHandler", () => {
  beforeEach(() => {
    toast_mock.mockClear();
    invalidate_mock.mockClear();
    invalidate_stats_mock.mockClear();
    sessionStorage.clear();
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    container?.remove();
    root = null;
    container = null;
    window.history.replaceState({}, "", "/");
  });

  it("confirms a crypto payment and refreshes the plan caches", async () => {
    await render_at("/?crypto=success");

    expect(toast_mock).toHaveBeenCalledWith(
      "settings.crypto_success_toast",
      "success",
    );
    expect(invalidate_mock).toHaveBeenCalledWith("/payments/v1");
    expect(invalidate_mock).toHaveBeenCalledWith("/sync/v1");
    expect(invalidate_stats_mock).toHaveBeenCalled();
  });

  it("confirms a family checkout", async () => {
    await render_at("/?family=success");

    expect(toast_mock).toHaveBeenCalledWith(
      "settings.checkout_welcome",
      "success",
    );
  });

  it("confirms a storage add-on purchase", async () => {
    await render_at("/?addon_purchase=success");

    expect(toast_mock).toHaveBeenCalledWith(
      "settings.addon_purchased",
      "success",
    );
  });

  it("reports a cancelled crypto payment without refreshing caches", async () => {
    await render_at("/?crypto=cancelled");

    expect(toast_mock).toHaveBeenCalledWith(
      "settings.crypto_cancelled_toast",
      "info",
      8000,
    );
    expect(invalidate_mock).not.toHaveBeenCalled();
  });

  it("strips the return parameter from the address bar", async () => {
    await render_at("/?crypto=success&folder=inbox");

    expect(window.location.search).toBe("?folder=inbox");
  });

  it("stays quiet when there is no checkout return", async () => {
    await render_at("/?folder=inbox");

    expect(toast_mock).not.toHaveBeenCalled();
    expect(invalidate_mock).not.toHaveBeenCalled();
  });
});
