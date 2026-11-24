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
import type { UseGhostModeReturn } from "./use_ghost_mode";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ghost_api = vi.hoisted(() => ({
  create_ghost_alias: vi.fn(async (..._args: unknown[]) => ({
    data: { success: true, id: "ghost-1" },
  })),
}));

const captcha = vi.hoisted(() => ({
  request_creation_token: vi.fn<() => Promise<string | null | undefined>>(),
}));

vi.mock("@/services/api/ghost_aliases", () => ({
  generate_ghost_local_part: vi.fn(() => "quiet.fern"),
  create_ghost_alias: ghost_api.create_ghost_alias,
  lookup_ghost_for_thread: vi.fn(async () => ({ data: null })),
  decrypt_ghost_alias: vi.fn(),
  list_ghost_aliases: vi.fn(async () => ({ data: { aliases: [] } })),
  decrypt_ghost_aliases: vi.fn(async () => []),
  extend_ghost_alias: vi.fn(),
  GHOST_DOMAIN: "ghost.test",
}));

vi.mock("@/services/api/aliases", () => ({
  compute_alias_hash: vi.fn(async (l: string, d: string) => `H:${l}@${d}`),
}));

vi.mock("@/stores/ghost_alias_store", () => ({
  register_ghost_email: vi.fn(),
  get_ghost_sender: vi.fn(() => null),
}));

vi.mock("@/services/api/csrf", () => ({ has_csrf_token: vi.fn(() => true) }));

vi.mock("@/services/api/client", () => ({
  api_client: { refresh_session: vi.fn(async () => {}) },
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/auth/turnstile_widget", () => captcha);

import { use_ghost_mode } from "./use_ghost_mode";

let container: HTMLDivElement;
let root: Root;
let latest: UseGhostModeReturn | null = null;

function Harness() {
  latest = use_ghost_mode();

  return null;
}

async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(async () => {
  ghost_api.create_ghost_alias.mockClear();
  captcha.request_creation_token.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Harness />);
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  latest = null;
});

describe("ghost alias creation token", () => {
  it("sends the verification token with a new ghost alias", async () => {
    captcha.request_creation_token.mockResolvedValue("captcha-1");

    await act(async () => {
      latest!.toggle_ghost_mode();
    });
    await settle();

    expect(ghost_api.create_ghost_alias).toHaveBeenCalledTimes(1);
    expect(ghost_api.create_ghost_alias.mock.calls[0][3]).toBe("captcha-1");
    expect(latest!.is_ghost_enabled).toBe(true);
  });

  it("creates nothing when the check is canceled", async () => {
    captcha.request_creation_token.mockResolvedValue(null);

    await act(async () => {
      latest!.toggle_ghost_mode();
    });
    await settle();

    expect(ghost_api.create_ghost_alias).not.toHaveBeenCalled();
    expect(latest!.is_ghost_enabled).toBe(false);
    expect(latest!.is_creating).toBe(false);
  });
});
