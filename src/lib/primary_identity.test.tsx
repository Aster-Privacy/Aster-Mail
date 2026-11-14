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
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const sender_options_state: { value: SenderOption[] } = { value: [] };

vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => ({ sender_options: sender_options_state.value }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ data: { sender_id: null } })),
    put: vi.fn(async () => ({ data: {} })),
  },
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

const { resolve_primary_identity, use_primary_identity } = await import(
  "./primary_identity"
);
const { set_preferred_sender_id, clear_preferred_sender_local } = await import(
  "./preferred_sender"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ACCOUNT_EMAIL = "nikola@astermail.org";

const OPTIONS: SenderOption[] = [
  {
    id: "primary",
    email: ACCOUNT_EMAIL,
    type: "primary",
    is_enabled: true,
  },
  {
    id: "domain-abc",
    email: "info@example.com",
    type: "domain",
    is_enabled: true,
  },
  {
    id: "alias-1",
    email: "shop@astermail.org",
    type: "alias",
    is_enabled: false,
  },
  {
    id: "ghost-1",
    email: "ghost@astermail.org",
    type: "ghost",
    is_enabled: true,
  },
];

describe("resolve_primary_identity", () => {
  it("returns the default sender when one is set", () => {
    const identity = resolve_primary_identity(OPTIONS, "domain-abc", ACCOUNT_EMAIL);

    expect(identity.email).toBe("info@example.com");
    expect(identity.is_custom).toBe(true);
  });

  it("matches a default sender id saved without the domain prefix", () => {
    expect(
      resolve_primary_identity(OPTIONS, "abc", ACCOUNT_EMAIL).email,
    ).toBe("info@example.com");
  });

  it("falls back to the primary address without a default sender", () => {
    const identity = resolve_primary_identity(OPTIONS, null, ACCOUNT_EMAIL);

    expect(identity.email).toBe(ACCOUNT_EMAIL);
    expect(identity.is_custom).toBe(false);
  });

  it("ignores a disabled or ghost default sender", () => {
    expect(
      resolve_primary_identity(OPTIONS, "alias-1", ACCOUNT_EMAIL).email,
    ).toBe(ACCOUNT_EMAIL);
    expect(
      resolve_primary_identity(OPTIONS, "ghost-1", ACCOUNT_EMAIL).email,
    ).toBe(ACCOUNT_EMAIL);
  });

  it("uses the sign-in address before sender options load", () => {
    expect(resolve_primary_identity([], "domain-abc", ACCOUNT_EMAIL).email).toBe(
      ACCOUNT_EMAIL,
    );
  });
});

describe("use_primary_identity", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  function Probe(): React.ReactElement {
    const identity = use_primary_identity(ACCOUNT_EMAIL);

    return <span>{identity.email}</span>;
  }

  beforeEach(() => {
    sender_options_state.value = OPTIONS;
    clear_preferred_sender_local();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    clear_preferred_sender_local();
  });

  it("updates when the default sender changes", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(<Probe />);
    });

    expect(container.textContent).toBe(ACCOUNT_EMAIL);

    act(() => {
      set_preferred_sender_id("domain-abc");
    });

    expect(container.textContent).toBe("info@example.com");

    act(() => {
      set_preferred_sender_id(null);
    });

    expect(container.textContent).toBe(ACCOUNT_EMAIL);
  });
});
