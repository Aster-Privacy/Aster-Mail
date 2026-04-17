//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { XMarkIcon } from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Input } from "@/components/ui/input";

export function MobileRecipientRow({
  label,
  recipients,
  input_value,
  is_expanded,
  contact_avatar_map,
  on_remove,
  on_input_change,
  on_key_down,
  on_blur,
  on_expand,
  placeholder,
}: {
  label: string;
  recipients: string[];
  input_value: string;
  is_expanded: boolean;
  contact_avatar_map: Map<string, string>;
  on_remove: (email: string) => void;
  on_input_change: (value: string) => void;
  on_key_down: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  on_blur: () => void;
  on_expand: () => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] leading-none text-[var(--text-muted)]">
        {label}:
      </span>
      {recipients.length <= 1 || is_expanded ? (
        <div
          className={`flex min-w-0 flex-1 items-center gap-1 ${is_expanded && recipients.length > 1 ? "flex-wrap" : "overflow-hidden"}`}
        >
          {recipients.map((email) => (
            <span
              key={email}
              className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--bg-tertiary)] pl-0.5 pr-2 py-0.5 text-[13px] text-[var(--text-primary)]"
            >
              <ProfileAvatar
                use_domain_logo
                email={email}
                image_url={contact_avatar_map.get(email.toLowerCase())}
                name=""
                size="xs"
              />
              <span className="max-w-[140px] truncate">{email}</span>
              <button
                className="text-[var(--text-muted)]"
                type="button"
                onClick={() => on_remove(email)}
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
          <Input
            className="min-w-[40px] flex-1 bg-transparent"
            placeholder={recipients.length === 0 ? placeholder || "" : ""}
            type="email"
            value={input_value}
            onBlur={on_blur}
            onChange={(e) => on_input_change(e.target.value)}
            onKeyDown={on_key_down}
          />
        </div>
      ) : (
        <div
          className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
          onClick={on_expand}
        >
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--bg-tertiary)] pl-0.5 pr-2 py-0.5 text-[13px] text-[var(--text-primary)]">
            <ProfileAvatar
              use_domain_logo
              email={recipients[0]}
              image_url={contact_avatar_map.get(recipients[0].toLowerCase())}
              name=""
              size="xs"
            />
            <span className="max-w-[140px] truncate">{recipients[0]}</span>
          </span>
          <span className="shrink-0 text-[13px] font-medium text-[var(--accent-color,#3b82f6)]">
            +{recipients.length - 1} more
          </span>
        </div>
      )}
    </div>
  );
}
