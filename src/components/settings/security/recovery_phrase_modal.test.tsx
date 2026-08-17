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

import { RecoveryPhraseModal } from "./recovery_phrase_modal";
import { api_client } from "@/services/api/client";
import { save_phrase_wrap } from "@/services/api/recovery";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import {
  is_valid_recovery_phrase,
  unwrap_vault_with_phrase,
} from "@/services/crypto/recovery_phrase";

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("@/services/api/recovery", () => ({
  save_phrase_wrap: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: vi.fn(),
}));

vi.mock("@/services/crypto/recovery_pdf", () => ({
  generate_recovery_phrase_pdf: vi.fn(),
  download_recovery_phrase_text: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "test@astermail.org" } }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({
    is_open,
    children,
  }: {
    is_open: boolean;
    children?: unknown;
  }) => (is_open ? <div data-testid="modal">{children as never}</div> : null),
  ModalHeader: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalTitle: ({ children }: { children?: unknown }) => (
    <h2>{children as never}</h2>
  ),
  ModalDescription: ({ children }: { children?: unknown }) => (
    <p>{children as never}</p>
  ),
  ModalBody: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalFooter: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children?: unknown;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children as never}
    </button>
  ),
}));

const mocked_get = vi.mocked(api_client.get);
const mocked_post = vi.mocked(api_client.post);
const mocked_save = vi.mocked(save_phrase_wrap);
const mocked_vault = vi.mocked(get_vault_from_memory);

const vault_fixture = {
  identity_key: "identity-key-material",
  signed_prekey: "signed-prekey",
  signed_prekey_private: "signed-prekey-private",
  recovery_codes: [],
  data_kek: "data-kek-material",
  vault_format: 3,
};

let container: HTMLDivElement;
let root: Root;

function render_modal(props: { has_phrase?: boolean } = {}) {
  act(() => {
    root.render(
      <RecoveryPhraseModal
        has_phrase={props.has_phrase ?? false}
        is_open
        on_close={() => {}}
        on_saved={() => {}}
      />,
    );
  });
}

async function wait_until(predicate: () => boolean, timeout = 15000) {
  const start = Date.now();

  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error(`timed out waiting; content: ${container.textContent}`);
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

function set_input(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function find_button(label: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes(label),
  );

  if (!match) throw new Error(`button not found: ${label}`);

  return match;
}

describe("RecoveryPhraseModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocked_get.mockReset();
    mocked_post.mockReset();
    mocked_save.mockReset();
    mocked_vault.mockReset();
    mocked_vault.mockReturnValue(vault_fixture as never);
    mocked_get.mockResolvedValue({
      data: { salt: btoa("0123456789abcdef"), totp_required: false },
    } as never);
    mocked_post.mockResolvedValue({ data: { verified: true } } as never);
    mocked_save.mockResolvedValue({ data: { success: true } } as never);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("shows the generate title when no phrase exists", () => {
    render_modal({ has_phrase: false });
    expect(container.textContent).toContain(
      "settings.recovery_phrase_generate",
    );
    expect(container.textContent).not.toContain(
      "settings.recovery_phrase_regenerate_warning",
    );
  });

  it("shows the regenerate warning when a phrase already exists", () => {
    render_modal({ has_phrase: true });
    expect(container.textContent).toContain(
      "settings.recovery_phrase_regenerate_warning",
    );
  });

  it("generates a valid phrase whose server wrap unwraps to the exact vault", async () => {
    vi.useRealTimers();
    render_modal();

    const password_input = container.querySelector(
      "#phrase-current-password",
    ) as HTMLInputElement;

    expect(password_input).toBeTruthy();
    set_input(password_input, "correct horse battery staple");

    const generate_button = find_button("settings.recovery_phrase_generate");

    await act(async () => {
      generate_button.click();
    });
    await wait_until(() => mocked_save.mock.calls.length === 1);
    await wait_until(
      () => container.querySelectorAll(".font-mono").length === 12,
    );

    expect(mocked_post).toHaveBeenCalledWith(
      "/crypto/v1/encryption/verify-password",
      expect.objectContaining({ password_hash: expect.any(String) }),
    );
    expect(mocked_save).toHaveBeenCalledTimes(1);

    const [hash, verifier_hash, wrapped_vault, wrap_nonce, wrap_salt] =
      mocked_save.mock.calls[0];

    expect(hash).toBeTruthy();
    expect(verifier_hash).toBeTruthy();

    const shown_words = Array.from(
      container.querySelectorAll(".font-mono"),
    ).map((el) => el.textContent?.trim() ?? "");

    expect(shown_words).toHaveLength(12);

    const phrase = shown_words.join(" ");

    expect(is_valid_recovery_phrase(phrase)).toBe(true);

    const unwrapped = await unwrap_vault_with_phrase(
      phrase,
      wrapped_vault,
      wrap_nonce,
      wrap_salt,
    );

    expect(unwrapped).not.toBeNull();
    expect(JSON.parse(unwrapped as string)).toEqual(vault_fixture);
  });

  it("does not save when password verification fails", async () => {
    vi.useRealTimers();
    mocked_post.mockResolvedValue({ data: { verified: false } } as never);
    render_modal();

    const password_input = container.querySelector(
      "#phrase-current-password",
    ) as HTMLInputElement;

    set_input(password_input, "wrong password");

    await act(async () => {
      find_button("settings.recovery_phrase_generate").click();
    });
    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.incorrect_password_error",
      ),
    );

    expect(mocked_save).not.toHaveBeenCalled();
  });

  it("asks for a 2FA code when the account requires it", async () => {
    vi.useRealTimers();
    mocked_get.mockResolvedValue({
      data: { salt: btoa("0123456789abcdef"), totp_required: true },
    } as never);
    render_modal();

    const password_input = container.querySelector(
      "#phrase-current-password",
    ) as HTMLInputElement;

    set_input(password_input, "correct horse battery staple");

    await act(async () => {
      find_button("settings.recovery_phrase_generate").click();
    });
    await wait_until(
      () => container.querySelector("#phrase-totp-code") !== null,
    );

    expect(mocked_save).not.toHaveBeenCalled();

    const totp_input = container.querySelector(
      "#phrase-totp-code",
    ) as HTMLInputElement;

    set_input(totp_input, "123456");

    await act(async () => {
      find_button("settings.recovery_phrase_generate").click();
    });
    await wait_until(() => mocked_save.mock.calls.length === 1);

    expect(mocked_post).toHaveBeenCalledWith(
      "/crypto/v1/encryption/verify-password",
      expect.objectContaining({ totp_code: "123456" }),
    );
    expect(mocked_save).toHaveBeenCalledTimes(1);
  });
});
