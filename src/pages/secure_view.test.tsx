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
import type { SecureViewMetadata } from "@/services/api/secure_view";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const TYPED_SECRET = "orchard-lantern-47-quiet";
const PROOF = "cHJvb2YtdmFsdWUtZm9yLXRlc3Rz";
const DERIVED_KEY = "RHMEBJm89W5fy5dc04qOLv8f2OjzvX6xYoN36VxakqE=";
const SERVER_FIELD = JSON.stringify("password");
const PASSWORD_KDF = {
  algorithm: "argon2id",
  version: 19,
  memory_kib: 65536,
  iterations: 3,
  parallelism: 4,
  key_length: 32,
  salt: "AQIDBAUGBwgJCgsMDQ4PEA==",
};

const h = vi.hoisted(() => ({
  derive_auth_proof: vi.fn(),
  derive_secure_view_key: vi.fn(),
  decrypt_secure_message: vi.fn(),
  i18n: { t: (key: string) => key },
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ token: "tok" }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => h.i18n,
}));

vi.mock("@/services/crypto/secure_message_crypto", () => ({
  derive_auth_proof: h.derive_auth_proof,
  decrypt_secure_message: h.decrypt_secure_message,
}));

vi.mock("@/services/crypto/secure_view_key", async (original) => ({
  ...(await original<typeof import("@/services/crypto/secure_view_key")>()),
  derive_secure_view_key: h.derive_secure_view_key,
}));

vi.mock("@/lib/html_sanitizer", () => ({
  sanitize_html: (html: string) => ({ html }),
}));

vi.mock("@/lib/secure_view_inline_images", () => ({
  inline_secure_view_images: (html: string) => html,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: SecureViewPage } = await import("./secure_view");

const fetch_mock = vi.fn();

let container: HTMLDivElement;
let root: Root;

function metadata(overrides: Partial<SecureViewMetadata>): SecureViewMetadata {
  return {
    sender_email: "ada@astermail.org",
    recipient_email: "grace@example.com",
    expires_at: "2030-01-01T00:00:00Z",
    requires_password: true,
    is_expired: false,
    is_deleted: false,
    time_remaining_seconds: 3600,
    is_zero_knowledge: true,
    kdf_salt: "c2FsdA",
    ...overrides,
  };
}

const LEGACY_CONTENT = {
  is_zero_knowledge: false,
  subject: "Quarterly numbers",
  body: "<p>Revenue is up.</p>",
  sender_email: "ada@astermail.org",
};

function legacy_view(
  overrides: Partial<SecureViewMetadata>,
): SecureViewMetadata {
  return metadata({
    is_zero_knowledge: false,
    kdf_salt: undefined,
    password_kdf: PASSWORD_KDF,
    ...overrides,
  });
}

function metadata_requests(): number {
  return fetch_mock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "GET",
  ).length;
}

function respond(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload };
}

function route_requests(
  view: SecureViewMetadata,
  content: Record<string, unknown>,
): void {
  fetch_mock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "GET") return respond(view);
    if (String(url).endsWith("/verify")) {
      return respond({ success: true, content });
    }

    return respond({ success: true });
  });
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );

  if (!found) throw new Error(`button missing: ${label}`);

  return found;
}

