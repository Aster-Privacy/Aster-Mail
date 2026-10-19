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
import { show_action_toast } from "@/components/toast/action_toast";
import { play_send_settled_sound } from "@/services/iconic_sounds";

export function play_email_sent_sound(): void {
  play_send_settled_sound();
}

export function show_email_sent_toast(
  message: string,
  undo_toast_shown = false,
): void {
  play_send_settled_sound();
  if (undo_toast_shown) return;
  show_action_toast({
    message,
    action_type: "read",
    sound: "none",
    email_ids: [],
    duration_ms: 5000,
  });
}
