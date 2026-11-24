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
import { exact_host_https_url } from "@/lib/payment_url";

export const PROVIDER_SIGN_IN_HOSTS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map([
  ["google", new Set(["accounts.google.com"])],
  ["microsoft", new Set(["login.microsoftonline.com"])],
  ["yahoo", new Set(["api.login.yahoo.com"])],
]);

export function checked_provider_sign_in_url(
  provider: string,
  url: string | null | undefined,
): URL | null {
  const hosts = PROVIDER_SIGN_IN_HOSTS.get(provider);

  if (!hosts) return null;

  return exact_host_https_url(url, hosts);
}
