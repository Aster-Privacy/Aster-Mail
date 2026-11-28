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
import { open_external } from "@/utils/open_link";
import { CALENDAR_WEB_ORIGIN } from "@/lib/session_handoff/session_handoff_protocol";
import { sibling_app_launch_url } from "@/contexts/auth/sibling_session_handoff";

export function open_calendar_externally(): void {
  open_external(sibling_app_launch_url(CALENDAR_WEB_ORIGIN));
}
