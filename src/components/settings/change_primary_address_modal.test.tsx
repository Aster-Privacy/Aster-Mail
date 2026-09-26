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
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ChangePrimaryAddressModal } from "./change_primary_address_modal";

import {
  start_primary_address_change,
  resend_primary_address_code,
  check_primary_address_availability,
  confirm_primary_address_change,
  load_primary_address_eligibility,
  type PrimaryAddressEligibility,
} from "@/services/api/primary_address";
import { republish_identity_with_new_address } from "@/services/pgp_uid_service";
import {
  ensure_aliases_and_domains_loaded,
  get_cached_aliases,
} from "@/components/settings/hooks/use_aliases";
import { get_user_salt } from "@/services/api/auth";
import { derive_password_hash } from "@/services/crypto/key_manager";

vi.mock("@/services/api/primary_address", () => ({
  start_primary_address_change: vi.fn(),
  resend_primary_address_code: vi.fn(),
  confirm_primary_address_change: vi.fn(),
  check_primary_address_availability: vi.fn(),
  load_primary_address_eligibility: vi.fn(),
}));

vi.mock("@/services/pgp_uid_service", () => ({
  republish_identity_with_new_address: vi.fn(),
}));

vi.mock("@/components/settings/hooks/use_aliases", () => ({
  clear_aliases_cache: vi.fn(),
  ensure_aliases_and_domains_loaded: vi.fn(),
  get_cached_aliases: vi.fn(),
}));

vi.mock("@/services/api/aliases", () => ({
  get_alias_min_length: () => 3,
  validate_local_part: (local_part: string) =>
    /^[a-z0-9][a-z0-9._-]*$/.test(local_part) && local_part.length >= 3
      ? { valid: true }
      : { valid: false, error_key: "errors.alias_invalid_chars" },
}));

vi.mock("@/services/api/auth", () => ({
  get_user_salt: vi.fn(),
}));

vi.mock("@/services/crypto/key_manager", () => ({
  hash_email: vi.fn(async (email: string) => `hash:${email}`),
  derive_password_hash: vi.fn(async () => ({ hash: "derived-password-hash" })),
  base64_to_array: vi.fn(() => new Uint8Array([1, 2, 3, 4])),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    user: { email: "old@astermail.org", display_name: "Old Name" },
  }),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ is_open, children }: { is_open: boolean; children?: unknown }) =>
    is_open ? <div data-testid="modal">{children as never}</div> : null,
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

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children?: unknown;
  }) => (
    <select
      value={value}
      onChange={(e) => onValueChange(e.currentTarget.value)}
    >
      {children as never}
    </select>
  ),
  SelectTrigger: () => null,
  SelectContent: ({ children }: { children?: unknown }) => (
    <>{children as never}</>
  ),
  SelectItem: ({ value, children }: { value: string; children?: unknown }) => (
    <option value={value}>{children as never}</option>
  ),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    disabled,
    onClick,
    "aria-label": aria_label,
  }: {
    children?: unknown;
    disabled?: boolean;
    onClick?: () => void;
    "aria-label"?: string;
  }) => (
    <button aria-label={aria_label} disabled={disabled} onClick={onClick}>
      {children as never}
    </button>
  ),
}));

const RESEND_COOLDOWN_SECONDS = 60;

const mocked_start = vi.mocked(start_primary_address_change);
const mocked_resend = vi.mocked(resend_primary_address_code);
const mocked_confirm = vi.mocked(confirm_primary_address_change);
const mocked_republish = vi.mocked(republish_identity_with_new_address);
const mocked_eligibility = vi.mocked(load_primary_address_eligibility);
const mocked_ensure_aliases = vi.mocked(ensure_aliases_and_domains_loaded);
const mocked_cached_aliases = vi.mocked(get_cached_aliases);
const mocked_availability = vi.mocked(check_primary_address_availability);
const mocked_salt = vi.mocked(get_user_salt);
const mocked_derive = vi.mocked(derive_password_hash);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const eligibility_fixture: PrimaryAddressEligibility = {
  eligible: true,
  reason: null,
  current_address: "old@astermail.org",
  next_change_available_at: "2027-01-01T00:00:00Z",
  renames_allowed: 1,
  retained_addresses: [],
};

