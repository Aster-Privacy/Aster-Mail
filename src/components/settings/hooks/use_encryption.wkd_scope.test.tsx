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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const sender_options: {
  id: string;
  email: string;
  type: string;
  is_enabled: boolean;
  is_catch_all?: boolean;
}[] = [];

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}[${Object.values(params).join("|")}]` : key,
  }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { publish_to_wkd: false, publish_to_keyservers: false },
    update_preference: vi.fn(),
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
  publish_key_to_keyserver: vi.fn(),
  get_keyserver_publication_status: vi.fn(() =>
    Promise.resolve({ data: null }),
  ),
  clear_external_key_cache: vi.fn(),
}));

vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => ({
    sender_options: [...sender_options],
    loading: false,
  }),
}));

vi.mock("@/services/pgp_uid_service", () => ({
  ensure_identity_key_addresses: vi.fn(),
}));

import { use_encryption, wkd_uncovered_addresses } from "./use_encryption";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("wkd_uncovered_addresses", () => {
  it("covers only a primary address on a served domain", () => {
    expect(
      wkd_uncovered_addresses([
        { email: "me@astermail.org", is_primary: true },
        { email: "alias@aster.cx", is_primary: false },
        { email: "me@example.com", is_primary: false },
      ]),
    ).toEqual(["alias@aster.cx", "me@example.com"]);
  });

  it("lists a primary address on another domain", () => {
    expect(
      wkd_uncovered_addresses([{ email: "me@example.com", is_primary: true }]),
    ).toEqual(["me@example.com"]);
  });
});

describe("use_encryption wkd description", () => {
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
  };

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    sender_options.length = 0;
  });

  it("keeps the plain description for a single primary address", async () => {
    sender_options.push({
      id: "primary",
      email: "me@astermail.org",
      type: "primary",
      is_enabled: true,
    });
    await mount();

    expect(hook!.wkd_description).toBe("settings.publish_keys_wkd_description");
  });

  it("names the addresses that are not published", async () => {
    sender_options.push(
      {
        id: "primary",
        email: "me@astermail.org",
        type: "primary",
        is_enabled: true,
      },
      {
        id: "domain-1",
        email: "me@example.com",
        type: "domain",
        is_enabled: true,
      },
    );
    await mount();

    expect(hook!.wkd_description).toBe(
      "settings.publish_keys_wkd_description settings.publish_keys_wkd_not_covered[me@example.com]",
    );
  });

  it("shortens a long list", async () => {
    sender_options.push({
      id: "primary",
      email: "me@astermail.org",
      type: "primary",
      is_enabled: true,
    });
    for (const name of ["a", "b", "c", "d", "e"]) {
      sender_options.push({
        id: name,
        email: `${name}@aster.cx`,
        type: "alias",
        is_enabled: true,
      });
    }
    await mount();

    expect(hook!.wkd_description).toBe(
      "settings.publish_keys_wkd_description settings.publish_keys_wkd_not_covered[a@aster.cx, b@aster.cx, c@aster.cx, common.n_more[2]]",
    );
  });
});
