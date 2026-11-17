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
import { beforeEach, describe, expect, it, vi } from "vitest";

import { report_phishing } from "./phishing_blocklist";

import { api_client } from "@/services/api/client";

vi.mock("@/services/api/client", () => ({
  api_client: { post: vi.fn() },
}));

const mocked_post = vi.mocked(api_client.post);

async function domain_hash_hex(domain: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(domain),
  );

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

beforeEach(() => {
  mocked_post.mockReset();
  mocked_post.mockResolvedValue({ data: { success: true } } as never);
});

describe("report_phishing", () => {
  it("sends the hashed link hosts and sender domain", async () => {
    await report_phishing(
      ["https://Login.Bad.example/verify?token=secret", "http://bad.example/"],
      "Alerts@Mail.Spoof.example",
    );

    expect(mocked_post).toHaveBeenCalledWith("/phishing/v1/report", {
      domain_hashes: [
        await domain_hash_hex("login.bad.example"),
        await domain_hash_hex("bad.example"),
      ],
      sender_domain_hash: await domain_hash_hex("mail.spoof.example"),
    });
  });

  it("never sends a path, query or the sender's address", async () => {
    await report_phishing(
      ["https://bad.example/reset/alice?token=secret"],
      "alice@spoof.example",
    );

    const body = JSON.stringify(mocked_post.mock.calls[0][1]);

    expect(body).not.toContain("secret");
    expect(body).not.toContain("alice");
    expect(body).not.toContain("bad.example");
  });

  it("sends each host once and at most fifty", async () => {
    const urls = Array.from(
      { length: 80 },
      (_, i) => `https://host${i % 60}.example/`,
    );

    await report_phishing(urls, "");

    const body = mocked_post.mock.calls[0][1] as { domain_hashes: string[] };

    expect(body.domain_hashes).toHaveLength(50);
    expect(new Set(body.domain_hashes).size).toBe(50);
  });

  it("sends nothing when there is nothing to report", async () => {
    await report_phishing([], "");
    await report_phishing(["not a url"], "no-at-sign");

    expect(mocked_post).not.toHaveBeenCalled();
  });

  it("reports the sender domain alone when the email has no links", async () => {
    await report_phishing([], "x@spoof.example");

    expect(mocked_post).toHaveBeenCalledWith("/phishing/v1/report", {
      domain_hashes: [],
      sender_domain_hash: await domain_hash_hex("spoof.example"),
    });
  });
});
