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
import type { ReactNode } from "react";
import type { SenderProfileAvatarRenderer } from "@aster/ui";

import {
  DocumentTextIcon,
  EnvelopeIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { ShieldCheckIcon as ShieldCheckSolid } from "@heroicons/react/24/solid";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";

export const SENDER_CARD_AVATAR_CLASS =
  "ring-1 ring-black/5 dark:ring-white/10 flex-shrink-0";

const INLINE_SPINNER_CLASS =
  "w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0";

export interface SenderProfileCardStrings {
  add_to_contacts: string;
  remove_from_contacts: string;
  notes: string;
  hide_notes: string;
  messages_from: string;
  send_email: string;
  allow_sender: string;
  remove_from_allowlist: string;
  block_sender: string;
  unblock_sender: string;
}

interface SenderCardHeaderProps {
  email: string;
  display_name: string;
  render_avatar: SenderProfileAvatarRenderer;
  name_badge?: ReactNode;
  subtitle?: ReactNode;
}

export function SenderCardHeader({
  email,
  display_name,
  render_avatar,
  name_badge,
  subtitle,
}: SenderCardHeaderProps) {
  return (
    <div
      className="flex items-center gap-3 min-w-0 px-3 pt-3 pb-2.5"
      data-testid="sender_card_header"
    >
      {render_avatar({ size: "md", className: SENDER_CARD_AVATAR_CLASS })}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p
            data-selectable
            className="text-[13px] font-medium truncate text-txt-primary cursor-text"
            data-testid="sender_card_name"
            title={display_name}
          >
            {display_name}
          </p>
          {name_badge}
        </div>
        <p
          data-selectable
          className="text-[12px] truncate text-txt-muted cursor-text"
          data-testid="sender_card_email"
          dir="ltr"
          title={email}
          translate="no"
        >
          {email}
        </p>
        {subtitle}
      </div>
    </div>
  );
}

interface SenderProfileCardProps {
  email: string;
  display_name: string;
  is_aster_user: boolean;
  render_avatar: SenderProfileAvatarRenderer;
  copy_row: ReactNode;
  is_contact: boolean;
  is_contact_loading: boolean;
  contact_disabled: boolean;
  on_contact_action: () => void;
  on_messages_from: () => void;
  on_compose?: () => void;
  is_allowlisted: boolean;
  is_allowlist_loading: boolean;
  allowlist_disabled: boolean;
  on_allowlist_action: () => void;
  is_blocked: boolean;
  is_blocking: boolean;
  on_block_action: () => void;
  notes?: ReactNode;
  show_notes: boolean;
  on_toggle_notes: () => void;
  is_open: boolean;
  on_open_change: (open: boolean) => void;
  on_trigger_intent?: () => void;
  trigger_className?: string;
  strings: SenderProfileCardStrings;
  children: ReactNode;
}

export function SenderProfileCard({
  email,
  display_name,
  is_aster_user,
  render_avatar,
  copy_row,
  is_contact,
  is_contact_loading,
  contact_disabled,
  on_contact_action,
  on_messages_from,
  on_compose,
  is_allowlisted,
  is_allowlist_loading,
  allowlist_disabled,
  on_allowlist_action,
  is_blocked,
  is_blocking,
  on_block_action,
  notes,
  show_notes,
  on_toggle_notes,
  is_open,
  on_open_change,
  on_trigger_intent,
  trigger_className,
  strings,
  children,
}: SenderProfileCardProps) {
  return (
    <DropdownMenu open={is_open} onOpenChange={on_open_change}>
      <DropdownMenuTrigger
        asChild
        onFocus={on_trigger_intent}
        onPointerDown={on_trigger_intent}
        onPointerEnter={on_trigger_intent}
      >
        <button
          className={`outline-none${trigger_className ? ` ${trigger_className}` : ""}`}
          type="button"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72 p-0 overflow-hidden"
        data-testid="sender_profile_card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-edge-secondary">
          <SenderCardHeader
            display_name={display_name}
            email={email}
            render_avatar={render_avatar}
          />
        </div>
        <div className="p-1">
          {copy_row}
          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            data-testid="sender_card_contact"
            disabled={contact_disabled}
            onSelect={(e) => {
              e.preventDefault();
              on_contact_action();
            }}
          >
            {is_contact ? (
              <UserMinusIcon className="w-4 h-4 flex-shrink-0" />
            ) : (
              <UserPlusIcon className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="flex-1">
              {is_contact
                ? strings.remove_from_contacts
                : strings.add_to_contacts}
            </span>
            {is_contact_loading && <div className={INLINE_SPINNER_CLASS} />}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            data-testid="sender_card_notes"
            onSelect={(e) => {
              e.preventDefault();
              on_toggle_notes();
            }}
          >
            <DocumentTextIcon className="w-4 h-4 flex-shrink-0" />
            <span>{show_notes ? strings.hide_notes : strings.notes}</span>
          </DropdownMenuItem>
          {show_notes && notes && (
            <div
              className="mx-1 my-1 rounded-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {notes}
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            data-testid="sender_card_messages_from"
            onSelect={on_messages_from}
          >
            <EnvelopeIcon className="w-4 h-4 flex-shrink-0" />
            <span>{strings.messages_from}</span>
          </DropdownMenuItem>
          {on_compose && (
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              data-testid="sender_card_compose"
              onSelect={on_compose}
            >
              <EnvelopeIcon className="w-4 h-4 flex-shrink-0" />
              <span>{strings.send_email}</span>
            </DropdownMenuItem>
          )}
          {!is_aster_user && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 cursor-pointer"
                data-testid="sender_card_allowlist"
                disabled={allowlist_disabled}
                onSelect={(e) => {
                  e.preventDefault();
                  on_allowlist_action();
                }}
              >
                {is_allowlisted ? (
                  <ShieldCheckSolid className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                ) : (
                  <ShieldCheckIcon className="w-4 h-4 flex-shrink-0" />
                )}
                <span
                  className={`flex-1 ${is_allowlisted ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                >
                  {is_allowlisted
                    ? strings.remove_from_allowlist
                    : strings.allow_sender}
                </span>
                {is_allowlist_loading && (
                  <div className={INLINE_SPINNER_CLASS} />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={`gap-2 cursor-pointer ${is_blocked ? "" : "text-red-500 focus:text-red-500 focus:bg-red-500/10"}`}
                data-testid="sender_card_block"
                disabled={is_blocking}
                onSelect={(e) => {
                  e.preventDefault();
                  on_block_action();
                }}
              >
                <NoSymbolIcon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">
                  {is_blocked ? strings.unblock_sender : strings.block_sender}
                </span>
                {is_blocking && (
                  <div
                    className={`w-3 h-3 border-2 ${is_blocked ? "border-blue-500" : "border-red-500"} border-t-transparent rounded-full animate-spin flex-shrink-0`}
                  />
                )}
              </DropdownMenuItem>
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
