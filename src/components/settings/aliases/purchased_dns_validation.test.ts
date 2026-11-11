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
import type { PurchasedDnsRecord } from "@/services/api/domains";

import { describe, expect, it } from "vitest";

import {
  draft_from_record,
  draft_to_input,
  empty_draft,
  format_ttl_parts,
  is_private_ipv4,
  is_private_ipv6,
  is_protected_host,
  load_error_key,
  nearest_ttl,
  normalize_host,
  parse_ipv4,
  parse_ipv6,
  record_content,
  server_error_key,
  validate_draft,
  type PurchasedDnsDraft,
} from "./purchased_dns_validation";

const DOMAIN = "example.org";

function draft(overrides: Partial<PurchasedDnsDraft>): PurchasedDnsDraft {
  return { ...empty_draft(overrides.type ?? "A"), ...overrides };
}

function record(overrides: Partial<PurchasedDnsRecord>): PurchasedDnsRecord {
  return {
    id: "r1",
    type: "A",
    host: "www",
    name: "www.example.org",
    value: "93.184.216.34",
    ttl: 3600,
    protected: false,
    ...overrides,
  };
}

describe("normalize_host", () => {
  it("maps the apex forms to an empty host", () => {
    expect(normalize_host("", DOMAIN)).toBe("");
    expect(normalize_host("@", DOMAIN)).toBe("");
    expect(normalize_host("Example.org.", DOMAIN)).toBe("");
  });

  it("strips the domain suffix and lowercases", () => {
    expect(normalize_host("WWW.example.org", DOMAIN)).toBe("www");
    expect(normalize_host(" blog ", DOMAIN)).toBe("blog");
    expect(normalize_host("a.b", DOMAIN)).toBe("a.b");
  });

  it("allows a wildcard only as the leftmost label", () => {
    expect(normalize_host("*", DOMAIN)).toBe("*");
    expect(normalize_host("*.dev", DOMAIN)).toBe("*.dev");
    expect(normalize_host("dev.*", DOMAIN)).toBeNull();
    expect(normalize_host("d*v", DOMAIN)).toBeNull();
  });

  it("rejects malformed hosts", () => {
    expect(normalize_host(".www", DOMAIN)).toBeNull();
    expect(normalize_host("a..b", DOMAIN)).toBeNull();
    expect(normalize_host("-bad", DOMAIN)).toBeNull();
    expect(normalize_host("bad-", DOMAIN)).toBeNull();
    expect(normalize_host("sp ace", DOMAIN)).toBeNull();
    expect(normalize_host("café", DOMAIN)).toBeNull();
    expect(normalize_host("a".repeat(64), DOMAIN)).toBeNull();
    expect(normalize_host("a".repeat(301), DOMAIN)).toBeNull();
    expect(normalize_host(Array(64).fill("abc").join("."), DOMAIN)).toBeNull();
  });

  it("accepts a 63 character label", () => {
    expect(normalize_host("a".repeat(63), DOMAIN)).toBe("a".repeat(63));
  });
});

describe("is_protected_host", () => {
  it("covers mail and verification hosts", () => {
    for (const host of [
      "_dmarc",
      "_aster-verify",
      "_smtp._tls",
      "_mta-sts",
      "mta-sts",
      "aster._domainkey",
      "aster2._domainkey",
      "_domainkey",
      "default._bimi",
    ]) {
      expect(is_protected_host(host)).toBe(true);
    }
  });

  it("matches the server on third-party selectors", () => {
    expect(is_protected_host("google._domainkey")).toBe(false);
    expect(is_protected_host("x._bimi")).toBe(false);
    expect(is_protected_host("asterx._domainkey")).toBe(false);
  });

  it("leaves ordinary hosts editable", () => {
    expect(is_protected_host("www")).toBe(false);
    expect(is_protected_host("domainkey")).toBe(false);
    expect(is_protected_host("_sip._tcp")).toBe(false);
  });
});

