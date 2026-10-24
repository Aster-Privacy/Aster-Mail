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
import { describe, expect, it } from "vitest";

import {
  get_url_scheme,
  is_local_resource_url,
  is_remote_url_value,
  is_trusted_render_url,
  normalize_url_value,
  parse_srcset_candidates,
  resolve_url_origin,
  to_absolute_remote_url,
} from "@/lib/url_value";

const REMOTE = "https://evil.example/px?id=v";
const TRUSTED = new Set(["https://app.example"]);

const CONTROL_VARIANTS = [
  `\u0001${REMOTE}`,
  `\u001f${REMOTE}`,
  `\u0000${REMOTE}`,
  `${REMOTE}\u0001`,
  `${REMOTE}\u001f \u0008`,
  `\u0001 \t\u001f\u000b${REMOTE}\u000e `,
  `\u0001https://evil.ex\tample/px?id=v`,
  `\u0001https://evil.ex\r\nample/px?id=v`,
];

describe("normalize_url_value", () => {
  it.each(CONTROL_VARIANTS)(
    "strips controls the way a URL parser does: %j",
    (value) => {
      expect(normalize_url_value(value)).toBe(REMOTE);
    },
  );

  it("keeps interior spaces and non-control characters", () => {
    expect(normalize_url_value("\u0001https://a.example/a b")).toBe(
      "https://a.example/a b",
    );
    expect(normalize_url_value("�https://a.example/")).toBe(
      "�https://a.example/",
    );
  });

  it("returns an empty string for a value made only of controls", () => {
    expect(normalize_url_value("\u0001\u0002 \u001f")).toBe("");
  });
});

describe("is_remote_url_value", () => {
  it.each(CONTROL_VARIANTS)("treats %j as remote", (value) => {
    expect(is_remote_url_value(value)).toBe(true);
  });

  it("treats scheme-relative and backslash forms as remote", () => {
    expect(is_remote_url_value("\u0001//evil.example/a.png")).toBe(true);
    expect(is_remote_url_value("\\\\evil.example/a.png")).toBe(true);
    expect(is_remote_url_value("\\/evil.example/a.png")).toBe(true);
    expect(is_remote_url_value("\u001fHTTP://evil.example/a.png")).toBe(true);
  });

  it("does not treat local schemes as remote", () => {
    expect(is_remote_url_value("\u0001data:image/png;base64,AAAA")).toBe(false);
    expect(is_remote_url_value("\u0001cid:part1")).toBe(false);
    expect(is_remote_url_value("blob:https://app.example/id")).toBe(false);
    expect(is_remote_url_value("")).toBe(false);
    expect(is_remote_url_value("\u0001\u0002")).toBe(false);
  });
});

describe("scheme helpers", () => {
  it("reads the scheme after stripping controls", () => {
    expect(get_url_scheme("\u0001DATA:image/png,x")).toBe("data");
    expect(get_url_scheme("relative/path.png")).toBeNull();
    expect(is_local_resource_url("\u001fcid:abc")).toBe(true);
    expect(is_local_resource_url("\u001fhttps://evil.example/")).toBe(false);
  });
});

describe("to_absolute_remote_url", () => {
  it("returns the normalized absolute URL", () => {
    expect(to_absolute_remote_url(`\u0001${REMOTE}\u0002`)).toBe(REMOTE);
  });

  it("resolves scheme-relative forms to https", () => {
    expect(to_absolute_remote_url("\u0001//evil.example/a.png")).toBe(
      "https://evil.example/a.png",
    );
    expect(to_absolute_remote_url("\\\\evil.example/a.png")).toBe(
      "https://evil.example/a.png",
    );
  });
});

describe("is_trusted_render_url", () => {
  it("rejects a control-prefixed foreign URL", () => {
    for (const value of CONTROL_VARIANTS) {
      expect(is_trusted_render_url(value, TRUSTED)).toBe(false);
    }
  });

  it("accepts local resources, empty values and trusted origins", () => {
    expect(is_trusted_render_url("", TRUSTED)).toBe(true);
    expect(is_trusted_render_url("data:image/png;base64,AAAA", TRUSTED)).toBe(
      true,
    );
    expect(is_trusted_render_url("cid:part1", TRUSTED)).toBe(true);
    expect(is_trusted_render_url("blob:https://app.example/1", TRUSTED)).toBe(
      true,
    );
    expect(
      is_trusted_render_url(
        "\u0001https://app.example/api/images/v1/proxy?url=x",
        TRUSTED,
      ),
    ).toBe(true);
  });

  it("rejects other schemes and unparseable values", () => {
    expect(is_trusted_render_url("javascript:alert(1)", TRUSTED)).toBe(false);
    expect(is_trusted_render_url("ftp://evil.example/a", TRUSTED)).toBe(false);
    expect(is_trusted_render_url("https://[bad", TRUSTED)).toBe(false);
  });

  it("resolves the origin of an absolute URL", () => {
    expect(resolve_url_origin(`\u0001${REMOTE}`)).toBe("https://evil.example");
    expect(resolve_url_origin("mailto:a@example.com")).toBeNull();
  });
});

describe("parse_srcset_candidates", () => {
  it("keeps a control-prefixed candidate and its descriptor", () => {
    expect(
      parse_srcset_candidates(
        `https://app.example/a.png 1x, \u0001${REMOTE} 2x`,
      ),
    ).toEqual([
      { url: "https://app.example/a.png", descriptor: "1x" },
      { url: `\u0001${REMOTE}`, descriptor: "2x" },
    ]);
  });
});
