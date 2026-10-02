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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const show_toast = vi.fn();
const publish_key_to_keyserver = vi.fn();
const get_keyserver_publication_status = vi.fn();
const update_preference = vi.fn();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast(...args),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { publish_to_wkd: false, publish_to_keyservers: false },
    update_preference,
  }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(() => Promise.resolve({ data: null, error: "offline" })),
    put: vi.fn(() => Promise.resolve({ data: null })),
    post: vi.fn(() => Promise.resolve({ data: null })),
  },
}));

vi.mock("@/services/crypto/ensure_pgp_key_published", () => ({
  ensure_pgp_key_published: vi.fn(() => Promise.resolve({ ok: false })),
}));

vi.mock("@/services/api/keys", () => ({
  publish_key_to_wkd: vi.fn(),
  unpublish_key_from_wkd: vi.fn(),
  publish_key_to_keyserver: () => publish_key_to_keyserver(),
  get_keyserver_publication_status: () => get_keyserver_publication_status(),
  clear_external_key_cache: vi.fn(),
}));

import { use_encryption } from "./use_encryption";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("use_encryption keyserver publish toast", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hook: ReturnType<typeof use_encryption> | null = null;

  function Harness() {
    hook = use_encryption();

    return null;
  }

  beforeEach(async () => {
    show_toast.mockReset();
    publish_key_to_keyserver.mockReset();
    get_keyserver_publication_status.mockReset();
    publish_key_to_keyserver.mockResolvedValue({ data: { success: true } });
    get_keyserver_publication_status.mockResolvedValue({ data: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Harness />);
    });
    show_toast.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  const publish = async () => {
    await act(async () => {
      await hook!.handle_publish_to_keyservers();
    });
  };

  it("says to check the inbox while the keyserver awaits confirmation", async () => {
    get_keyserver_publication_status.mockResolvedValue({
      data: { published: false, state: "awaiting_verification" },
    });

    await publish();

    expect(show_toast).toHaveBeenCalledWith(
      "settings.keyserver_awaiting_hint",
      "info",
    );
    expect(show_toast).not.toHaveBeenCalledWith(
      "settings.key_published_keyserver",
      "success",
    );
  });

  it("reports a failed publication as an error", async () => {
    get_keyserver_publication_status.mockResolvedValue({
      data: { published: false, state: "failed", error: "rejected" },
    });

    await publish();

    expect(show_toast).toHaveBeenCalledWith(
      "settings.keyserver_failed_hint",
      "error",
    );
  });

  it("confirms publication once the keyserver has published the key", async () => {
    get_keyserver_publication_status.mockResolvedValue({
      data: { published: true, state: "published" },
    });

    await publish();

    expect(show_toast).toHaveBeenCalledWith(
      "settings.key_published_keyserver",
      "success",
    );
  });

  it("keeps the failure toast when the publish request fails", async () => {
    publish_key_to_keyserver.mockResolvedValue({ error: "network_error" });
    get_keyserver_publication_status.mockResolvedValue({ data: null });

    await publish();

    expect(show_toast).toHaveBeenCalledWith(
      "settings.failed_publish_keyserver",
      "error",
    );
    expect(show_toast).toHaveBeenCalledTimes(1);
  });
});
