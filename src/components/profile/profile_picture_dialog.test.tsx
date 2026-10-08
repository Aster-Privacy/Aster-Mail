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
  method: "direct",
  listeners: new Set<() => void>(),
}));

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: {
    get_method: () => h.method,
    subscribe: (listener: () => void) => {
      h.listeners.add(listener);

      return () => h.listeners.delete(listener);
    },
  },
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: null }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {} }),
}));

vi.mock("@/hooks/use_profile_picture_upload", () => ({
  use_profile_picture_upload: () => ({}),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { ProfilePictureDialogView } = await import("./profile_picture_dialog");

let container: HTMLDivElement;
let root: Root;
let fetch_mock: ReturnType<typeof vi.fn>;

async function mount(): Promise<void> {
  await act(async () => {
    root.render(
      <ProfilePictureDialogView
        is_open
        color="#336699"
        error={null}
        has_saved_picture={false}
        name="Ada"
        picture={null}
        removing={false}
        uploading={false}
        on_choose_file={async () => undefined}
        on_close={() => undefined}
        on_remove={() => undefined}
        on_upload={() => undefined}
      />,
    );
  });
}

function gallery_row(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("common.profile_picture_gallery"),
  );
}

async function set_method(method: string): Promise<void> {
  await act(async () => {
    h.method = method;
    h.listeners.forEach((listener) => listener());
  });
}

describe("profile picture gallery on a routed connection", () => {
  beforeEach(() => {
    h.method = "direct";
    fetch_mock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [{ slug: "aurora_01", category: "aurora" }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetch_mock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it.each(["tor", "tor_snowflake", "cdn_relay"])(
    "hides the gallery in %s mode",
    async (method) => {
      h.method = method;
      await mount();

      expect(document.body.textContent).toContain(
        "common.profile_picture_upload",
      );
      expect(gallery_row()).toBeUndefined();
      expect(document.querySelector('img[src*="/thumb/"]')).toBeNull();
      expect(fetch_mock).not.toHaveBeenCalled();
    },
  );

  it("settles on one view when the gallery is opened and closed quickly", async () => {
    await mount();

    const back_button = () =>
      document.querySelector<HTMLButtonElement>(
        'button[aria-label="common.back"]',
      );

    await act(async () => {
      gallery_row()?.click();
    });
    await act(async () => {
      back_button()?.click();
    });
    await act(async () => {
      gallery_row()?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(
      document.querySelectorAll('button[aria-label="common.back"]'),
    ).toHaveLength(1);
    expect(document.querySelectorAll('img[src*="/thumb/"]')).toHaveLength(1);
    expect(fetch_mock).toHaveBeenCalledTimes(1);
  });

  it("drops the thumbnails when the connection becomes routed", async () => {
    await mount();

    await act(async () => {
      gallery_row()?.click();
    });

    expect(document.querySelector('img[src*="/thumb/"]')).not.toBeNull();

    await set_method("tor");

    expect(document.querySelector('img[src*="/thumb/"]')).toBeNull();
    expect(gallery_row()).toBeUndefined();
  });
});
