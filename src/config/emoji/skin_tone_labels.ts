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
import type { SkinTone } from "./skin_tones";
import type { TranslationKey } from "@/lib/i18n/types";

export const skin_tone_label_keys: Record<SkinTone, TranslationKey> = {
  default: "common.skin_tone_default",
  light: "common.skin_tone_light",
  medium_light: "common.skin_tone_medium_light",
  medium: "common.skin_tone_medium",
  medium_dark: "common.skin_tone_medium_dark",
  dark: "common.skin_tone_dark",
};
