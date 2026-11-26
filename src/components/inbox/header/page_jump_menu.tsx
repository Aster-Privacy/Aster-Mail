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
import type { ReactNode, KeyboardEvent } from "react";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  HashtagIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import { app_locale } from "@/utils/date_format";

interface PageJumpMenuProps {
  label: ReactNode;
  aria_label: string;
  current_page: number;
  total_pages: number;
  last_page_known: boolean;
  on_jump: (page: number) => void;
}

export function parse_page_input(
  value: string,
  total_pages: number,
): number | null {
  if (!/^\d+$/.test(value)) return null;
  const page_number = Number(value);

  if (page_number < 1 || page_number > total_pages) return null;

  return page_number - 1;
}

const MENU_ITEM_SELECTOR = '[role="menuitem"]:not([data-disabled])';

export function PageJumpMenu({
  label,
  aria_label,
  current_page,
  total_pages,
  last_page_known,
  on_jump,
}: PageJumpMenuProps) {
  const { t } = use_i18n();
  const [open, set_open] = useState(false);
  const [editing, set_editing] = useState(false);
  const [value, set_value] = useState("");
  const [invalid, set_invalid] = useState(false);
  const input_ref = useRef<HTMLInputElement>(null);
  const error_id = useId();
  const page_count = Math.max(total_pages, 1);
  const last_page = page_count - 1;
  const on_first_page = current_page <= 0;
  const on_last_page = current_page >= last_page;

  useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => input_ref.current?.focus());

    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const handle_open_change = (next: boolean) => {
    set_open(next);
    if (!next) {
      set_editing(false);
      set_value("");
      set_invalid(false);
    }
  };

  const jump = (page: number) => {
    handle_open_change(false);
    if (page !== current_page) on_jump(page);
  };

  const submit = () => {
    const page = parse_page_input(value, page_count);

    if (page === null) {
      set_invalid(true);
      input_ref.current?.focus();

      return;
    }
    jump(page);
  };

  const move_focus_to_items = (direction: 1 | -1) => {
    const content = input_ref.current?.closest('[role="menu"]');
    const items = Array.from(
      content?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? [],
    );
    const target = direction === 1 ? items[0] : items[items.length - 1];

    target?.focus();
  };

  const handle_input_key_down = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" || event.key === "Tab") return;
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move_focus_to_items(event.key === "ArrowDown" ? 1 : -1);
    }
  };

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={handle_open_change}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={aria_label}
          className="h-9 min-w-0 px-2 rounded-[10px] tabular-nums text-sm font-normal whitespace-nowrap text-[var(--text-muted)] hover:text-[var(--text-primary)] data-[state=open]:text-[var(--text-primary)] data-[state=open]:bg-[var(--aster-hover)] @max-[420px]/listbar:hidden"
          data-testid="page-jump-trigger"
          size="sm"
          variant="ghost"
        >
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        className="w-56"
        data-testid="page-jump-menu"
      >
        <DropdownMenuLabel className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-[var(--text-muted)] tabular-nums">
          {t("mail.page_of_total", {
            current: (current_page + 1).toLocaleString(app_locale()),
            total: page_count.toLocaleString(app_locale()),
          })}
        </DropdownMenuLabel>
        <DropdownMenuItem
          data-testid="page-jump-newest"
          disabled={on_first_page}
          onSelect={() => jump(0)}
        >
          <ArrowUpIcon />
          {t("mail.page_jump_newest")}
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="page-jump-oldest"
          disabled={on_last_page || !last_page_known}
          onSelect={() => jump(last_page)}
        >
          <ArrowDownIcon />
          {t("mail.page_jump_oldest")}
        </DropdownMenuItem>
        {page_count > 1 && (
          <>
            <DropdownMenuSeparator />
            {editing ? (
              <div className="px-2.5 pt-1 pb-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <label
                    className="flex-1 min-w-0 truncate text-[var(--text-secondary)]"
                    htmlFor={`${error_id}-input`}
                  >
                    {t("mail.page_jump_go_to")}
                  </label>
                  <Input
                    ref={input_ref}
                    aria-describedby={invalid ? error_id : undefined}
                    aria-invalid={invalid || undefined}
                    aria-label={t("mail.page_jump_input")}
                    autoComplete="off"
                    className="w-16 text-center tabular-nums"
                    data-testid="page-jump-input"
                    enterKeyHint="go"
                    id={`${error_id}-input`}
                    inputMode="numeric"
                    maxLength={String(page_count).length}
                    placeholder={String(current_page + 1)}
                    size="sm"
                    status={invalid ? "error" : "default"}
                    value={value}
                    onChange={(event) => {
                      set_value(event.target.value.replace(/\D/g, ""));
                      set_invalid(false);
                    }}
                    onKeyDown={handle_input_key_down}
                  />
                </div>
                {invalid && (
                  <p
                    className="mt-1.5 text-xs text-[var(--color-danger)]"
                    data-testid="page-jump-error"
                    id={error_id}
                    role="alert"
                  >
                    {t("mail.page_jump_invalid", {
                      total: page_count.toLocaleString(app_locale()),
                    })}
                  </p>
                )}
              </div>
            ) : (
              <DropdownMenuItem
                data-testid="page-jump-go-to"
                onSelect={(event) => {
                  event.preventDefault();
                  set_editing(true);
                }}
              >
                <HashtagIcon />
                {t("mail.page_jump_go_to")}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
