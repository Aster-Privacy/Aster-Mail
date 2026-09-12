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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  show_toast: vi.fn(),
  suppress_special_offer_status: vi.fn(),
  restore_special_offer_status: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: { get: h.get, put: h.put },
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: h.show_toast,
}));

vi.mock("@/stores/special_offer_status", () => ({
  suppress_special_offer_status: h.suppress_special_offer_status,
  restore_special_offer_status: h.restore_special_offer_status,
}));

import { use_offer_preferences } from "./use_offer_preferences";

let container: HTMLDivElement;
let root: Root;

function SpecialOffersSwitch() {
  const { enabled, busy, toggle } = use_offer_preferences();

  if (enabled === null) return null;

  return (
    <button
      aria-checked={enabled}
      disabled={busy}
      role="switch"
      onClick={() => void toggle(!enabled)}
    />
  );
}

function get_switch() {
  return container.querySelector("[role=switch]") as HTMLButtonElement | null;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(<SpecialOffersSwitch />);
  });
}

describe("use_offer_preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.get.mockResolvedValue({ data: { in_app_offers_enabled: true } });
    h.restore_special_offer_status.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("loads the saved preference", async () => {
    await mount();

    expect(h.get).toHaveBeenCalledWith("/core/v1/offers/preferences", {
      skip_cache: true,
    });
    expect(get_switch()?.getAttribute("aria-checked")).toBe("true");
  });

  it("hides the switch when the preference cannot load", async () => {
    h.get.mockResolvedValue({ error: "offline" });

    await mount();

    expect(get_switch()).toBeNull();
  });

  it("turns offers off optimistically and hides them in the session", async () => {
    const pending = deferred<{ data: { in_app_offers_enabled: boolean } }>();

    h.put.mockReturnValueOnce(pending.promise);

    await mount();

    await act(async () => {
      get_switch()?.click();
    });

    expect(get_switch()?.getAttribute("aria-checked")).toBe("false");
    expect(h.put).toHaveBeenCalledWith("/core/v1/offers/preferences", {
      in_app_offers_enabled: false,
    });
    expect(h.suppress_special_offer_status).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ data: { in_app_offers_enabled: false } });
    });

    expect(get_switch()?.getAttribute("aria-checked")).toBe("false");
    expect(h.restore_special_offer_status).not.toHaveBeenCalled();
    expect(h.show_toast).not.toHaveBeenCalled();
  });

  it("rolls back and shows an error when saving fails", async () => {
    h.put.mockResolvedValueOnce({ error: "server_error" });

    await mount();

    await act(async () => {
      get_switch()?.click();
    });

    expect(get_switch()?.getAttribute("aria-checked")).toBe("true");
    expect(h.show_toast).toHaveBeenCalledWith(
      "settings.special_offers_save_failed",
      "error",
    );
    expect(h.restore_special_offer_status).toHaveBeenCalledTimes(1);
  });

  it("refreshes offers from the server when turned back on", async () => {
    h.get.mockResolvedValue({ data: { in_app_offers_enabled: false } });
    h.put.mockResolvedValueOnce({ data: { in_app_offers_enabled: true } });

    await mount();

    await act(async () => {
      get_switch()?.click();
    });

    expect(h.put).toHaveBeenCalledWith("/core/v1/offers/preferences", {
      in_app_offers_enabled: true,
    });
    expect(get_switch()?.getAttribute("aria-checked")).toBe("true");
    expect(h.suppress_special_offer_status).not.toHaveBeenCalled();
    expect(h.restore_special_offer_status).toHaveBeenCalledTimes(1);
  });

  it("keeps offers hidden when turning them on fails", async () => {
    h.get.mockResolvedValue({ data: { in_app_offers_enabled: false } });
    h.put.mockRejectedValueOnce(new Error("offline"));

    await mount();

    await act(async () => {
      get_switch()?.click();
    });

    expect(get_switch()?.getAttribute("aria-checked")).toBe("false");
    expect(h.show_toast).toHaveBeenCalledTimes(1);
    expect(h.restore_special_offer_status).not.toHaveBeenCalled();
  });
});
