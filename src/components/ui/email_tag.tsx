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
import type { TagColorVariant, TagIconName } from "@aster/ui";

import { TAG_ICON_GROUPS as ui_tag_icon_groups } from "@aster/ui";

export {
  EmailTag,
  email_tag_variants,
  tag_icon_map,
  TAG_COLOR_PRESETS,
  TAG_ICONS,
  hex_to_variant,
} from "@aster/ui";
export type {
  EmailTagProps,
  TagIconName,
  TagColorVariant,
  TagVariant,
} from "@aster/ui";

export const TAG_ICON_GROUPS = ui_tag_icon_groups as {
  key: string;
  label_key: TranslationKey;
  icons: TagIconName[];
}[];

export function tag_color_label_key(variant: TagColorVariant): TranslationKey {
  return `common.color_${variant}`;
}

export function tag_icon_label_key(icon: TagIconName): TranslationKey {
  return `common.tag_icon_${icon.replace(/-/g, "_")}` as TranslationKey;
}
