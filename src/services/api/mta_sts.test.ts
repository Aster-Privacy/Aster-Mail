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

const get = vi.fn();
const put = vi.fn();
const del = vi.fn();
const post = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
    delete: (...args: unknown[]) => del(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

const {
  check_mta_sts,
  disable_mta_sts,
  enable_mta_sts,
  get_mta_sts,
  normalize_mta_sts_state,
  parse_mta_sts_view,
} = await import("./mta_sts");

const live_view = {
  available: true,
  entitled: true,
  state: "live",
  enabled: true,
  domain_active: true,
  mode: "enforce",
  policy_url: "https://mta-sts.example.com/.well-known/mta-sts.txt",
  preview:
    "version: STSv1\r\nmode: enforce\r\nmx: mx.example.net\r\nmax_age: 604800\r\n",
  max_age: 604800,
  records: [
    {
      kind: "policy_host",
      record_type: "CNAME",
      host: "mta-sts",
      fqdn: "mta-sts.example.com",
      value: "mta-sts.example.net",
      status: "ok",
      optional: false,
    },
    {
      kind: "policy_id",
      record_type: "TXT",
      host: "_mta-sts",
      fqdn: "_mta-sts.example.com",
      value: "v=STSv1; id=20261125T000000",
      status: "stale",
      optional: false,
    },
    {
      kind: "tls_reporting",
      record_type: "TXT",
      host: "_smtp._tls",
      fqdn: "_smtp._tls.example.com",
      value: "v=TLSRPTv1; rua=mailto:tls@example.net",
      status: null,
      optional: true,
    },
  ],
  hostname_status: "active",
  retire_until: null,
  last_checked_at: "2026-11-25T10:00:00Z",
  managed_by_registrar: false,
};

beforeEach(() => {
  get.mockReset();
  put.mockReset();
  del.mockReset();
  post.mockReset();
});

describe("parse_mta_sts_view", () => {
  it("keeps a well-formed live view", () => {
    const view = parse_mta_sts_view(live_view);

    expect(view.state).toBe("live");
    expect(view.mode).toBe("enforce");
    expect(view.policy_url).toBe(
      "https://mta-sts.example.com/.well-known/mta-sts.txt",
    );
    expect(view.records.map((r) => r.kind)).toEqual([
      "policy_host",
      "policy_id",
      "tls_reporting",
    ]);
    expect(view.records[1].status).toBe("stale");
    expect(view.records[2].status).toBeNull();
    expect(view.records[2].optional).toBe(true);
    expect(view.max_age).toBe(604800);
  });

  it("falls back to safe defaults for an empty payload", () => {
    const view = parse_mta_sts_view({});

    expect(view).toMatchObject({
      available: false,
      entitled: false,
      state: "off",
      enabled: false,
      mode: null,
      policy_url: null,
      preview: null,
      records: [],
      managed_by_registrar: false,
    });
  });

  it("rejects unknown enums", () => {
    const view = parse_mta_sts_view({
      ...live_view,
      state: "admin",
      mode: "none",
      hostname_status: "weird",
    });

    expect(view.state).toBe("off");
    expect(view.mode).toBeNull();
    expect(view.hostname_status).toBeNull();
  });

  it("drops policy urls that are not the hosted policy file", () => {
    const bad_urls = [
      "javascript:alert(1)",
      "http://mta-sts.example.com/.well-known/mta-sts.txt",
      "https://evil.example/.well-known/mta-sts.txt",
      "https://mta-sts.example.com/other",
      "not a url",
      "",
      42,
    ];

    for (const policy_url of bad_urls) {
      expect(parse_mta_sts_view({ ...live_view, policy_url }).policy_url).toBe(
        null,
      );
    }
  });

  it("drops malformed records and caps the list", () => {
    const records = [
      { ...live_view.records[0], kind: "dkim" },
      { ...live_view.records[0], value: "" },
      { ...live_view.records[0], host: "x".repeat(600) },
      null,
      "record",
      ...Array.from({ length: 10 }, () => live_view.records[0]),
    ];
    const view = parse_mta_sts_view({ ...live_view, records });

    expect(view.records.length).toBe(3);
    expect(view.records.every((r) => r.kind === "policy_host")).toBe(true);
  });

  it("rejects an oversized preview and a negative max_age", () => {
    const view = parse_mta_sts_view({
      ...live_view,
      preview: "a".repeat(5000),
      max_age: -1,
    });

    expect(view.preview).toBeNull();
    expect(view.max_age).toBeNull();
  });
});

describe("normalize_mta_sts_state", () => {
  it("maps unknown and empty values to off", () => {
    expect(normalize_mta_sts_state(undefined)).toBe("off");
    expect(normalize_mta_sts_state(null)).toBe("off");
    expect(normalize_mta_sts_state("enabled")).toBe("off");
    expect(normalize_mta_sts_state("pending_certificate")).toBe(
      "pending_certificate",
    );
  });
});

describe("mta-sts requests", () => {
  it("encodes the domain id in every path", async () => {
    get.mockResolvedValue({ data: live_view });
    put.mockResolvedValue({ data: live_view });
    del.mockResolvedValue({ data: live_view });
    post.mockResolvedValue({ data: live_view });

    await get_mta_sts("a/b");
    await enable_mta_sts("a/b", "testing");
    await disable_mta_sts("a/b");
    await check_mta_sts("a/b");

    expect(get).toHaveBeenCalledWith("/addresses/v1/domains/a%2Fb/mta-sts", {
      skip_cache: true,
    });
    expect(put).toHaveBeenCalledWith("/addresses/v1/domains/a%2Fb/mta-sts", {
      mode: "testing",
    });
    expect(del).toHaveBeenCalledWith("/addresses/v1/domains/a%2Fb/mta-sts");
    expect(post).toHaveBeenCalledWith(
      "/addresses/v1/domains/a%2Fb/mta-sts/check",
      {},
    );
  });

  it("keeps errors and drops non-object data", async () => {
    get.mockResolvedValue({ error: "nope", server_code: "MTA_STS_THROTTLED" });
    const failed = await get_mta_sts("d1");

    expect(failed.data).toBeUndefined();
    expect(failed.server_code).toBe("MTA_STS_THROTTLED");

    post.mockResolvedValue({ data: "text" });
    expect((await check_mta_sts("d1")).data).toBeUndefined();

    put.mockResolvedValue({ data: live_view });
    expect((await enable_mta_sts("d1", "enforce")).data?.state).toBe("live");
  });
});