let container: HTMLDivElement;
let root: Root;
let on_close: Mock<() => void>;
let on_changed: Mock<(new_address: string) => void>;

async function render_modal() {
  await act(async () => {
    root.render(
      <ChangePrimaryAddressModal
        is_open
        eligibility={eligibility_fixture}
        on_changed={on_changed}
        on_close={on_close}
      />,
    );
  });
}

async function wait_until(predicate: () => boolean, timeout = 5000) {
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

function continue_button(): HTMLButtonElement {
  return find_button("common.continue");
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
  });
}

function local_part_input(): HTMLInputElement {
  return container.querySelector(
    "#primary-address-local-part",
  ) as HTMLInputElement;
}

async function go_to_pick() {
  await render_modal();
  await click(continue_button());
}

async function go_to_review(local_part = "newname") {
  await go_to_pick();
  set_input(local_part_input(), local_part);
  await wait_until(() => !continue_button().disabled);
  await click(continue_button());
}

async function go_to_password(local_part = "newname") {
  await go_to_review(local_part);

  const confirm_input = container.querySelector(
    "#primary-address-confirm",
  ) as HTMLInputElement;

  set_input(confirm_input, `${local_part}@astermail.org`);
  await click(continue_button());
}

async function go_to_code() {
  await go_to_password();

  const password_input = container.querySelector(
    "#primary-address-password",
  ) as HTMLInputElement;

  set_input(password_input, "correct horse battery staple");
  await click(continue_button());
  await wait_until(
    () =>
      container.querySelector(
        '[aria-label="settings.address_change_code_label"] input',
      ) !== null,
  );
}

