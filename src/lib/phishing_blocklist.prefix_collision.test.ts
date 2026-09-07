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
import { describe, expect, it, vi } from "vitest";

import { verify_url_with_server } from "./phishing_blocklist";
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

describe("verify_url_with_server prefix collisions", () => {
  it("flags only the url whose full hash the server returned", async () => {
    const bad_hash = await domain_hash_hex("bad.example");

    mocked_post.mockImplementation(async (_endpoint, body) => {
      const requested = (body as { hash_prefixes: string[] }).hash_prefixes;

      return {
        data: {
          matches: requested.map((p) => ({
            prefix: p,
            full_hashes: [bad_hash],
          })),
        },
      } as never;
    });

    const matched = await verify_url_with_server([
      "https://bad.example/login",
      "https://safe.example/",
    ]);

    expect(matched.has("https://bad.example/login")).toBe(true);
    expect(matched.has("https://safe.example/")).toBe(false);
  });

  it("does not flag a url when the prefix matches but the full hash does not", async () => {
    const safe_hash = await domain_hash_hex("safe.example");

    mocked_post.mockResolvedValue({
      data: {
        matches: [
          {
            prefix: safe_hash.slice(0, 8),
            full_hashes: ["0".repeat(64)],
          },
        ],
      },
    } as never);

    const matched = await verify_url_with_server(["https://safe.example/"]);

    expect(matched.size).toBe(0);
  });
});
