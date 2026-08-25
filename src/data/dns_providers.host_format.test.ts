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
  DNS_PROVIDERS,
  format_record_host,
  format_root_host,
  provider_dashboard_url,
} from "./dns_providers";

function provider(id: string) {
  const found = DNS_PROVIDERS.find((p) => p.id === id);

  if (!found) throw new Error(`unknown provider ${id}`);

  return found;
}

describe("format_record_host", () => {
  it("renders the root host as @ for providers that expect it", () => {
    expect(format_record_host("@", "example.com", provider("cloudflare"))).toBe(
      "@",
    );
    expect(format_record_host("@", "example.com", provider("godaddy"))).toBe(
      "@",
    );
  });

  it("renders the root host as blank for providers that reject @", () => {
    expect(format_record_host("@", "example.com", provider("porkbun"))).toBe(
      "",
    );
    expect(format_record_host("@", "example.com", provider("namesilo"))).toBe(
      "",
    );
    expect(format_record_host("@", "example.com", provider("ovh"))).toBe("");
  });

  it("expands the root host to the full domain for route53", () => {
    expect(format_record_host("@", "example.com", provider("route53"))).toBe(
      "example.com",
    );
  });

  it("expands subdomain hosts to fqdn only for route53", () => {
    expect(
      format_record_host(
        "aster._domainkey",
        "example.com",
        provider("route53"),
      ),
    ).toBe("aster._domainkey.example.com");

    expect(
      format_record_host(
        "aster._domainkey",
        "example.com",
        provider("cloudflare"),
      ),
    ).toBe("aster._domainkey");
  });

  it("falls back to @ and relative hosts when the provider is unknown", () => {
    expect(format_record_host("@", "example.com", null)).toBe("@");
    expect(format_record_host("_dmarc", "example.com", null)).toBe("_dmarc");
  });

  it("never appends the domain twice for fqdn providers", () => {
    const host = format_record_host(
      "_dmarc",
      "example.com",
      provider("route53"),
    );

    expect(host).toBe("_dmarc.example.com");
    expect(host.split("example.com").length - 1).toBe(1);
  });
});

describe("format_root_host", () => {
  it("defaults to @ when no provider was detected", () => {
    expect(format_root_host(null)).toBe("@");
  });

  it("returns blank for blank-root providers", () => {
    expect(format_root_host(provider("vercel"))).toBe("");
  });
});

describe("provider_dashboard_url", () => {
  it("substitutes the domain into the deep link", () => {
    expect(provider_dashboard_url(provider("porkbun"), "example.com")).toBe(
      "https://porkbun.com/account/dns/example.com",
    );
  });

  it("url-encodes the domain so it cannot break out of the link", () => {
    expect(
      provider_dashboard_url(provider("porkbun"), "ex ample.com/evil"),
    ).toBe("https://porkbun.com/account/dns/ex%20ample.com%2Fevil");
  });

  it("returns null when the provider has no dashboard link", () => {
    expect(provider_dashboard_url(null, "example.com")).toBeNull();
  });
});

describe("provider table", () => {
  it("gives every provider a host style and fqdn flag", () => {
    for (const p of DNS_PROVIDERS) {
      expect(["at", "blank"]).toContain(p.root_host_style);
      expect(typeof p.needs_fqdn_host).toBe("boolean");
    }
  });

  it("has no duplicate provider ids", () => {
    const ids = DNS_PROVIDERS.map((p) => p.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
