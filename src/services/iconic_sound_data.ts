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
import type { IconicSound } from "@/services/iconic_sounds";

import compose from "@/assets/sounds/compose.mp3?inline";
import done from "@/assets/sounds/done.mp3?inline";
import fail from "@/assets/sounds/fail.mp3?inline";
import incoming from "@/assets/sounds/incoming.mp3?inline";
import send from "@/assets/sounds/send.mp3?inline";
import undo_send from "@/assets/sounds/undo_send.mp3?inline";
import upload from "@/assets/sounds/upload.mp3?inline";

export const ICONIC_SOUND_SOURCES: Record<IconicSound, string> = {
  send,
  undo_send,
  incoming,
  done,
  fail,
  compose,
  upload,
};
