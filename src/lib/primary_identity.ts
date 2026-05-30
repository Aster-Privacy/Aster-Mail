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
import { useEffect, useState } from "react";

import {
  use_sender_aliases,
  type SenderOption,
} from "@/hooks/use_sender_aliases";
import {
  get_preferred_sender_id,
  subscribe_preferred_sender,
} from "@/lib/preferred_sender";

export interface PrimaryIdentity {
  email: string;
  display_name?: string;
  sender_option: SenderOption | null;
  is_custom: boolean;
}

const PRIMARY_IDENTITY_TYPES: ReadonlySet<SenderOption["type"]> = new Set([
  "primary",
  "alias",
  "domain",
]);

const PRIMARY_IDENTITY_TYPES: ReadonlySet<SenderOption["type"]> = new Set([
  "primary",
  "alias",
  "domain",
]);

export function resolve_primary_identity(
  sender_options: SenderOption[],
  preferred_sender_id: string | null,
  account_email: string,
): PrimaryIdentity {
  const fallback =
    sender_options.find((o) => o.type === "primary") ?? sender_options[0] ?? null;

  const chosen =
    preferred_sender_id !== null
      ? sender_options.find(
          (o) =>
            o.id === preferred_sender_id &&
            o.is_enabled &&
            PRIMARY_IDENTITY_TYPES.has(o.type),
        ) ?? null
      : null;

  const resolved = chosen ?? fallback;

  if (!resolved) {
    return {
      email: account_email,
      display_name: undefined,
      sender_option: null,
      is_custom: false,
    };
  }

  return {
    email: resolved.email,
    display_name: resolved.display_name,
    sender_option: resolved,
    is_custom: resolved.type !== "primary",
  };
}

export function use_primary_identity(account_email: string): PrimaryIdentity {
  const { sender_options } = use_sender_aliases();
  const [preferred_id, set_preferred_id] = useState<string | null>(() =>
    get_preferred_sender_id(),
  );

  useEffect(() => {
    return subscribe_preferred_sender((id) => set_preferred_id(id));
  }, []);

  return resolve_primary_identity(sender_options, preferred_id, account_email);
}
