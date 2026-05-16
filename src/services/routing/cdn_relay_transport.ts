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
import type { TranslationKey } from "@/lib/i18n/types";

import { connection_store } from "./connection_store";

export class CdnRelayMisconfiguredError extends Error {
  i18n_key: TranslationKey = "errors.cdn_relay_misconfigured";
  constructor() {
    super("cdn_relay_misconfigured");
  }
}

try {
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.removeItem("aster_relay_auth_token");
  }
} catch {}

export async function cdn_relay_fetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const relay_url = connection_store.get_cdn_relay_url();

  if (!relay_url) {
    throw new CdnRelayMisconfiguredError();
  }

  const original = new URL(url);
  const relayed = `${relay_url}${original.pathname}${original.search}`;

  return fetch(relayed, options);
}
