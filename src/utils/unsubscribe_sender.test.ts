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
import { describe, it, expect, vi, beforeEach } from "vitest";

interface Identity {
  email: string;
  address_hash: string;
}

const h = vi.hoisted(() => ({
  identities: {} as Record<string, Identity | undefined>,
  routed: {} as Record<string, string | undefined>,
  populated: true,
  secondary: true,
  after_load: null as null | (() => void),
  ensure: vi.fn(),
  catch_all: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/services/api/subscriptions", () => ({
  proxy_unsubscribe: vi.fn(),
}));

vi.mock("@/hooks/use_sender_aliases", () => ({
  get_cached_sender_identity_for_address: (address: string | undefined) =>
    address ? h.identities[address.trim().toLowerCase()] : undefined,
  get_cached_sender_identity_for_routing_token: (token: string | undefined) => {
    const address = token ? h.routed[token] : undefined;

    return address ? h.identities[address] : undefined;
  },
  is_sender_alias_cache_populated: () => h.populated,
  has_cached_secondary_addresses: () => h.secondary,
  ensure_sender_alias_caches: h.ensure,
}));

vi.mock("@/services/catch_all_sender", () => ({
  catch_all_address_for_routing_token: h.catch_all,
}));

vi.mock("@/services/current_identity", () => ({
  peek_current_user: () => ({ email: "me@astermail.org" }),
}));

vi.mock("@/components/modals/unsubscribe_confirmation_modal", () => ({
  confirm_unsubscribe: h.confirm,
}));

import { proxy_unsubscribe } from "@/services/api/subscriptions";
import {
  execute_unsubscribe,
  perform_unsubscribe,
} from "@/utils/unsubscribe_detector";
import {
  build_listed_unsubscribe_delivery,
  build_unsubscribe_delivery,
  envelope_recipient_addresses,
} from "@/utils/unsubscribe_delivery";
import { resolve_unsubscribe_sender } from "@/utils/unsubscribe_sender";

const mock_proxy = vi.mocked(proxy_unsubscribe);

const MAILTO_INFO = {
  has_unsubscribe: true,
  method: "mailto" as const,
  unsubscribe_mailto: "mailto:leave@list.example.com",
};

const ALIAS = { email: "shop@astermail.org", address_hash: "alias-hash" };
const GHOST = { email: "x7k2@astermail.org", address_hash: "ghost-hash" };
const DOMAIN = { email: "sales@corp.example", address_hash: "domain-hash" };

function fill_caches() {
  h.identities = {
    [ALIAS.email]: ALIAS,
    [GHOST.email]: GHOST,
    [DOMAIN.email]: DOMAIN,
  };
  h.routed = {
    "token-alias": ALIAS.email,
    "token-ghost": GHOST.email,
    "token-domain": DOMAIN.email,
  };
  h.populated = true;
}

function empty_caches() {
  h.identities = {};
  h.routed = {};
  h.populated = false;
}

beforeEach(() => {
  mock_proxy.mockReset();
  mock_proxy.mockResolvedValue({ data: { success: true, method: "mailto" } });
  h.ensure.mockReset();
  h.ensure.mockImplementation(async () => {
    h.after_load?.();
  });
  h.catch_all.mockReset();
  h.catch_all.mockResolvedValue(undefined);
  h.confirm.mockReset();
  h.confirm.mockResolvedValue(true);
  h.after_load = null;
  h.secondary = true;
  fill_caches();
});

