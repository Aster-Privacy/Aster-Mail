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
import type { DecryptedEmailAlias } from "@/services/api/aliases";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ is_feature_locked: () => false }),
}));

const { AliasItem } = await import("./alias_card");
const { I18nProvider } = await import("@/lib/i18n/context");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};

const alias: DecryptedEmailAlias = {
  id: "a1",
  local_part: "shop",
  alias_address_hash: "hash-shop",
  domain: "astermail.org",
  full_address: "shop@astermail.org",
  is_enabled: true,
  is_random: false,
  last_received_at: null,
  created_at: "2026-03-01T10:00:00Z",
  updated_at: "2026-03-01T10:00:00Z",
};

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <I18nProvider default_language="en">
        <AliasItem
          alias={alias}
          deleting={false}
          is_avatar_locked={false}
          on_delete={noop}
          on_open_editor={noop}
          on_toggle={noop}
          toggling={false}
        />
      </I18nProvider>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function change_button(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    "button[aria-label='Change profile picture']",
  );

  if (!button) throw new Error("change button missing");

  return button;
}

describe("alias avatar hover", () => {
  it("names the action change profile picture", () => {
    expect(change_button().getAttribute("title")).toBe(
      "Change profile picture",
    );
  });

  it("uses the same dark overlay as the account avatar with no ring", () => {
    const classes = change_button().className.split(/\s+/);

    expect(classes).toContain("bg-black/55");
    expect(classes).toContain("text-white");
    expect(classes.some((c) => c.startsWith("ring"))).toBe(false);
    expect(classes.some((c) => c.includes("field-hover"))).toBe(false);
  });
});
