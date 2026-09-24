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

import { EmojiPicker as SharedEmojiPicker } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  recent: "common.emoji_recent",
  smileys: "common.emoji_smileys",
  gestures: "common.emoji_gestures",
  animals: "common.emoji_animals",
  food: "common.emoji_food",
  travel: "common.emoji_travel",
  objects: "common.emoji_objects",
  symbols: "common.emoji_symbols",
  activities: "common.emoji_activities",
  flags: "common.emoji_flags",
};

interface EmojiPickerProps {
  on_select: (emoji: string) => void;
}

export function use_emoji_picker_labels() {
  const { t } = use_i18n();

  return {
    search: t("common.search_emojis"),
    skin_tone: t("common.skin_tone"),
    no_results: t("common.no_emojis_found"),
    clear: t("common.clear"),
    categories: Object.fromEntries(
      Object.entries(CATEGORY_LABEL_KEYS).map(([key, label_key]) => [
        key,
        t(label_key),
      ]),
    ),
  };
}

export default function EmojiPicker({ on_select }: EmojiPickerProps) {
  const labels = use_emoji_picker_labels();
  const reduce_motion = use_should_reduce_motion();

  return (
    <SharedEmojiPicker
      labels={labels}
      reduce_motion={reduce_motion}
      on_select={on_select}
    />
  );
}