async function clear_resend_cooldown() {
  for (let tick = 0; tick < RESEND_COOLDOWN_SECONDS + 1; tick += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
}

function code_input(): HTMLInputElement {
  return container.querySelector(
    '[aria-label="settings.address_change_code_label"] input',
  ) as HTMLInputElement;
}

describe("ChangePrimaryAddressModal", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    on_close = vi.fn<() => void>();
    on_changed = vi.fn<(new_address: string) => void>();
    mocked_start.mockReset();
    mocked_resend.mockReset();
    mocked_confirm.mockReset();
    mocked_republish.mockReset();
    mocked_ensure_aliases.mockReset();
    mocked_cached_aliases.mockReset();
    mocked_availability.mockReset();
    mocked_salt.mockReset();
    mocked_derive.mockClear();
    mocked_ensure_aliases.mockResolvedValue(undefined);
    mocked_cached_aliases.mockReturnValue([]);
    mocked_availability.mockResolvedValue({
      data: { available: true, consumes_alias: false },
    } as never);
    mocked_salt.mockResolvedValue({ data: { salt: btoa("salt") } } as never);
    mocked_start.mockResolvedValue({
      data: { expires_at: "2026-09-22T12:00:00Z" },
    } as never);
    mocked_confirm.mockResolvedValue({
      data: {
        new_address: "newname@astermail.org",
        retained_address: "old@astermail.org",
        next_change_available_at: "2028-02-03T00:00:00Z",
      },
    } as never);
    mocked_republish.mockResolvedValue(true);
    mocked_resend.mockResolvedValue({ data: { sent: true } } as never);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("explains the retained address, the yearly limit and the permanence on the intro step", async () => {
    await render_modal();

    const text = container.textContent ?? "";

    expect(text).toContain("settings.address_change_title");
    expect(text).toContain("settings.address_change_intro_lead");
    expect(text).toContain(
      'settings.address_change_keep_old_title:{"email":"old@astermail.org"}',
    );
    expect(text).toContain("settings.address_change_keep_old_body");
    expect(text).toContain("settings.address_change_once_title");
    expect(text).toContain("settings.address_change_once_body");
    expect(text).toContain("settings.address_change_permanent_title");
    expect(text).toContain(
      'settings.address_change_permanent_body:{"email":"old@astermail.org"}',
    );
  });

  it("offers the eligible aliases as shortcuts on the pick step", async () => {
    mocked_cached_aliases.mockReturnValue([
      {
        full_address: "spare@astermail.org",
        is_enabled: true,
        decryption_failed: false,
      },
      {
        full_address: "disabled@astermail.org",
        is_enabled: false,
        decryption_failed: false,
      },
      {
        full_address: "elsewhere@example.com",
        is_enabled: true,
        decryption_failed: false,
      },
      {
        full_address: "retired@astermail.org",
        is_enabled: true,
        decryption_failed: false,
        is_retained_primary: true,
      },
    ] as never);

    await go_to_pick();
    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.address_change_use_alias",
      ),
    );

    const text = container.textContent ?? "";

    expect(text).toContain("spare@astermail.org");
    expect(text).not.toContain("disabled@astermail.org");
    expect(text).not.toContain("elsewhere@example.com");
    expect(text).not.toContain("retired@astermail.org");
  });

  it("rejects a local part longer than sixty-four typed characters", async () => {
    await go_to_pick();

    const at_cap = "a.".repeat(24) + "a".repeat(16);
    const over_cap = "a.".repeat(25) + "a".repeat(15);

    set_input(local_part_input(), over_cap);
    expect(continue_button().disabled).toBe(true);
    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.address_change_name_rule",
      ),
    );
    expect(mocked_availability).not.toHaveBeenCalled();

    set_input(local_part_input(), at_cap);
    await wait_until(() => mocked_availability.mock.calls.length > 0);
    expect(mocked_availability).toHaveBeenCalledWith(at_cap, "astermail.org");
  });

  it("blocks continuing from the pick step until the address is available", async () => {
    mocked_availability.mockResolvedValue({
      data: { available: false, consumes_alias: false },
    } as never);
    await go_to_pick();

    expect(continue_button().disabled).toBe(true);

    set_input(local_part_input(), "taken");
    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.address_change_unavailable",
      ),
    );

    expect(container.textContent).toContain(
      'settings.address_change_unavailable:{"email":"taken@astermail.org"}',
    );
    expect(continue_button().disabled).toBe(true);
  });

  it("allows continuing from the pick step once the address is reported available", async () => {
    await go_to_pick();
    set_input(local_part_input(), "newname");
    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.address_change_available",
      ),
    );

    expect(container.textContent).toContain(
      'settings.address_change_available:{"email":"newname@astermail.org"}',
    );
    expect(continue_button().disabled).toBe(false);
    expect(mocked_availability).toHaveBeenCalledWith(
      "newname",
      "astermail.org",
    );
  });

  it("rejects addresses the server rule would reject, without asking the server", async () => {
    await go_to_pick();

    const too_long = "a".repeat(41);

    for (const bad of [
      "ab",
      ".lead",
      "trail.",
      "two..dots",
      "up_score",
      too_long,
    ]) {
      set_input(local_part_input(), bad);
      expect(continue_button().disabled).toBe(true);
    }

    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.address_change_name_rule",
      ),
    );
    expect(mocked_availability).not.toHaveBeenCalled();
  });

  it("refuses the address the account already has", async () => {
    await go_to_pick();
    set_input(local_part_input(), "o.l.d");
    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.address_change_same_as_current",
      ),
    );

    expect(continue_button().disabled).toBe(true);
  });

  it("re-gates continuing when the address changes after an available verdict", async () => {
    await go_to_pick();
    set_input(local_part_input(), "newname");
    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.address_change_available",
      ),
    );
    expect(continue_button().disabled).toBe(false);

    set_input(local_part_input(), "newnamex");
    expect(continue_button().disabled).toBe(true);
    expect(container.textContent).not.toContain(
      "settings.address_change_available",
    );
  });

  it("keeps the review step gated until the exact new address is typed", async () => {
    await go_to_review();

    const text = container.textContent ?? "";

    expect(text).toContain("settings.address_change_from");
    expect(text).toContain("settings.address_change_to");
    expect(text).toContain(
      'settings.address_change_type_to_confirm:{"email":"newname@astermail.org"}',
    );
    expect(continue_button().disabled).toBe(true);

    const confirm_input = container.querySelector(
      "#primary-address-confirm",
    ) as HTMLInputElement;

    set_input(confirm_input, "newname@aster.cx");
    expect(continue_button().disabled).toBe(true);

    set_input(confirm_input, "newname@astermail.org");
    expect(continue_button().disabled).toBe(false);
  });

  it("reviews the address the way it is displayed everywhere else", async () => {
    await go_to_review("new.name");

    const text = container.textContent ?? "";

    expect(text).toContain(
      'settings.address_change_type_to_confirm:{"email":"new.name@astermail.org"}',
    );

    const confirm_input = container.querySelector(
      "#primary-address-confirm",
    ) as HTMLInputElement;

    set_input(confirm_input, "new.name@astermail.org");
    expect(continue_button().disabled).toBe(false);
  });

  it("accepts the typed confirmation regardless of case", async () => {
    await go_to_review();

    const confirm_input = container.querySelector(
      "#primary-address-confirm",
    ) as HTMLInputElement;

    set_input(confirm_input, "  NewName@AsterMail.ORG  ");
    expect(continue_button().disabled).toBe(false);
  });

  it("starts the change with the derived password hash and moves to the code step", async () => {
    await go_to_password();

    expect(container.textContent).toContain(
      "settings.address_change_password_title",
    );
    expect(continue_button().disabled).toBe(true);

    const password_input = container.querySelector(
      "#primary-address-password",
    ) as HTMLInputElement;

    set_input(password_input, "correct horse battery staple");
    await click(continue_button());
    await wait_until(() => mocked_start.mock.calls.length === 1);

    expect(mocked_salt).toHaveBeenCalledWith({
      user_hash: "hash:old@astermail.org",
    });
    expect(mocked_derive).toHaveBeenCalledTimes(1);
    expect(mocked_start).toHaveBeenCalledWith({
      new_local_part: "newname",
      new_domain: "astermail.org",
      password_hash: "derived-password-hash",
    });

    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.address_change_code_title",
      ),
    );

    expect(container.textContent).toContain(
      'settings.address_change_code_body:{"email":"old@astermail.org"}',
    );
    expect(mocked_confirm).not.toHaveBeenCalled();
  });

  it("surfaces a failed start and stays on the password step", async () => {
    mocked_start.mockResolvedValue({ error: "rejected" } as never);
    await go_to_password();

    const password_input = container.querySelector(
      "#primary-address-password",
    ) as HTMLInputElement;

    set_input(password_input, "correct horse battery staple");
    await click(continue_button());
    await wait_until(() =>
      (container.textContent ?? "").includes("settings.address_change_failed"),
    );

    expect(container.textContent).not.toContain("rejected");
    expect(container.textContent).toContain(
      "settings.address_change_password_title",
    );
    expect(on_close).not.toHaveBeenCalled();
  });

  it.each([
    ["INVALID_CREDENTIALS", "settings.address_change_password_wrong"],
    ["PLAN_LIMIT_EXCEEDED", "settings.address_change_locked_plan"],
    ["FORBIDDEN", "settings.address_change_not_eligible"],
    ["RATE_LIMIT_EXCEEDED", "settings.address_change_too_many_requests"],
    ["ADDRESS_IN_USE", "settings.address_change_taken_now"],
    ["USERNAME_IN_USE", "settings.address_change_taken_now"],
    ["EMAIL_SEND_FAILED", "settings.address_change_send_failed"],
    ["NOT_FOUND", "settings.address_change_code_expired"],
    ["VALIDATION_ERROR", "settings.address_change_invalid_address"],
  ])("maps a %s start failure to localized copy", async (code, key) => {
    mocked_start.mockResolvedValue({
      error: "raw server prose",
      server_code: code,
    } as never);
    await go_to_password();

    const password_input = container.querySelector(
      "#primary-address-password",
    ) as HTMLInputElement;

    set_input(password_input, "correct horse battery staple");
    await click(continue_button());
    await wait_until(() => (container.textContent ?? "").includes(key));

    expect(container.textContent).not.toContain("raw server prose");
    expect(container.textContent).toContain(
      "settings.address_change_password_title",
    );
  });

  it("reports an invalid code without closing the modal", async () => {
    mocked_confirm.mockResolvedValue({
      error: "bad code",
      server_code: "INVALID_CREDENTIALS",
    } as never);
    await go_to_code();
    set_input(code_input(), "000000");
    await click(find_button("settings.address_change_title"));
    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.address_change_code_invalid",
      ),
    );

    expect(container.textContent).toContain(
      "settings.address_change_code_title",
    );
    expect(on_close).not.toHaveBeenCalled();
    expect(on_changed).not.toHaveBeenCalled();
    expect(mocked_republish).not.toHaveBeenCalled();
  });

  it("tells the user to start over once the code attempts run out", async () => {
    mocked_confirm.mockResolvedValue({
      error: "too many",
      code: "RATE_LIMIT_EXCEEDED",
    } as never);
    await go_to_code();
    set_input(code_input(), "000000");
    await click(find_button("settings.address_change_title"));
    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.address_change_code_too_many",
      ),
    );

    expect(on_changed).not.toHaveBeenCalled();
  });

  it("lets the user retry after the attempts run out", async () => {
    mocked_confirm.mockResolvedValue({
      error: "too many",
      code: "RATE_LIMIT_EXCEEDED",
    } as never);
    await go_to_code();
    set_input(code_input(), "000000");
    await click(find_button("settings.address_change_title"));
    await wait_until(() =>
      (container.textContent ?? "").includes(
        "settings.address_change_code_too_many",
      ),
    );

    expect(find_button("settings.address_change_title").disabled).toBe(true);

    set_input(code_input(), "111111");
    await wait_until(
      () => find_button("settings.address_change_title").disabled === false,
    );

    expect(find_button("settings.address_change_title").disabled).toBe(false);
  });

  it("keeps the confirm action disabled until the code is complete", async () => {
    await go_to_code();

    expect(find_button("settings.address_change_title").disabled).toBe(true);

    set_input(code_input(), "12345");
    expect(find_button("settings.address_change_title").disabled).toBe(true);

    set_input(code_input(), "123456");
    expect(find_button("settings.address_change_title").disabled).toBe(false);
  });

  it("confirms the change, republishes the identity and reports the new address", async () => {
    await go_to_code();
    set_input(code_input(), "123456");
    await click(find_button("settings.address_change_title"));
    await wait_until(() => on_changed.mock.calls.length === 1);

    expect(mocked_confirm).toHaveBeenCalledWith({
      code: "123456",
      new_address: "newname@astermail.org",
      retained_address: "old@astermail.org",
    });
    expect(mocked_republish).toHaveBeenCalledWith(
      "newname@astermail.org",
      "Old Name",
    );
    expect(mocked_republish.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocked_confirm.mock.invocationCallOrder[0],
    );
    expect(on_changed).toHaveBeenCalledWith("newname@astermail.org");
    expect(container.textContent).toContain(
      'settings.address_change_done_title:{"email":"newname@astermail.org"}',
    );
    expect(container.textContent).toContain(
      'settings.address_change_done_body:{"email":"old@astermail.org"}',
    );
  });

  it("treats a lost confirm response as success once the server agrees", async () => {
    mocked_confirm.mockResolvedValue({
      error: "timed out",
      code: "TIMEOUT_ERROR",
    } as never);
    mocked_eligibility.mockResolvedValue({
      data: {
        ...eligibility_fixture,
        eligible: false,
        current_address: "new.name@astermail.org",
        next_change_available_at: "2028-02-02T00:00:00Z",
      },
    } as never);

    await go_to_code();
    set_input(code_input(), "123456");
    await click(find_button("settings.address_change_title"));
    await wait_until(() => on_changed.mock.calls.length === 1);

    expect(mocked_republish).toHaveBeenCalledWith(
      "new.name@astermail.org",
      "Old Name",
    );
    expect(on_changed).toHaveBeenCalledWith("new.name@astermail.org");
  });

  it("reconciles a commit that answered with a server error", async () => {
    mocked_confirm.mockResolvedValue({
      error: "server error",
      code: "SERVER_ERROR",
    } as never);
    mocked_eligibility.mockResolvedValue({
      data: {
        ...eligibility_fixture,
        eligible: false,
        current_address: "new.name@astermail.org",
        next_change_available_at: "2028-02-02T00:00:00Z",
      },
    } as never);

    await go_to_code();
    set_input(code_input(), "123456");
    await click(find_button("settings.address_change_title"));
    await wait_until(() => on_changed.mock.calls.length === 1);

    expect(on_changed).toHaveBeenCalledWith("new.name@astermail.org");
  });

  it("keeps reporting a failure when the server never applied the change", async () => {
    mocked_confirm.mockResolvedValue({
      error: "offline",
      code: "NETWORK_ERROR",
    } as never);
    mocked_eligibility.mockResolvedValue({
      data: eligibility_fixture,
    } as never);

    await go_to_code();
    set_input(code_input(), "123456");
    await click(find_button("settings.address_change_title"));
    await wait_until(() => mocked_eligibility.mock.calls.length === 1);

    expect(on_changed).not.toHaveBeenCalled();
    expect(mocked_republish).not.toHaveBeenCalled();
  });

  it("keeps naming the retained address after eligibility refreshes", async () => {
    await go_to_code();
    set_input(code_input(), "123456");
    await click(find_button("settings.address_change_title"));
    await wait_until(() => on_changed.mock.calls.length === 1);

    await act(async () => {
      root.render(
        <ChangePrimaryAddressModal
          is_open
          eligibility={{
            ...eligibility_fixture,
            eligible: false,
            current_address: "newname@astermail.org",
          }}
          on_changed={on_changed}
          on_close={on_close}
        />,
      );
    });

    expect(container.textContent).toContain(
      'settings.address_change_done_body:{"email":"old@astermail.org"}',
    );
  });
  it("dates the next change from the server response, not from the old value", async () => {
    await go_to_code();
    set_input(code_input(), "123456");
    await click(find_button("settings.address_change_title"));
    await wait_until(() => on_changed.mock.calls.length === 1);

    expect(container.textContent).toContain(
      "settings.address_change_locked_cooldown",
    );
    expect(container.textContent).toContain("2028");
    expect(container.textContent).not.toContain(
      "settings.address_change_once_body",
    );
  });

  it("ignores a cooldown date that has already passed", async () => {
    await act(async () => {
      root.render(
        <ChangePrimaryAddressModal
          is_open
          eligibility={{
            ...eligibility_fixture,
            next_change_available_at: "2020-01-01T00:00:00Z",
          }}
          on_changed={on_changed}
          on_close={on_close}
        />,
      );
    });

    expect(container.textContent).toContain(
      "settings.address_change_once_unknown",
    );
    expect(container.textContent).not.toContain("2020");
  });

  it("warns about the key when the republish does not succeed", async () => {
    mocked_republish.mockResolvedValue(false);

    await go_to_code();
    set_input(code_input(), "123456");
    await click(find_button("settings.address_change_title"));
    await wait_until(() => on_changed.mock.calls.length === 1);

    expect(container.textContent).toContain(
      "settings.address_change_done_partial",
    );
  });

  it("sends a new code once the cooldown clears", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      await go_to_code();
      await clear_resend_cooldown();
      await click(find_button("common.resend"));
      await wait_until(() => mocked_resend.mock.calls.length === 1);
      expect(container.textContent).toContain(
        "settings.address_change_code_resent",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a failed resend instead of claiming a code was sent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      await go_to_code();
      await clear_resend_cooldown();

      mocked_resend.mockResolvedValue({
        error: "rejected",
        server_code: "RATE_LIMIT_EXCEEDED",
      } as never);
      await click(find_button("common.resend"));
      await wait_until(() => mocked_resend.mock.calls.length === 1);

      expect(container.textContent).not.toContain(
        "settings.address_change_code_resent",
      );
      expect(container.textContent).toContain(
        "settings.address_change_resend_too_soon",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