async function type_into(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(label: string): Promise<void> {
  await act(async () => {
    button(label).click();
  });
}

async function render_page(): Promise<void> {
  await act(async () => {
    root.render(<SecureViewPage />);
  });
}

async function unlock(): Promise<void> {
  const input = container.querySelector("input");

  if (!input) throw new Error("unlock input missing");

  await type_into(input, TYPED_SECRET);
  await click("secure_view.view_button");
}

async function reply_and_delete(): Promise<void> {
  const textarea = container.querySelector("textarea");

  if (!textarea) throw new Error("reply box missing");

  await type_into(textarea, "Thanks for this");
  await click("secure_view.reply_button");
  await click("secure_view.delete_button");
  await click("secure_view.delete_confirm_yes");
}

function sent_body(suffix: string, method: string): Record<string, unknown> {
  const call = fetch_mock.mock.calls.find(
    ([url, init]) =>
      String(url).endsWith(suffix) &&
      (init as RequestInit | undefined)?.method === method,
  );

  if (!call) throw new Error(`request missing: ${method} ${suffix}`);

  return JSON.parse(String((call[1] as RequestInit).body)) as Record<
    string,
    unknown
  >;
}

function serialized_requests(): string {
  return fetch_mock.mock.calls
    .map(([url, init]) =>
      JSON.stringify({
        url: String(url),
        headers: (init as RequestInit | undefined)?.headers ?? null,
        body: (init as RequestInit | undefined)?.body ?? null,
      }),
    )
    .join("\n");
}

describe("secure view page actions", () => {
  beforeEach(() => {
    fetch_mock.mockReset();
    h.derive_auth_proof.mockReset();
    h.decrypt_secure_message.mockReset();
    h.derive_auth_proof.mockResolvedValue(PROOF);
    h.derive_secure_view_key.mockReset();
    h.derive_secure_view_key.mockResolvedValue(DERIVED_KEY);
    h.decrypt_secure_message.mockResolvedValue({
      subject: "Quarterly numbers",
      body: "<p>Revenue is up.</p>",
      attachments: [],
    });
    vi.stubGlobal("fetch", fetch_mock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("opens, replies to, and deletes an end-to-end encrypted message without sending what was typed", async () => {
    route_requests(metadata({}), {
      is_zero_knowledge: true,
      kdf_salt: "c2FsdA",
      encrypted_subject: { ciphertext: "a", nonce: "b" },
      encrypted_body: { ciphertext: "c", nonce: "d" },
    });

    await render_page();
    await unlock();

    expect(h.decrypt_secure_message).toHaveBeenCalledWith(
      TYPED_SECRET,
      "c2FsdA",
      expect.anything(),
    );
    expect(container.textContent).toContain("Quarterly numbers");

    await reply_and_delete();

    expect(sent_body("/verify", "POST")).toEqual({ auth_proof: PROOF });
    expect(sent_body("/reply", "POST")).toEqual({
      auth_proof: PROOF,
      body: "Thanks for this",
    });
    expect(sent_body("/api/view/tok", "DELETE")).toEqual({
      auth_proof: PROOF,
    });
    expect(fetch_mock).toHaveBeenCalledTimes(4);
    expect(serialized_requests()).not.toContain(TYPED_SECRET);
    expect(serialized_requests()).not.toContain(SERVER_FIELD);
    expect(h.derive_secure_view_key).not.toHaveBeenCalled();
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("sends nothing when an end-to-end encrypted view arrives without a salt", async () => {
    route_requests(metadata({ kdf_salt: undefined }), {});

    await render_page();
    await unlock();

    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(serialized_requests()).not.toContain(TYPED_SECRET);
    expect(h.derive_auth_proof).not.toHaveBeenCalled();
    expect(container.textContent).toContain("secure_view.decrypt_failed");
  });

  it("opens, replies to, and deletes a server-encrypted message with a derived key", async () => {
    route_requests(legacy_view({}), LEGACY_CONTENT);

    await render_page();
    await unlock();

    expect(container.textContent).toContain("Quarterly numbers");
    expect(h.derive_auth_proof).not.toHaveBeenCalled();
    expect(h.derive_secure_view_key).toHaveBeenCalledTimes(1);
    expect(h.derive_secure_view_key).toHaveBeenCalledWith(
      TYPED_SECRET,
      PASSWORD_KDF,
    );

    await reply_and_delete();

    expect(sent_body("/verify", "POST")).toEqual({ auth_proof: DERIVED_KEY });
    expect(sent_body("/reply", "POST")).toEqual({
      auth_proof: DERIVED_KEY,
      body: "Thanks for this",
    });
    expect(sent_body("/api/view/tok", "DELETE")).toEqual({
      auth_proof: DERIVED_KEY,
    });
    expect(fetch_mock).toHaveBeenCalledTimes(4);
    expect(h.derive_secure_view_key).toHaveBeenCalledTimes(1);
    expect(serialized_requests()).not.toContain(TYPED_SECRET);
    expect(serialized_requests()).not.toContain(SERVER_FIELD);
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("sends nothing typed when a server-encrypted view arrives without key settings", async () => {
    route_requests(legacy_view({ password_kdf: undefined }), LEGACY_CONTENT);

    await render_page();
    await unlock();

    expect(metadata_requests()).toBe(2);
    expect(fetch_mock).toHaveBeenCalledTimes(2);
    expect(h.derive_secure_view_key).not.toHaveBeenCalled();
    expect(serialized_requests()).not.toContain(TYPED_SECRET);
    expect(serialized_requests()).not.toContain(SERVER_FIELD);
    expect(container.textContent).toContain(
      "common.something_went_wrong_try_again",
    );
    expect(container.textContent).not.toContain("Quarterly numbers");
  });

  it("opens a server-encrypted view once the key settings arrive on a second look", async () => {
    let metadata_calls = 0;

    fetch_mock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        metadata_calls += 1;

        return respond(
          legacy_view(metadata_calls === 1 ? { password_kdf: undefined } : {}),
        );
      }
      if (String(url).endsWith("/verify")) {
        return respond({ success: true, content: LEGACY_CONTENT });
      }

      return respond({ success: true });
    });

    await render_page();
    await unlock();

    expect(container.textContent).toContain("Quarterly numbers");
    expect(sent_body("/verify", "POST")).toEqual({ auth_proof: DERIVED_KEY });
    expect(serialized_requests()).not.toContain(TYPED_SECRET);
    expect(serialized_requests()).not.toContain(SERVER_FIELD);
  });

  it("sends nothing typed when the key settings are outside the supported range", async () => {
    route_requests(
      legacy_view({ password_kdf: { ...PASSWORD_KDF, memory_kib: 4194304 } }),
      LEGACY_CONTENT,
    );

    await render_page();
    await unlock();

    expect(h.derive_secure_view_key).not.toHaveBeenCalled();
    expect(serialized_requests()).not.toContain(TYPED_SECRET);
    expect(serialized_requests()).not.toContain(SERVER_FIELD);
    expect(container.textContent).not.toContain("Quarterly numbers");
  });

  it("keeps a server-encrypted view closed after a wrong entry", async () => {
    fetch_mock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "GET") return respond(legacy_view({}));
      if (String(url).endsWith("/verify")) {
        return respond({ success: false, error: "invalid_password" });
      }

      return respond({ success: true });
    });

    await render_page();
    await unlock();

    expect(container.textContent).toContain("secure_view.wrong_password");
    expect(container.textContent).not.toContain("Quarterly numbers");
    expect(container.querySelector("textarea")).toBeNull();
    expect(sent_body("/verify", "POST")).toEqual({ auth_proof: DERIVED_KEY });
    expect(serialized_requests()).not.toContain(TYPED_SECRET);
    expect(serialized_requests()).not.toContain(SERVER_FIELD);
  });

  it("derives the key again for each attempt", async () => {
    let verify_calls = 0;

    fetch_mock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "GET") return respond(legacy_view({}));
      if (String(url).endsWith("/verify")) {
        verify_calls += 1;

        return respond(
          verify_calls === 1
            ? { success: false, error: "invalid_password" }
            : { success: true, content: LEGACY_CONTENT },
        );
      }

      return respond({ success: true });
    });

    await render_page();
    await unlock();
    await unlock();

    expect(h.derive_secure_view_key).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Quarterly numbers");
    expect(serialized_requests()).not.toContain(TYPED_SECRET);
    expect(serialized_requests()).not.toContain(SERVER_FIELD);
  });
});
