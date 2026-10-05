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
const ensure_identity_key_addresses = vi.fn();
const sender_options: {
  id: string;
  email: string;
  type: string;
  is_enabled: boolean;
  is_catch_all?: boolean;
}[] = [];

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
  publish_key_to_keyserver: (...args: unknown[]) =>
    publish_key_to_keyserver(...args),
  get_keyserver_publication_status: () => get_keyserver_publication_status(),
  clear_external_key_cache: vi.fn(),
}));

vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => ({
    sender_options: [...sender_options],
    loading: false,
  }),
}));

vi.mock("@/services/pgp_uid_service", () => ({
  ensure_identity_key_addresses: (...args: unknown[]) =>
    ensure_identity_key_addresses(...args),
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
    ensure_identity_key_addresses.mockReset();
    ensure_identity_key_addresses.mockResolvedValue("updated");
    sender_options.length = 0;
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

  it("does not claim publication when the status cannot be read", async () => {
    get_keyserver_publication_status.mockResolvedValue({
      data: null,
      error: "network_error",
    });

    await publish();

    expect(show_toast).not.toHaveBeenCalledWith(
      "settings.key_published_keyserver",
      "success",
    );
    expect(show_toast).toHaveBeenCalledWith(
      "settings.keyserver_publish_unconfirmed",
      "info",
    );
    expect(show_toast).toHaveBeenCalledTimes(1);
  });

  it("does not claim publication when the status request throws", async () => {
    get_keyserver_publication_status.mockRejectedValue(new Error("offline"));

    await publish();

    expect(show_toast).not.toHaveBeenCalledWith(
      "settings.key_published_keyserver",
      "success",
    );
    expect(show_toast).toHaveBeenCalledWith(
      "settings.keyserver_publish_unconfirmed",
      "info",
    );
  });

  it("does not claim publication when the keyserver reports it unpublished", async () => {
    get_keyserver_publication_status.mockResolvedValue({
      data: { published: false, state: "not_published" },
    });

    await publish();

    expect(show_toast).not.toHaveBeenCalledWith(
      "settings.key_published_keyserver",
      "success",
    );
    expect(show_toast).toHaveBeenCalledWith(
      "settings.keyserver_publish_unconfirmed",
      "info",
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

  const with_addresses = async () => {
    sender_options.push(
      {
        id: "primary",
        email: "me@astermail.org",
        type: "primary",
        is_enabled: true,
      },
      {
        id: "alias",
        email: "Alias@astermail.org",
        type: "alias",
        is_enabled: true,
      },
      {
        id: "domain",
        email: "me@custom.test",
        type: "domain",
        is_enabled: true,
      },
      {
        id: "catch_all",
        email: "*@custom.test",
        type: "domain",
        is_enabled: true,
        is_catch_all: true,
      },
      {
        id: "external",
        email: "me@elsewhere.test",
        type: "external",
        is_enabled: true,
      },
    );
    await act(async () => {
      root.render(<Harness />);
    });
  };

  it("offers the account's own addresses and selects the primary one", async () => {
    await with_addresses();

    expect(hook!.keyserver_address_rows).toEqual([
      {
        email: "me@astermail.org",
        selected: true,
        disabled: false,
        state: null,
      },
      {
        email: "alias@astermail.org",
        selected: false,
        disabled: false,
        state: null,
      },
      {
        email: "me@custom.test",
        selected: false,
        disabled: false,
        state: null,
      },
    ]);

    await publish();

    expect(ensure_identity_key_addresses).not.toHaveBeenCalled();
    expect(publish_key_to_keyserver).toHaveBeenCalledWith(["me@astermail.org"]);
  });

  it("adds the selected addresses to the key before it publishes them", async () => {
    await with_addresses();
    await act(async () => {
      hook!.handle_keyserver_address_toggle("me@custom.test");
    });
    await publish();

    expect(ensure_identity_key_addresses).toHaveBeenCalledWith(
      [
        { email: "me@astermail.org", name: undefined },
        { email: "me@custom.test", name: undefined },
      ],
      true,
    );
    expect(publish_key_to_keyserver).toHaveBeenCalledWith([
      "me@astermail.org",
      "me@custom.test",
    ]);
  });

  it("does not publish when the key cannot take the selected addresses", async () => {
    ensure_identity_key_addresses.mockResolvedValue("failed");
    await with_addresses();
    await act(async () => {
      hook!.handle_keyserver_address_toggle("alias@astermail.org");
    });
    await publish();

    expect(publish_key_to_keyserver).not.toHaveBeenCalled();
    expect(show_toast).toHaveBeenCalledWith(
      "settings.keyserver_key_update_failed",
      "error",
    );
  });

  it("does not publish when no address is selected", async () => {
    await with_addresses();
    await act(async () => {
      hook!.handle_keyserver_address_toggle("me@astermail.org");
    });

    expect(hook!.keyserver_can_publish).toBe(false);

    await publish();

    expect(publish_key_to_keyserver).not.toHaveBeenCalled();
  });

  it("shows the status of each address and keeps the published selection", async () => {
    await with_addresses();
    get_keyserver_publication_status.mockResolvedValue({
      data: {
        published: false,
        state: "awaiting_verification",
        addresses: [
          { address: "me@astermail.org", state: "published" },
          { address: "me@custom.test", state: "awaiting_verification" },
          { address: "old@astermail.org", state: "published" },
        ],
      },
    });

    await publish();

    expect(hook!.keyserver_address_rows).toEqual([
      {
        email: "me@astermail.org",
        selected: true,
        disabled: false,
        state: "published",
      },
      {
        email: "alias@astermail.org",
        selected: false,
        disabled: false,
        state: null,
      },
      {
        email: "me@custom.test",
        selected: true,
        disabled: false,
        state: "awaiting_verification",
      },
      {
        email: "old@astermail.org",
        selected: false,
        disabled: true,
        state: "published",
      },
    ]);
  });

  it("checks again while the keyserver awaits confirmation", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    vi.useFakeTimers();

    try {
      get_keyserver_publication_status.mockResolvedValue({
        data: { published: false, state: "awaiting_verification" },
      });
      await publish();

      const before = get_keyserver_publication_status.mock.calls.length;

      get_keyserver_publication_status.mockResolvedValue({
        data: { published: true, state: "published" },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(get_keyserver_publication_status.mock.calls.length).toBe(
        before + 1,
      );
      expect(hook!.keyserver_state).toBe("published");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(180_000);
      });

      expect(get_keyserver_publication_status.mock.calls.length).toBe(
        before + 1,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
