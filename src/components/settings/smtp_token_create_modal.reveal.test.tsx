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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  create_smtp_token: vi.fn(),
  copy_text: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button className={className} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

vi.mock("@/services/api/smtp_tokens", () => ({
  create_smtp_token: h.create_smtp_token,
}));

vi.mock("@/utils/copy_text", () => ({ copy_text: h.copy_text }));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

import { SmtpTokenCreateModal } from "@/components/settings/smtp_token_create_modal";

let container: HTMLDivElement;
let root: Root;

async function render_reveal_step(on_close: () => void) {
  await act(async () => {
    root.render(
      <SmtpTokenCreateModal
        addresses={[
          {
            value: "me@example.com",
            domain_name: "example.com",
            local_part: "me",
          },
        ]}
        is_open={true}
        on_close={on_close}
        on_created={() => {}}
      />,
    );
  });

  const name_input = container.querySelector("input");

  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;

    setter?.call(name_input, "printer");
    name_input?.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const submit = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("settings.smtp_token_generate"),
  );

  await act(async () => {
    submit?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("smtp token create modal reveal step", () => {
  beforeEach(() => {
    h.create_smtp_token.mockReset();
    h.copy_text.mockReset();
    h.create_smtp_token.mockResolvedValue({
      data: {
        token: "sample-app-pass",
        smtp_settings: {
          host: "smtp.astermail.org",
          port: 587,
          security: "STARTTLS",
          username: "me@example.com",
        },
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the credentials open when escape is pressed", async () => {
    const on_close = vi.fn();

    await render_reveal_step(on_close);

    expect(container.textContent).toContain("sample-app-pass");

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(on_close).not.toHaveBeenCalled();
    expect(container.textContent).toContain("sample-app-pass");
  });

  it("copies a single credential when its row is clicked", async () => {
    await render_reveal_step(() => {});

    const row = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("sample-app-pass"),
    );

    expect(row).toBeTruthy();

    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(h.copy_text).toHaveBeenCalledWith("sample-app-pass");
  });
});
