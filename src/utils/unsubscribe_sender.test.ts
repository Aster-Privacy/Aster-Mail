//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  identities: {} as Record<
    string,
    { email: string; address_hash: string } | undefined
  >,
  routed_aliases: {} as Record<string, string | undefined>,
  routed_ghosts: {} as Record<string, string | undefined>,
}));

vi.mock("@/services/api/subscriptions", () => ({
  proxy_unsubscribe: vi.fn(),
}));

vi.mock("@/hooks/use_sender_aliases", () => ({
  get_cached_sender_identity_for_address: (address: string | undefined) =>
    address ? h.identities[address.trim().toLowerCase()] : undefined,
  get_cached_alias_for_routing_token: (token: string | undefined) =>
    token ? h.routed_aliases[token] : undefined,
  get_cached_ghost_for_routing_token: (token: string | undefined) =>
    token ? h.routed_ghosts[token] : undefined,
}));

import { proxy_unsubscribe } from "@/services/api/subscriptions";
import { execute_unsubscribe } from "@/utils/unsubscribe_detector";
import { resolve_unsubscribe_sender } from "@/utils/unsubscribe_sender";

const mock_proxy = vi.mocked(proxy_unsubscribe);

const MAILTO_INFO = {
  has_unsubscribe: true,
  method: "mailto" as const,
  unsubscribe_mailto: "mailto:leave@list.example.com",
};

const ALIAS = { email: "shop@astermail.org", address_hash: "alias-hash" };
const GHOST = { email: "x7k2@astermail.org", address_hash: "ghost-hash" };

describe("unsubscribe sender follows the receiving address", () => {
  beforeEach(() => {
    mock_proxy.mockReset();
    h.identities = {
      "shop@astermail.org": ALIAS,
      "x7k2@astermail.org": GHOST,
    };
    h.routed_aliases = { "token-alias": "shop@astermail.org" };
    h.routed_ghosts = { "token-ghost": "x7k2@astermail.org" };
  });

  it("uses the alias that received the message", () => {
    expect(
      resolve_unsubscribe_sender({
        routing_token: "token-alias",
        primary_email: "me@astermail.org",
      }),
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

  it("reports an unknown receiving address as undetermined", () => {
    expect(
      resolve_unsubscribe_sender({
        routing_token: "token-removed",
        primary_email: "me@astermail.org",
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

  it("uses an own address named in the recipients", () => {
    expect(
      resolve_unsubscribe_sender({
        primary_email: "me@astermail.org",
        recipients: ["Shop@astermail.org"],
      }),
    ).toEqual({
      from_address: "shop@astermail.org",
      from_address_hash: "alias-hash",
    });
  });

  it("leaves the choice to the server without delivery details", () => {
    expect(
      resolve_unsubscribe_sender({ primary_email: "me@astermail.org" }),
    ).toBeUndefined();
  });

  it("sends the unsubscribe email from the receiving address", async () => {
    mock_proxy.mockResolvedValue({ data: { success: true, method: "mailto" } });

    await expect(
      execute_unsubscribe(MAILTO_INFO, {
        sender: {
          from_address: "shop@astermail.org",
          from_address_hash: "alias-hash",
        },
      }),
    ).resolves.toBe("api");

    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
      from_address: "shop@astermail.org",
      from_address_hash: "alias-hash",
    });
  });

  it("sends nothing when the receiving address is undetermined", async () => {
    await expect(
      execute_unsubscribe(MAILTO_INFO, { sender: null }),
    ).resolves.toBe("mailto");

    expect(mock_proxy).not.toHaveBeenCalled();
  });

  it("returns a manual result when the server needs a sender", async () => {
    mock_proxy.mockResolvedValue({
      data: { success: false, method: "mailto", code: "sender_required" },
    });

    await expect(execute_unsubscribe(MAILTO_INFO)).resolves.toBe("mailto");

    expect(mock_proxy).toHaveBeenCalledWith({
      method: "mailto",
      mailto_address: "mailto:leave@list.example.com",
    });
  });
});
