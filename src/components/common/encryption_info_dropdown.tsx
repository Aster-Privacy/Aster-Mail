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
import type { SenderVerificationStatus } from "@/types/email";

import { useState, useCallback } from "react";
import { EncryptionInfoDropdownView } from "@aster/ui";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { use_should_reduce_motion } from "@/provider";

interface EncryptionInfoDropdownProps {
  is_external: boolean;
  has_pq_protection: boolean;
  has_recipient_key?: boolean;
  e2e_verified?: boolean;
  size?: number;
  label?: string;
  context?: "message" | "attachments";
  description_key?: import("@/lib/i18n").TranslationKey;
  sender_verification?: SenderVerificationStatus;
}

export function EncryptionInfoDropdown({
  is_external,
  has_pq_protection,
  has_recipient_key = false,
  e2e_verified = false,
  size = 18,
  label,
  context = "message",
  description_key,
  sender_verification,
}: EncryptionInfoDropdownProps) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const reduce_motion = use_should_reduce_motion();
  const [is_open, set_is_open] = useState(false);
  const close_dropdown = useCallback(() => set_is_open(false), []);

  use_escape_layer(is_open, close_dropdown, "encryption_info_dropdown");

  if (preferences.show_encryption_indicators === false) {
    return null;
  }

  const is_encrypted = (!is_external || has_recipient_key) && e2e_verified;

  const description = description_key
    ? t(description_key)
    : context === "attachments"
      ? is_encrypted
        ? t("common.files_end_to_end_encrypted")
        : t("common.files_protected_in_transit")
      : is_encrypted
        ? is_external
          ? t("common.wkd_encrypted_description")
          : t("common.only_you_and_sender")
        : t("common.encrypted_in_transit_stored");

  const sender_title =
    sender_verification === "verified"
      ? t("common.sender_verified")
      : sender_verification === "invalid"
        ? t("common.sender_invalid")
        : sender_verification === "no_keys"
          ? t("common.sender_no_keys")
          : sender_verification === "unsigned"
            ? t("common.sender_unsigned")
            : undefined;

  const sender_description =
    sender_verification === "verified"
      ? t("common.sender_verified_desc")
      : sender_verification === "invalid"
        ? t("common.sender_invalid_desc")
        : sender_verification === "no_keys"
          ? t("common.sender_no_keys_desc")
          : sender_verification === "unsigned"
            ? t("common.sender_unsigned_desc")
            : undefined;

  return (
    <EncryptionInfoDropdownView
      description={description}
      has_pq_protection={has_pq_protection && is_encrypted}
      heading={
        is_encrypted
          ? t("common.end_to_end_encrypted_label")
          : t("common.protected_in_transit")
      }
      is_encrypted={is_encrypted}
      is_open={is_open}
      label={label}
      reduce_motion={reduce_motion}
      sender_description={sender_description}
      sender_invalid_short_label={t("common.sender_invalid_short")}
      sender_title={sender_title}
      sender_verification={sender_verification}
      size={size}
      on_open_change={set_is_open}
    />
  );
}
