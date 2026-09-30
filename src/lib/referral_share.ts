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
import { record_referral_share } from "@/services/api/billing";
import { copy_text } from "@/utils/copy_text";
import { ignore_error } from "@/lib/ignore_error";

export type ShareOutcome = "shared" | "copied" | "failed";

export function can_use_share_sheet(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

function count_share(): void {
  void record_referral_share().catch((caught) =>
    ignore_error("lib/referral_share:count_share", caught),
  );
}

export async function share_invite(
  title: string,
  message: string,
  url: string,
): Promise<ShareOutcome> {
  if (can_use_share_sheet()) {
    try {
      await navigator.share({ title, text: message, url });
      count_share();

      return "shared";
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return "failed";
      }

      ignore_error("lib/referral_share:share_invite", caught);
    }
  }

  if (await copy_text(`${message}\n${url}`)) {
    count_share();

    return "copied";
  }

  return "failed";
}

export async function copy_invite_link(url: string): Promise<boolean> {
  const copied = await copy_text(url);

  if (copied) count_share();

  return copied;
}
