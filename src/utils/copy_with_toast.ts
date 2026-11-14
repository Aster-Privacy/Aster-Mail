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
import { copy_text_or_throw } from "@/utils/copy_text";
import { show_toast } from "@/components/toast/simple_toast";

export function copy_with_toast(
  value: string,
  success_message: string,
  failure_message: string,
): void {
  copy_text_or_throw(value)
    .then(() => show_toast(success_message, "success"))
    .catch(() => show_toast(failure_message, "error"));
}
