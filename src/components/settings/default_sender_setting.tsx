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
import { useEffect, useMemo, useState } from "react";

import { SelectSetting } from "@/components/settings/behavior_section/shared";
import { use_sender_aliases } from "@/hooks/use_sender_aliases";
import {
  get_preferred_sender_id,
  sender_id_matches,
  set_preferred_sender_id,
  subscribe_preferred_sender,
} from "@/lib/preferred_sender";
import { use_i18n } from "@/lib/i18n/context";

const PRIMARY_ID = "primary";

export function DefaultSenderSetting() {
  const { t } = use_i18n();
  const { sender_options, loading } = use_sender_aliases();
  const [preferred_id, set_preferred_id] = useState<string | null>(() =>
    get_preferred_sender_id(),
  );

  useEffect(() => subscribe_preferred_sender(set_preferred_id), []);

  const options = useMemo(
    () =>
      sender_options.filter(
        (option) => option.is_enabled && option.type !== "ghost",
      ),
    [sender_options],
  );

  const selected = useMemo(() => {
    if (!preferred_id) return PRIMARY_ID;
    const match = options.find((option) =>
      sender_id_matches(option.id, preferred_id),
    );

    return match?.id ?? PRIMARY_ID;
  }, [options, preferred_id]);

  const has_choices = options.length > 1;

  return (
    <SelectSetting
      description={t("settings.default_sender_description")}
      disabled={loading || !has_choices}
      disabled_note={
        !loading && !has_choices
          ? t("settings.default_sender_no_addresses")
          : undefined
      }
      on_change={(value) => {
        set_preferred_id(value);
        set_preferred_sender_id(value);
      }}
      options={options.map((option) => ({
        value: option.id,
        label: option.email,
      }))}
      title={t("settings.default_sender_title")}
      value={selected}
    />
  );
}
