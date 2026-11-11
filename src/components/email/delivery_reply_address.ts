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
import { resolve_received_on_alias } from "@/components/email/build_reply_from_address";
import { get_cached_aliases } from "@/components/settings/hooks/use_aliases";
import {
  get_cached_alias_for_routing_token,
  get_cached_ghost_for_routing_token,
} from "@/hooks/use_sender_aliases";

export function resolve_delivery_reply_address(
  routing_token: string | undefined,
): string | undefined {
  if (!routing_token) return undefined;

  return (
    resolve_received_on_alias(routing_token, get_cached_aliases()) ??
    get_cached_alias_for_routing_token(routing_token) ??
    get_cached_ghost_for_routing_token(routing_token)
  );
}
