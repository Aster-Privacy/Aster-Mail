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
const SERVER_FIELD = JSON.stringify("password");

const h = vi.hoisted(() => ({
  derive_auth_proof: vi.fn(),
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

  it("still opens, replies to, and deletes a server-encrypted message", async () => {
    route_requests(
      metadata({ is_zero_knowledge: false, kdf_salt: undefined }),
      {
        is_zero_knowledge: false,
        subject: "Quarterly numbers",
        body: "<p>Revenue is up.</p>",
        sender_email: "ada@astermail.org",
      },
    );

    await render_page();
    await unlock();

    expect(container.textContent).toContain("Quarterly numbers");
    expect(h.derive_auth_proof).not.toHaveBeenCalled();

    await reply_and_delete();

    for (const sent of [
      sent_body("/verify", "POST"),
      sent_body("/reply", "POST"),
      sent_body("/api/view/tok", "DELETE"),
    ]) {
      expect(sent.password).toBe(TYPED_SECRET);
      expect(sent).not.toHaveProperty("auth_proof");
    }
    expect(container.querySelector("textarea")).toBeNull();
  });
});
