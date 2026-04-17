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
import type { RefObject } from "react";

import { AnimatePresence } from "framer-motion";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { ClearDataMenu } from "@/components/search/search_filters_panel";

export interface SearchInputBarProps {
  input_ref: RefObject<HTMLInputElement>;
  query: string;
  is_loading: boolean;
  is_searching: boolean;
  show_filters: boolean;
  show_clear_menu: boolean;
  has_results: boolean;
  on_search_submit?: (query: string) => void;
  on_input_change: (e: React.ChangeEvent<HTMLInputElement>) => void;
  on_key_down: (e: React.KeyboardEvent) => void;
  on_clear_query: () => void;
  on_toggle_filters: () => void;
  on_show_save_dialog: () => void;
  on_toggle_clear_menu: () => void;
  on_close: () => void;
  on_clear_data: (options: {
    history: boolean;
    saved: boolean;
    cache: boolean;
  }) => void;
}

export function SearchInputBar({
  input_ref,
  query,
  is_loading,
  is_searching,
  show_filters,
  show_clear_menu,
  has_results,
  on_search_submit,
  on_input_change,
  on_key_down,
  on_clear_query,
  on_toggle_filters,
  on_show_save_dialog,
  on_toggle_clear_menu,
  on_close,
  on_clear_data,
}: SearchInputBarProps) {
  const { t } = use_i18n();

  return (
    <div className="p-4 border-b transition-colors duration-200 relative flex-shrink-0 border-edge-secondary">
      <div className="flex items-center gap-3">
        <button
          className="sm:hidden p-1.5 -ml-1 rounded-lg transition-colors text-txt-muted bg-surf-hover"
          onClick={on_close}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
        <div className="relative">
          {is_loading || is_searching ? (
            <Spinner className="text-[var(--accent-color)]" size="md" />
          ) : (
            <svg
              className="w-5 h-5 text-txt-muted"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
          )}
        </div>
        <Input
          ref={input_ref}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="w-full bg-transparent border-none"
          placeholder={t("mail.search_messages")}
          type="text"
          value={query}
          onChange={on_input_change}
          onKeyDown={on_key_down}
        />
        {query && (
          <button
            className="p-1.5 rounded-full transition-all duration-150 hover:scale-110 text-txt-muted bg-surf-hover"
            onClick={on_clear_query}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        )}
        {!on_search_submit && (
          <button
            className="p-1.5 rounded-lg transition-all duration-150"
            style={{
              backgroundColor: show_filters
                ? "var(--accent-color, #3b82f6)"
                : "var(--bg-hover)",
              color: show_filters ? "#ffffff" : "var(--text-muted)",
            }}
            title={t("mail.toggle_filters")}
            onClick={on_toggle_filters}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
            </svg>
          </button>
        )}
        {!on_search_submit && query && has_results && (
          <button
            className="p-1.5 rounded-lg transition-all duration-150 bg-surf-hover text-txt-muted"
            title={t("mail.save_search")}
            onClick={on_show_save_dialog}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z" />
            </svg>
          </button>
        )}
        {!on_search_submit && (
          <div className="relative">
            <button
              className="p-1.5 rounded-lg transition-all duration-150"
              style={{
                backgroundColor: show_clear_menu
                  ? "var(--accent-color, #3b82f6)"
                  : "var(--bg-hover)",
                color: show_clear_menu ? "#ffffff" : "var(--text-muted)",
              }}
              title={t("mail.clear_search_data")}
              onClick={on_toggle_clear_menu}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
              </svg>
            </button>
            <AnimatePresence>
              {show_clear_menu && (
                <ClearDataMenu
                  is_open={show_clear_menu}
                  on_clear={on_clear_data}
                  on_close={() => on_toggle_clear_menu()}
                />
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
