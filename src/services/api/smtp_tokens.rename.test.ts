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
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  encrypt_address_field: vi.fn(),
  decrypt_address_field: vi.fn(),
}));

vi.mock("./client", () => ({
  api_client: { get: h.get, patch: h.patch, post: vi.fn(), delete: vi.fn() },
}));

vi.mock("./domains", () => ({
  compute_address_hash: vi.fn(),
  encrypt_address_field: h.encrypt_address_field,
  decrypt_address_field: h.decrypt_address_field,
}));

import {
  list_smtp_tokens,
  normalize_smtp_token_name,
  parse_smtp_connection_settings,
  rename_smtp_token,
} from "./smtp_tokens";

const settings = {
  host: "smtp.astermail.org",
  port: 587,
  security: "STARTTLS",
  username: "asmtp_abcdefghijkl",
};

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "token-1",
  selector: "abcdefghijkl",
  bound_address: "me@example.com",
  label_encrypted: "sealed",
  label_nonce: "nonce",
  is_active: true,
  last_used_at: null,
  expires_at: null,
  created_at: "2026-11-01T10:00:00Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.encrypt_address_field.mockResolvedValue({
    encrypted: "sealed-new",
    nonce: "nonce-new",
  });
  h.decrypt_address_field.mockResolvedValue("printer");
});

describe("normalize_smtp_token_name", () => {
  it("trims the name and keeps inner spaces", () => {
    expect(normalize_smtp_token_name("  office printer  ")).toBe(
      "office printer",
    );
  });

  it("refuses an empty or oversized name", () => {
    expect(normalize_smtp_token_name("   ")).toBeNull();
    expect(normalize_smtp_token_name("a".repeat(64))).toBe("a".repeat(64));
    expect(normalize_smtp_token_name("a".repeat(65))).toBeNull();
  });

  it("counts characters instead of code units", () => {
    const name = String.fromCodePoint(0x1f600).repeat(64);

    expect(normalize_smtp_token_name(name)).toBe(name);
  });

  it("refuses control characters", () => {
    expect(
      normalize_smtp_token_name("a" + String.fromCharCode(10) + "b"),
    ).toBeNull();
    expect(
      normalize_smtp_token_name("a" + String.fromCharCode(0) + "b"),
    ).toBeNull();
    expect(
      normalize_smtp_token_name("a" + String.fromCharCode(0x2028) + "b"),
    ).toBeNull();
  });
});

describe("parse_smtp_connection_settings", () => {
  it("returns nothing when the server sends no settings", () => {
    expect(parse_smtp_connection_settings(undefined)).toBeNull();
    expect(parse_smtp_connection_settings(null)).toBeNull();
    expect(parse_smtp_connection_settings("smtp")).toBeNull();
  });

  it("keeps only the four connection values", () => {
    expect(
      parse_smtp_connection_settings({ ...settings, password: "secret" }),
    ).toEqual(settings);
  });

  it("refuses incomplete or malformed settings", () => {
    expect(
      parse_smtp_connection_settings({ ...settings, host: "" }),
    ).toBeNull();
    expect(
      parse_smtp_connection_settings({ ...settings, port: "587" }),
    ).toBeNull();
    expect(parse_smtp_connection_settings({ ...settings, port: 0 })).toBeNull();
    expect(
      parse_smtp_connection_settings({ ...settings, port: 70000 }),
    ).toBeNull();
    expect(
      parse_smtp_connection_settings({ ...settings, username: undefined }),
    ).toBeNull();
  });
});

describe("list_smtp_tokens", () => {
  it("carries settings and the last used time when the server sends them", async () => {
    h.get.mockResolvedValue({
      data: {
        tokens: [
          row({
            smtp_settings: settings,
            last_used_at: "2026-11-19T08:30:00Z",
          }),
        ],
      },
    });

    const result = await list_smtp_tokens();

    expect(result.data?.tokens[0]).toMatchObject({
      name: "printer",
      last_used_at: "2026-11-19T08:30:00Z",
      smtp_settings: settings,
    });
  });

  it("leaves settings empty when the server does not send them", async () => {
    h.get.mockResolvedValue({ data: { tokens: [row()] } });

    const result = await list_smtp_tokens();

    expect(result.data?.tokens[0].smtp_settings).toBeNull();
    expect(result.data?.tokens[0].last_used_at).toBeNull();
  });
});

describe("rename_smtp_token", () => {
  it("sends only the sealed name and returns the trimmed name", async () => {
    h.patch.mockResolvedValue({ data: row(), status: 200 });

    const result = await rename_smtp_token("token-1", "  scanner ");

    expect(result).toEqual({ name: "scanner" });
    expect(h.encrypt_address_field).toHaveBeenCalledWith("scanner");
    expect(h.patch).toHaveBeenCalledWith("/developer/v1/smtp-tokens/token-1", {
      label_encrypted: "sealed-new",
      label_nonce: "nonce-new",
    });
  });

  it("does not call the server for an invalid name", async () => {
    const result = await rename_smtp_token("token-1", "   ");

    expect(result).toEqual({ failure: "invalid_name" });
    expect(h.patch).not.toHaveBeenCalled();
  });

  it("escapes the token id in the path", async () => {
    h.patch.mockResolvedValue({ data: row(), status: 200 });

    await rename_smtp_token("a/b", "scanner");

    expect(h.patch.mock.calls[0][0]).toBe("/developer/v1/smtp-tokens/a%2Fb");
  });

  it("reports unavailable when the route is missing", async () => {
    h.patch.mockResolvedValueOnce({ error: "x", status: 404 });
    expect(await rename_smtp_token("token-1", "scanner")).toEqual({
      failure: "unavailable",
    });

    h.patch.mockResolvedValueOnce({ error: "x", status: 405 });
    expect(await rename_smtp_token("token-1", "scanner")).toEqual({
      failure: "unavailable",
    });

    h.patch.mockResolvedValueOnce({ error: "x", code: "NOT_FOUND" });
    expect(await rename_smtp_token("token-1", "scanner")).toEqual({
      failure: "unavailable",
    });
  });

  it("reports a failure for other errors and thrown requests", async () => {
    h.patch.mockResolvedValueOnce({ error: "x", status: 500 });
    expect(await rename_smtp_token("token-1", "scanner")).toEqual({
      failure: "failed",
    });

    h.patch.mockRejectedValueOnce(new Error("offline"));
    expect(await rename_smtp_token("token-1", "scanner")).toEqual({
      failure: "failed",
    });

    h.encrypt_address_field.mockRejectedValueOnce(new Error("locked"));
    expect(await rename_smtp_token("token-1", "scanner")).toEqual({
      failure: "failed",
    });
  });
});
