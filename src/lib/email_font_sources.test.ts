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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

function font_bytes(weight: number): Uint8Array {
  return new Uint8Array(
    readFileSync(
      join(process.cwd(), "public/fonts", `GoogleSansFlex-${weight}.woff2`),
    ),
  );
}

function app_font_file(weight: number): string {
  return new URL(`/fonts/GoogleSansFlex-${weight}.woff2`, window.location.href)
    .href;
}

async function load_module() {
  return import("@/lib/email_font_sources");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("email font sources", () => {
  it("does not inline a page served in place of a missing font", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<!DOCTYPE html><html></html>")),
    );
    const { email_font_src, preload_email_fonts } = await load_module();

    await preload_email_fonts();

    expect(email_font_src(400)).toBe(app_font_file(400));
  });

  it("tries again after a failed read and stops once every font is inlined", async () => {
    const fetch_font = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async (url: string) => {
        const weight = Number(/-(\d+)\.woff2$/.exec(url)![1]);

        return new Response(font_bytes(weight));
      });

    vi.stubGlobal("fetch", fetch_font);
    const { email_font_src, preload_email_fonts } = await load_module();

    await preload_email_fonts();
    expect(email_font_src(400)).toBe(app_font_file(400));

    await preload_email_fonts();
    await preload_email_fonts();

    expect(email_font_src(400)).toBe(
      `data:font/woff2;base64,${Buffer.from(font_bytes(400)).toString("base64")}`,
    );
    expect(fetch_font).toHaveBeenCalledTimes(5);
  });
});