describe("resolve_unsubscribe_sender", () => {
  it("uses the alias that received the message", () => {
    expect(
      resolve_unsubscribe_sender({ routing_token: "token-alias" }),
    ).toEqual({
      from_address: "shop@astermail.org",
      from_address_hash: "alias-hash",
    });
  });

  it("uses the ghost address that received the message", () => {
    expect(
      resolve_unsubscribe_sender({ routing_token: "token-ghost" }),
    ).toEqual({
      from_address: "x7k2@astermail.org",
      from_address_hash: "ghost-hash",
    });
  });

  it("uses the custom domain address that received the message", () => {
    expect(
      resolve_unsubscribe_sender({ routing_token: "token-domain" }),
    ).toEqual({
      from_address: "sales@corp.example",
      from_address_hash: "domain-hash",
    });
  });

  it("reports an unknown receiving address as undetermined", () => {
    expect(
      resolve_unsubscribe_sender({
        routing_token: "token-removed",
        recipients: ["me@astermail.org"],
      }),
    ).toBeNull();
  });

  it("uses the primary address when the message addresses it", () => {
    expect(
      resolve_unsubscribe_sender({
        primary_email: "Me@astermail.org",
        recipients: ["me@astermail.org"],
      }),
    ).toEqual({ from_address: "me@astermail.org" });
  });

  it("reads the primary address from the signed-in account", () => {
    expect(
      resolve_unsubscribe_sender({ recipients: ["ME@astermail.org"] }),
    ).toEqual({ from_address: "me@astermail.org" });
  });

  it("uses an own address named in the recipients", () => {
    expect(
      resolve_unsubscribe_sender({ recipients: ["Shop@astermail.org"] }),
    ).toEqual({
      from_address: "shop@astermail.org",
      from_address_hash: "alias-hash",
    });
  });

  it("leaves the choice to the server without delivery details", () => {
    expect(resolve_unsubscribe_sender({})).toBeUndefined();
  });
});

describe("build_unsubscribe_delivery", () => {
  it("collects the routing token and every visible recipient", () => {
    expect(
      build_unsubscribe_delivery(
        { routing_token: "token-alias", item_type: "received" },
        {
          to: [{ email: "a@example.org" }],
          cc: [{ email: "b@example.org" }],
          raw_headers: [{ name: "Delivered-To", value: "<c@example.org>" }],
        },
      ),
    ).toEqual({
      routing_token: "token-alias",
      recipients: ["a@example.org", "b@example.org", "c@example.org"],
    });
  });

  it("ignores the routing token of mail that was not received", () => {
    expect(
      build_unsubscribe_delivery({
        routing_token: "token-alias",
        item_type: "sent",
      }).routing_token,
    ).toBeUndefined();
  });

  it("tolerates a missing mail item", () => {
    expect(build_unsubscribe_delivery(null).routing_token).toBeUndefined();
  });
});

describe("execute_unsubscribe resolves the sender from the delivery", () => {
  it("sends from the alias that received the message", async () => {
    await expect(
      execute_unsubscribe(MAILTO_INFO, { routing_token: "token-alias" }),
    ).resolves.toBe("api");

    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
      from_address: "shop@astermail.org",
      from_address_hash: "alias-hash",
    });
    expect(h.ensure).not.toHaveBeenCalled();
  });

  it("sends from the custom domain address that received the message", async () => {
    await execute_unsubscribe(MAILTO_INFO, { routing_token: "token-domain" });

    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
      from_address: "sales@corp.example",
      from_address_hash: "domain-hash",
    });
  });

  it("loads the addresses before deciding when none are cached", async () => {
    empty_caches();
    h.after_load = fill_caches;

    await expect(
      execute_unsubscribe(MAILTO_INFO, { routing_token: "token-alias" }),
    ).resolves.toBe("api");

    expect(h.ensure).toHaveBeenCalledWith({ refresh: true });
    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
      from_address: "shop@astermail.org",
      from_address_hash: "alias-hash",
    });
  });

  it("loads the addresses to match a recipient when none are cached", async () => {
    empty_caches();
    h.after_load = fill_caches;

    await execute_unsubscribe(MAILTO_INFO, {
      recipients: ["shop@astermail.org"],
    });

    expect(h.ensure).toHaveBeenCalledTimes(1);
    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
      from_address: "shop@astermail.org",
      from_address_hash: "alias-hash",
    });
  });

  it("sends from a catch-all address that matches the routing token", async () => {
    h.catch_all.mockResolvedValue("anything@corp.example");

    await execute_unsubscribe(MAILTO_INFO, {
      routing_token: "token-catch-all",
      recipients: ["Anything@corp.example"],
    });

    expect(h.catch_all).toHaveBeenCalledWith("token-catch-all", [
      "anything@corp.example",
    ]);
    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
      from_address: "anything@corp.example",
    });
  });

  it("sends nothing when the receiving address stays unknown after loading", async () => {
    await expect(
      execute_unsubscribe(MAILTO_INFO, {
        routing_token: "token-removed",
        recipients: ["me@astermail.org"],
      }),
    ).resolves.toBe("mailto");

    expect(h.ensure).toHaveBeenCalledWith({ refresh: true });
    expect(mock_proxy).not.toHaveBeenCalled();
  });

  it("sends mail for the primary address without loading anything", async () => {
    empty_caches();

    await expect(
      execute_unsubscribe(MAILTO_INFO, { recipients: ["me@astermail.org"] }),
    ).resolves.toBe("api");

    expect(h.ensure).not.toHaveBeenCalled();
    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
      from_address: "me@astermail.org",
    });
  });

  it("lets the server choose when the delivery says nothing", async () => {
    await expect(execute_unsubscribe(MAILTO_INFO, {})).resolves.toBe("api");

    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
    });
  });

  it("returns a manual result when the server needs a sender", async () => {
    mock_proxy.mockResolvedValue({
      data: { success: false, method: "mailto", code: "sender_required" },
    });

    await expect(execute_unsubscribe(MAILTO_INFO, {})).resolves.toBe("mailto");
  });
});