describe("ip parsing", () => {
  it("parses strict IPv4", () => {
    expect(parse_ipv4("93.184.216.34")).toEqual([93, 184, 216, 34]);
    expect(parse_ipv4("256.1.1.1")).toBeNull();
    expect(parse_ipv4("01.1.1.1")).toBeNull();
    expect(parse_ipv4("1.1.1")).toBeNull();
    expect(parse_ipv4("1.1.1.1.1")).toBeNull();
    expect(parse_ipv4("1.1.1.x")).toBeNull();
  });

  it("flags non-public IPv4 ranges", () => {
    for (const ip of [
      "0.0.0.0",
      "10.1.2.3",
      "127.0.0.1",
      "100.64.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.1",
      "192.0.2.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(is_private_ipv4(parse_ipv4(ip)!)).toBe(true);
    }
    expect(is_private_ipv4(parse_ipv4("172.32.0.1")!)).toBe(false);
    expect(is_private_ipv4(parse_ipv4("8.8.8.8")!)).toBe(false);
  });

  it("parses IPv6 forms", () => {
    expect(parse_ipv6("2606:4700::1111")).toEqual([
      0x2606, 0x4700, 0, 0, 0, 0, 0, 0x1111,
    ]);
    expect(parse_ipv6("::ffff:8.8.8.8")).toEqual([
      0, 0, 0, 0, 0, 0xffff, 0x0808, 0x0808,
    ]);
    expect(parse_ipv6("1:2:3:4:5:6:7:8")).toHaveLength(8);
    expect(parse_ipv6("1::2::3")).toBeNull();
    expect(parse_ipv6("1:2:3:4:5:6:7:8:9")).toBeNull();
    expect(parse_ipv6("1:2:3:4:5:6:7")).toBeNull();
    expect(parse_ipv6("1:2:3:4::5:6:7:8")).toBeNull();
    expect(parse_ipv6("12345::")).toBeNull();
    expect(parse_ipv6("g::1")).toBeNull();
    expect(parse_ipv6("1.2.3.4::")).toBeNull();
  });

  it("flags non-public IPv6 ranges", () => {
    for (const ip of [
      "::",
      "::1",
      "fc00::1",
      "fd12::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "64:ff9b::1",
      "::ffff:10.0.0.1",
      "::1.2.3.4",
      "fec0::1",
      "100::1",
      "2002:c000:0204::1",
      "2001:0:4136:e378::1",
    ]) {
      expect(is_private_ipv6(parse_ipv6(ip)!)).toBe(true);
    }
    expect(is_private_ipv6(parse_ipv6("2606:4700::1111")!)).toBe(false);
    expect(is_private_ipv6(parse_ipv6("::ffff:8.8.8.8")!)).toBe(false);
  });
});

describe("validate_draft", () => {
  const key = (d: Partial<PurchasedDnsDraft>) =>
    validate_draft(draft(d), DOMAIN)?.key ?? null;

  it("accepts valid records of every type", () => {
    expect(key({ type: "A", host: "www", value: "93.184.216.34" })).toBeNull();
    expect(key({ type: "AAAA", host: "@", value: "2606:4700::1" })).toBeNull();
    expect(key({ type: "CNAME", host: "blog", value: "host.net." })).toBeNull();
    expect(key({ type: "TXT", host: "", value: '"hello world"' })).toBeNull();
    expect(key({ type: "MX", host: "lists", value: "mx.host.net" })).toBeNull();
    expect(
      key({
        type: "SRV",
        host: "_sip._tcp",
        priority: "10",
        weight: "5",
        port: "5060",
        target: "sip.host.net",
      }),
    ).toBeNull();
    expect(
      key({
        type: "CAA",
        host: "",
        flags: "0",
        tag: "issue",
        value: "letsencrypt.org",
      }),
    ).toBeNull();
  });

  it("rejects protected and apex conflicts", () => {
    expect(key({ host: "_dmarc", value: "1.1.1.1" })).toBe(
      "settings.purchased_dns_error_protected_host",
    );
    expect(key({ type: "MX", host: "@", value: "mx.host.net" })).toBe(
      "settings.purchased_dns_error_apex_mx",
    );
    expect(key({ type: "CNAME", host: "example.org", value: "host.net" })).toBe(
      "settings.purchased_dns_error_apex_cname",
    );
    expect(key({ type: "TXT", host: "", value: "v=spf1 -all" })).toBe(
      "settings.purchased_dns_error_apex_spf",
    );
    expect(key({ type: "TXT", host: "", value: "V=SPF1" })).toBe(
      "settings.purchased_dns_error_apex_spf",
    );
    expect(key({ type: "TXT", host: "sub", value: "v=spf1 -all" })).toBeNull();
    expect(key({ type: "TXT", host: "*", value: "v=STSv1; id=1" })).toBe(
      "settings.purchased_dns_error_protected_host",
    );
    expect(key({ type: "TXT", host: "*", value: "v=spf1 -all" })).toBe(
      "settings.purchased_dns_error_protected_host",
    );
    expect(
      key({ type: "TXT", host: "*", value: "site-verification=x" }),
    ).toBeNull();
    expect(
      key({ type: "TXT", host: "*.dev", value: "v=spf1 -all" }),
    ).toBeNull();
  });

  it("rejects bad addresses", () => {
    expect(key({ value: "" })).toBe("settings.purchased_dns_error_required");
    expect(key({ value: "   " })).toBe("settings.purchased_dns_error_required");
    expect(key({ value: "999.1.1.1" })).toBe(
      "settings.purchased_dns_error_ipv4",
    );
    expect(key({ value: "192.168.0.1" })).toBe(
      "settings.purchased_dns_error_private_ip",
    );
    expect(key({ type: "AAAA", value: "nope" })).toBe(
      "settings.purchased_dns_error_ipv6",
    );
    expect(key({ type: "AAAA", value: "::1" })).toBe(
      "settings.purchased_dns_error_private_ip",
    );
  });

  it("rejects bad targets", () => {
    expect(key({ type: "CNAME", host: "a", value: "10.0.0.1" })).toBe(
      "settings.purchased_dns_error_target",
    );
    expect(key({ type: "CNAME", host: "a", value: "host.ex_ample" })).toBe(
      "settings.purchased_dns_error_target",
    );
    expect(key({ type: "CNAME", host: "a", value: "localhost" })).toBe(
      "settings.purchased_dns_error_target",
    );
    expect(key({ type: "CNAME", host: "a", value: "a.example.org." })).toBe(
      "settings.purchased_dns_error_cname_self",
    );
    expect(key({ type: "MX", host: "m", value: "bad_host" })).toBe(
      "settings.purchased_dns_error_target",
    );
    expect(
      key({ type: "MX", host: "m", value: "mx.host.net", priority: "70000" }),
    ).toBe("settings.purchased_dns_error_priority");
    expect(
      key({ type: "MX", host: "m", value: "mx.host.net", priority: "-1" }),
    ).toBe("settings.purchased_dns_error_priority");
  });

  it("enforces TXT limits", () => {
    expect(key({ type: "TXT", host: "t", value: '"a""b"' })).toBe(
      "settings.purchased_dns_error_txt_chars",
    );
    expect(key({ type: "TXT", host: "t", value: "a".repeat(2048) })).toBeNull();
    expect(key({ type: "TXT", host: "t", value: "a".repeat(2049) })).toBe(
      "settings.purchased_dns_error_txt_length",
    );
    expect(key({ type: "TXT", host: "t", value: "line\nbreak" })).toBe(
      "settings.purchased_dns_error_txt_chars",
    );
    expect(key({ type: "TXT", host: "t", value: 'a"b' })).toBe(
      "settings.purchased_dns_error_txt_chars",
    );
    expect(key({ type: "TXT", host: "t", value: "a\\b" })).toBe(
      "settings.purchased_dns_error_txt_chars",
    );
    expect(key({ type: "TXT", host: "t", value: '""' })).toBe(
      "settings.purchased_dns_error_required",
    );
  });

  it("enforces SRV structure", () => {
    const srv = {
      type: "SRV" as const,
      host: "_sip._tcp",
      priority: "10",
      weight: "5",
      port: "5060",
      target: "sip.host.net",
    };

    expect(key({ ...srv, host: "sip" })).toBe(
      "settings.purchased_dns_error_srv_host",
    );
    expect(key({ ...srv, host: "_sip._xyz" })).toBe(
      "settings.purchased_dns_error_srv_host",
    );
    expect(key({ ...srv, host: "_._tcp" })).toBe(
      "settings.purchased_dns_error_srv_host",
    );
    expect(key({ ...srv, weight: "x" })).toBe(
      "settings.purchased_dns_error_weight",
    );
    expect(key({ ...srv, port: "0" })).toBe(
      "settings.purchased_dns_error_port",
    );
    expect(key({ ...srv, port: "65536" })).toBe(
      "settings.purchased_dns_error_port",
    );
    expect(key({ ...srv, target: "" })).toBe(
      "settings.purchased_dns_error_required",
    );
    expect(key({ ...srv, target: "nodot" })).toBe(
      "settings.purchased_dns_error_target",
    );
  });

  it("enforces CAA structure", () => {
    const caa = { type: "CAA" as const, host: "", value: "ca.example" };

    expect(key({ ...caa, flags: "1" })).toBe(
      "settings.purchased_dns_error_caa_flags",
    );
    expect(key({ ...caa, tag: "contactemail" })).toBe(
      "settings.purchased_dns_error_caa_tag",
    );
    expect(key({ ...caa, value: "ca.example; account=1" })).toBeNull();
    expect(key({ ...caa, value: 'has "quote"' })).toBe(
      "settings.purchased_dns_error_caa_value",
    );
    expect(key({ ...caa, value: "a".repeat(256) })).toBe(
      "settings.purchased_dns_error_caa_value",
    );
    expect(
      key({ ...caa, flags: "128", tag: "iodef", value: "mailto:a@b.org" }),
    ).toBeNull();
  });
});

describe("draft round trips", () => {
  it("builds the request body for each type", () => {
    expect(
      draft_to_input(
        draft({ type: "A", host: "WWW", value: " 1.2.3.4 " }),
        DOMAIN,
      ),
    ).toEqual({ type: "A", host: "www", ttl: 3600, value: "1.2.3.4" });
    expect(
      draft_to_input(draft({ type: "TXT", host: "@", value: '"x"' }), DOMAIN),
    ).toEqual({ type: "TXT", host: "@", ttl: 3600, value: "x" });
    expect(
      draft_to_input(
        draft({ type: "TXT", host: "@", value: '"v=DKIM1; p=AB" \t "CD"' }),
        DOMAIN,
      ),
    ).toEqual({ type: "TXT", host: "@", ttl: 3600, value: "v=DKIM1; p=ABCD" });
    expect(
      draft_to_input(
        draft({ type: "MX", host: "m", value: "mx.host.net", priority: "20" }),
        DOMAIN,
      ),
    ).toEqual({
      type: "MX",
      host: "m",
      ttl: 3600,
      value: "mx.host.net",
      priority: 20,
    });
    expect(
      draft_to_input(
        draft({
          type: "SRV",
          host: "_sip._tcp",
          priority: "1",
          weight: "2",
          port: "3",
          target: "t.host.net",
        }),
        DOMAIN,
      ),
    ).toEqual({
      type: "SRV",
      host: "_sip._tcp",
      ttl: 3600,
      priority: 1,
      weight: 2,
      port: 3,
      target: "t.host.net",
    });
    expect(
      draft_to_input(
        draft({
          type: "CAA",
          host: "",
          flags: "128",
          tag: "issue",
          value: "ca.org",
        }),
        DOMAIN,
      ),
    ).toEqual({
      type: "CAA",
      host: "@",
      ttl: 3600,
      value: "ca.org",
      flags: 128,
      tag: "issue",
    });
  });

  it("loads records into drafts", () => {
    expect(draft_from_record(record({ host: "@" }))?.host).toBe("");
    expect(draft_from_record(record({ ttl: 7207 }))?.ttl).toBe(7207);
    expect(draft_from_record(record({ ttl: 60 }))?.ttl).toBe(3600);
    expect(draft_from_record(record({ type: "NS" as never }))).toBeNull();
    const srv = draft_from_record(
      record({
        type: "SRV",
        host: "_sip._tcp",
        value: "10 5 5060 sip.host.net",
        priority: 10,
        weight: 5,
        port: 5060,
        target: "sip.host.net",
      }),
    );

    expect(srv).toMatchObject({
      priority: "10",
      weight: "5",
      port: "5060",
      value: "",
    });
  });
});

describe("helpers", () => {
  it("snaps TTLs to the nearest option", () => {
    expect(nearest_ttl(3600)).toBe(3600);
    expect(nearest_ttl(60)).toBe(3600);
    expect(nearest_ttl(7207)).toBe(7207);
    expect(nearest_ttl(90000)).toBe(90000);
    expect(nearest_ttl(3599.5)).toBe(3600);
    expect(nearest_ttl(99999999)).toBe(2592000);
  });

  it("formats TTL parts", () => {
    expect(format_ttl_parts(3600)).toEqual({ unit: "hours", count: 1 });
    expect(format_ttl_parts(43200)).toEqual({ unit: "hours", count: 12 });
    expect(format_ttl_parts(86400)).toEqual({ unit: "days", count: 1 });
    expect(format_ttl_parts(7207)).toEqual({ unit: "seconds", count: 7207 });
  });

  it("renders record content", () => {
    expect(
      record_content(record({ type: "MX", value: "mx.a.org", priority: 10 })),
    ).toBe("10 mx.a.org");
    expect(
      record_content(
        record({ type: "CAA", value: "ca.org", flags: 0, tag: "issue" }),
      ),
    ).toBe('0 issue "ca.org"');
  });

  it("maps server codes without trusting prototype keys", () => {
    expect(server_error_key("DNS_PRIVATE_IP", 400)).toBe(
      "settings.purchased_dns_error_private_ip",
    );
    expect(server_error_key("constructor", 400)).toBe(
      "settings.purchased_dns_error_generic",
    );
    expect(server_error_key("__proto__", 404)).toBe(
      "settings.purchased_dns_error_not_found",
    );
    expect(server_error_key(undefined, 429)).toBe(
      "settings.purchased_dns_error_rate_limited",
    );
    expect(server_error_key("UNKNOWN", 500)).toBe(
      "settings.purchased_dns_error_generic",
    );
  });
});

describe("load_error_key", () => {
  it("uses the load failure message unless rate limited", () => {
    expect(load_error_key(500)).toBe("settings.purchased_dns_load_failed");
    expect(load_error_key(undefined)).toBe(
      "settings.purchased_dns_load_failed",
    );
    expect(load_error_key(404)).toBe("settings.purchased_dns_load_failed");
    expect(load_error_key(429)).toBe(
      "settings.purchased_dns_error_rate_limited",
    );
  });
});
