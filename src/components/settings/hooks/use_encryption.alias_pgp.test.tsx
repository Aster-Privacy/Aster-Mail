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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  show_toast: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: h.show_toast,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { publish_to_wkd: false, publish_to_keyservers: false },
    update_preference: vi.fn(),
  }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: h.get,
    put: h.put,
    post: vi.fn(() => Promise.resolve({ data: null })),
  },
}));

vi.mock("@/services/crypto/ensure_pgp_key_published", () => ({
  ensure_pgp_key_published: vi.fn(() => Promise.resolve({ ok: false })),
}));

vi.mock("@/services/api/keys", () => ({
  publish_key_to_wkd: vi.fn(),
  unpublish_key_from_wkd: vi.fn(),
  publish_key_to_keyserver: vi.fn(),
  get_keyserver_publication_status: vi.fn(() =>
    Promise.resolve({ data: null }),
  ),
  clear_external_key_cache: vi.fn(),
}));

vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => ({ sender_options: [], loading: false }),
}));

vi.mock("@/services/pgp_uid_service", () => ({
  ensure_identity_key_addresses: vi.fn(),
}));

import { use_encryption } from "./use_encryption";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function encryption_settings(extra: Record<string, unknown>) {
  return {
    data: {
      auto_discover_keys: true,
      encrypt_by_default: false,
      require_encryption: false,
      ipfs_storage_enabled: false,
      keyserver_urls: [],
      ...extra,
    },
  };
}

describe("use_encryption alias PGP setting", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hook: ReturnType<typeof use_encryption> | null = null;

  function Harness() {
    hook = use_encryption();

    return null;
  }

  const mount = async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      await hook!.retry_load_encryption_data();
    });
  };

  const serve = (extra: Record<string, unknown>) => {
    h.get.mockImplementation((url: string) =>
      Promise.resolve(
        url === "/settings/v1/encryption"
          ? encryption_settings(extra)
          : { data: null, error: "offline" },
      ),
    );
  };

  beforeEach(() => {
    h.get.mockReset();
    h.put.mockReset();
    h.show_toast.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("is on when the account never set it", async () => {
    serve({});
    await mount();

    expect(hook!.alias_pgp_enabled).toBe(true);
  });

  it("reads an off value from the server", async () => {
    serve({ alias_pgp_enabled: false });
    await mount();

    expect(hook!.alias_pgp_enabled).toBe(false);
  });

  it("saves the new value to the account", async () => {
    serve({ alias_pgp_enabled: true });
    h.put.mockResolvedValue({ data: { success: true } });
    await mount();

    await act(async () => {
      await hook!.handle_alias_pgp_toggle();
    });

    expect(h.put).toHaveBeenCalledWith("/settings/v1/encryption", {
      alias_pgp_enabled: false,
    });
    expect(hook!.alias_pgp_enabled).toBe(false);
    expect(h.show_toast).not.toHaveBeenCalled();
  });

  it("restores the old value when the save fails", async () => {
    serve({ alias_pgp_enabled: true });
    h.put.mockResolvedValue({ data: null, error: "offline" });
    await mount();

    await act(async () => {
      await hook!.handle_alias_pgp_toggle();
    });

    expect(hook!.alias_pgp_enabled).toBe(true);
    expect(h.show_toast).toHaveBeenCalledWith(
      "settings.failed_save_setting",
      "error",
    );
  });
});
