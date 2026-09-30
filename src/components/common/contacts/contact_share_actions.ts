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
import type { DecryptedContact } from "@/types/contacts";
import type { TranslationKey } from "@/lib/i18n";

import { show_toast } from "@/components/toast/simple_toast";
import { copy_text } from "@/utils/copy_text";
import {
  share_contact_text,
  share_contact_vcard,
} from "@/utils/contact_export";

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export async function run_share_contact_text(
  t: Translate,
  contact: DecryptedContact,
): Promise<void> {
  const result = await share_contact_text(contact, copy_text);

  if (result === "copied") {
    show_toast(t("common.copied_to_clipboard"), "success");
  } else if (result === "failed") {
    show_toast(t("common.something_went_wrong_try_again"), "error");
  }
}

export async function run_share_contact_vcard(
  contact: DecryptedContact,
  group_names: Record<string, string> = {},
): Promise<void> {
  await share_contact_vcard(contact, group_names);
}
