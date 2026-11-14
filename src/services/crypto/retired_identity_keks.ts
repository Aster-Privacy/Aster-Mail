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
import type { AccountDataContext } from "./account_data_key";

import { array_to_base64, base64_to_array } from "./base64";

const RETIRED_KEK_CONTEXTS: ReadonlyMap<string, AccountDataContext> = new Map<
  string,
  AccountDataContext
>([
  ["WKk77GlgzyLDRiwNmKtEtEX85tjGtdOENdEryQSIXqw=", "astermail-tags-v1"],
  ["RdcZrFMkuGA18Xnixs3NGtIuqB3H9iP3ioHwBXNEJJs=", "astermail-labels-v1"],
  ["4sDP//h1X8SaDfMlfF3ZpA1aonHUNtIXpI5RXIdKGBw=", "astermail-preferences-v1"],
  ["nKFw/cc8jPGQaMw6rj85yNnX+LxmWaAV+Vm9gcYuwZE=", "astermail-devmode-v1"],
  ["7AMZVzydzg6MOJs2uHeNCG/2DYtCmHgFsrTdnXHfWOY=", "astermail-draft-v1"],
  ["p5wYaTDKBk/9JqOzqdOKL4c0JJF9CiKwLCqNNFvN7gQ=", "astermail-draft-v2"],
  ["mzHu9Qo54Q0jcJSLU5G2ihnnXA4TrP8FgErleac37PM=", "astermail-scheduled-v1"],
  ["ITVDUH5sosbb5Jpb06xCrKm74LPEPTUptD2WP7Zza5E=", "astermail-onboarding-v1"],
  [
    "lwYfbjiSeOYhWhwA/gi0CS8BFd8S2WHtZqq9GHWyq+A=",
    "astermail-subscriptions-v1",
  ],
  [
    "XmAESBldKQHaU5WwCnfecxN4FfwA4HN+o0jUxirZfKg=",
    "astermail-recovery-email-v1",
  ],
  ["GNbUVg+Tah//5+O3y8zjDBgwM0SfByzozJ/wMJpQikk=", "astermail-calendar-v2"],
]);

interface KekEntry {
  k: string;
}

function canonical_kek(value: string): string | null {
  try {
    return array_to_base64(base64_to_array(value));
  } catch {
    return null;
  }
}

export function retired_kek_context(value: string): AccountDataContext | null {
  const direct = RETIRED_KEK_CONTEXTS.get(value);

  if (direct) return direct;

  const canonical = canonical_kek(value);

  return canonical ? (RETIRED_KEK_CONTEXTS.get(canonical) ?? null) : null;
}

export function is_retired_kek(value: string): boolean {
  return retired_kek_context(value) !== null;
}

export function without_retired_keks<T extends KekEntry>(
  list: T[] | undefined | null,
): T[] {
  return (list ?? []).filter((entry) => !is_retired_kek(entry.k));
}

export function retired_contexts_in(
  list: KekEntry[] | undefined | null,
): AccountDataContext[] {
  const found = new Set<AccountDataContext>();

  for (const entry of list ?? []) {
    const context = retired_kek_context(entry.k);

    if (context) found.add(context);
  }

  return [...found];
}

export function retired_kek_values_for(
  list: KekEntry[] | undefined | null,
  contexts: ReadonlySet<AccountDataContext>,
): string[] {
  const values: string[] = [];

  for (const entry of list ?? []) {
    const context = retired_kek_context(entry.k);

    if (context && contexts.has(context)) values.push(entry.k);
  }

  return values;
}

export function all_retired_kek_values(): string[] {
  return [...RETIRED_KEK_CONTEXTS.keys()];
}
