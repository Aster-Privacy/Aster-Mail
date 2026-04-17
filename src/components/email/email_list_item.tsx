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
import type { Email } from "@/types/email";

import { ProfileAvatar } from "@/components/ui/profile_avatar";

export function EmailListItem({
  email,
  is_selected,
  on_click,
}: {
  email: Email;
  is_selected: boolean;
  on_click: () => void;
}) {
  const is_unread = !email.is_read;

  return (
    <button
      className={`w-full px-6 py-4 border-b border-edge-secondary text-left cursor-pointer ${
        is_selected ? "bg-surf-tertiary" : ""
      }`}
      onClick={on_click}
    >
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <ProfileAvatar
            use_domain_logo
            email={email.sender.email}
            name={email.sender.name}
            size="md"
          />
        </div>
        <p
          className={`shrink-0 max-w-[140px] truncate text-sm ${
            is_unread
              ? "text-txt-primary font-semibold"
              : "text-txt-secondary font-medium"
          }`}
        >
          {email.sender.name}
        </p>
        <p
          className={`flex-1 min-w-0 truncate text-sm ${
            is_unread
              ? "text-txt-primary font-medium"
              : "text-txt-tertiary font-normal"
          }`}
        >
          {email.subject}
        </p>
        <span className="text-xs whitespace-nowrap text-txt-muted shrink-0">
          {email.timestamp}
        </span>
        {is_unread && (
          <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 shadow-md" />
        )}
      </div>
    </button>
  );
}
