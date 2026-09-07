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
import type { EmailCategory, InboxEmail } from "@/types/email";
import type { TranslationKey } from "@/lib/i18n/types";

import { create_rule } from "@/services/api/mail_rules";
import { show_toast } from "@/components/toast/simple_toast";
import { ignore_error } from "@/lib/ignore_error";

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

// A single move is often a one-off correction, so offering a permanent rule on
// every drop would nag. The offer appears only once the same sender has been
// sent to the same category twice, which is the point the user has actually
// shown intent. The tally is per session and in memory: it never leaves the
// device and never becomes another thing to clean up.
const REPEAT_THRESHOLD = 2;
const move_tally = new Map<string, number>();
const offered = new Set<string>();

function tally_key(sender_email: string, category: EmailCategory): string {
  return `${sender_email}\u0000${category}`;
}

export function reset_sender_rule_state(): void {
  move_tally.clear();
  offered.clear();
}

function sole_sender(emails: readonly InboxEmail[]): string | null {
  let found: string | null = null;

  for (const email of emails) {
    const address = (email.sender_email || "").trim().toLowerCase();

    if (!address || address.includes(" ")) return null;
    if (found === null) {
      found = address;
    } else if (found !== address) {
      return null;
    }
  }

  return found;
}

async function create_sender_rule(
  sender_email: string,
  category: EmailCategory,
  category_label: string,
  t: Translate,
): Promise<void> {
  const response = await create_rule({
    name: t("mail.sender_rule_name", {
      sender: sender_email,
      category: category_label,
    }),
    color: "#6366f1",
    enabled: true,
    match_mode: "all",
    conditions: [{ type: "from", operator: "is", value: sender_email }],
    actions: [{ type: "categorize", category }],
  });

  show_toast(
    response.data
      ? t("mail.sender_rule_created", { category: category_label })
      : t("common.something_went_wrong"),
    response.data ? "success" : "error",
  );
}

// Called after a category move has been confirmed by the server.
export function maybe_offer_sender_rule(
  moved: readonly InboxEmail[],
  category: EmailCategory,
  category_label: string,
  t: Translate,
): void {
  const sender_email = sole_sender(moved);

  if (!sender_email) return;

  const key = tally_key(sender_email, category);

  if (offered.has(key)) return;

  const seen = (move_tally.get(key) ?? 0) + 1;

  move_tally.set(key, seen);
  if (seen < REPEAT_THRESHOLD) return;

  offered.add(key);
  show_toast(
    t("mail.sender_rule_offer", {
      sender: sender_email,
      category: category_label,
    }),
    "info",
    8000,
    {
      label: t("mail.sender_rule_confirm"),
      on_click: () => {
        create_sender_rule(sender_email, category, category_label, t).catch(
          (caught) => {
            ignore_error(
              "components/email/inbox/category_sender_rule:create",
              caught,
            );
          },
        );
      },
    },
  );
}