describe("execute_unsubscribe for a listed subscription", () => {
  it("sends from the alias that received the latest message", async () => {
    await expect(
      execute_unsubscribe(
        MAILTO_INFO,
        build_listed_unsubscribe_delivery("token-alias", undefined),
      ),
    ).resolves.toBe("api");

    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
      from_address: ALIAS.email,
      from_address_hash: ALIAS.address_hash,
    });
  });

  it("sends from the own address named in the stored recipients", async () => {
    await expect(
      execute_unsubscribe(
        MAILTO_INFO,
        build_listed_unsubscribe_delivery(undefined, [
          "list@news.example.com",
          GHOST.email,
        ]),
      ),
    ).resolves.toBe("api");

    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
      from_address: GHOST.email,
      from_address_hash: GHOST.address_hash,
    });
  });

  it("sends from the primary address when the recipients name it", async () => {
    await expect(
      execute_unsubscribe(
        MAILTO_INFO,
        build_listed_unsubscribe_delivery(undefined, ["me@astermail.org"]),
      ),
    ).resolves.toBe("api");

    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
      from_address: "me@astermail.org",
    });
  });

  it("sends nothing when the receiving address is not known", async () => {
    await expect(
      execute_unsubscribe(
        MAILTO_INFO,
        build_listed_unsubscribe_delivery(undefined, undefined),
      ),
    ).resolves.toBe("mailto");

    expect(mock_proxy).not.toHaveBeenCalled();
  });

  it("sends nothing when the addresses cannot be loaded", async () => {
    empty_caches();
    h.secondary = false;

    await expect(
      execute_unsubscribe(
        MAILTO_INFO,
        build_listed_unsubscribe_delivery(undefined, []),
      ),
    ).resolves.toBe("mailto");

    expect(h.ensure).toHaveBeenCalled();
    expect(mock_proxy).not.toHaveBeenCalled();
  });

  it("sends from the primary address when the account has no other", async () => {
    h.identities = {};
    h.routed = {};
    h.secondary = false;

    await expect(
      execute_unsubscribe(
        MAILTO_INFO,
        build_listed_unsubscribe_delivery(undefined, ["list@news.example.com"]),
      ),
    ).resolves.toBe("api");

    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
      from_address: "me@astermail.org",
    });
  });
});

describe("envelope_recipient_addresses", () => {
  it("collects the delivery address and the visible recipients once", () => {
    expect(
      envelope_recipient_addresses({
        to: [{ name: "Shop", email: "Shop@AsterMail.org" }, "Friend <f@x.io>"],
        cc: [{ name: "", email: "shop@astermail.org" }],
        raw_headers: [{ name: "Delivered-To", value: "<x7k2@astermail.org>" }],
      }),
    ).toEqual(["x7k2@astermail.org", "shop@astermail.org", "f@x.io"]);
  });

  it("tolerates an envelope without recipients", () => {
    expect(envelope_recipient_addresses({})).toEqual([]);
    expect(envelope_recipient_addresses(null)).toEqual([]);
  });
});

describe("perform_unsubscribe", () => {
  it("sends from the address that received the message", async () => {
    await perform_unsubscribe("news@list.example.com", "News", MAILTO_INFO, {
      routing_token: "token-ghost",
    });

    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
      from_address: "x7k2@astermail.org",
      from_address_hash: "ghost-hash",
    });
  });
});
