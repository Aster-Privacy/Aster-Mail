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

import { useRef, useState } from "react";
import {
  GlobeAltIcon,
  LinkIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import {
  MAX_ALIAS_WEBSITES,
  MAX_WEBSITE_URL_LENGTH,
  validate_website_input,
} from "@/services/api/aliases";

function display_website(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function open_website(url: string) {
  window.dispatchEvent(
    new CustomEvent("aster-external-link", { detail: { url } }),
  );
}

interface AliasWebsitesEditorProps {
  alias_address: string;
  websites?: string[];
  on_save: (next_websites: string[]) => Promise<{ error?: unknown }>;
  on_saved: (next_websites: string[]) => void;
  variant?: "desktop" | "mobile";
  hide_icon?: boolean;
}

export function AliasWebsitesEditor({
  alias_address,
  websites,
  on_save,
  on_saved,
  variant = "desktop",
  hide_icon = false,
}: AliasWebsitesEditorProps) {
  const { t } = use_i18n();
  const [is_adding, set_is_adding] = useState(false);
  const [draft, set_draft] = useState("");
  const [saving, set_saving] = useState(false);
  const input_ref = useRef<HTMLInputElement | null>(null);
  const commit_lock = useRef(false);

  const current = websites ?? [];
  const is_mobile = variant === "mobile";

  const persist = async (next_websites: string[]) => {
    set_saving(true);
    let saved = false;

    try {
      const response = await on_save(next_websites);

      if (response.error) {
        show_toast(t("common.failed_update_alias_websites"), "error");
      } else {
        saved = true;
        on_saved(next_websites);
        show_toast(t("common.alias_websites_updated"), "success");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("common.failed_update_alias_websites"), "error");
    } finally {
      set_saving(false);
    }

    return saved;
  };

  const commit_add = async () => {
    if (commit_lock.current || saving) return;
    commit_lock.current = true;

    const trimmed = (input_ref.current?.value ?? draft).trim();

    if (trimmed !== draft) set_draft(trimmed);

    if (!trimmed) {
      commit_lock.current = false;
      set_is_adding(false);

      return;
    }

    const normalized = validate_website_input(trimmed);

    if (!normalized) {
      show_toast(t("common.alias_website_invalid"), "error");
      commit_lock.current = false;
      input_ref.current?.focus();

      return;
    }

    if (current.includes(normalized)) {
      set_draft("");
      commit_lock.current = false;
      set_is_adding(false);

      return;
    }

    if (current.length >= MAX_ALIAS_WEBSITES) {
      show_toast(t("common.alias_websites_limit_reached"), "error");
      commit_lock.current = false;

      return;
    }

    const saved = await persist([...current, normalized]);

    if (saved) {
      set_draft("");
      set_is_adding(false);
    } else {
      input_ref.current?.focus();
    }
    commit_lock.current = false;
  };

  const remove_website = async (url: string) => {
    if (saving) return;
    await persist(current.filter((entry) => entry !== url));
  };

  const handle_key_down = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit_add();
    } else if (event.key === "Escape") {
      event.preventDefault();
      set_draft("");
      set_is_adding(false);
    }
  };

  const chip_class = is_mobile
    ? "inline-flex items-center gap-1 max-w-full rounded-full border border-edge-secondary bg-[var(--mobile-bg-secondary,transparent)] px-2 py-0.5 text-[12px] text-[var(--mobile-text-muted)]"
    : "inline-flex items-center gap-1 max-w-full rounded-full border border-edge-secondary bg-surf-secondary px-2 py-0.5 text-xs text-txt-muted";

  const add_button_class = is_mobile
    ? "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] text-[var(--mobile-text-muted)] opacity-70 hover:opacity-100"
    : "inline-flex items-center gap-1 rounded-full border border-dashed border-edge-primary px-2 py-0.5 text-xs text-txt-muted transition-colors hover:border-edge-secondary hover:text-txt-secondary";

  const empty_add_class = is_mobile
    ? "mt-1 flex w-full min-w-0 cursor-pointer items-center gap-1.5 text-left text-[13px] leading-5 text-[var(--mobile-text-muted)] opacity-70 hover:opacity-100 focus:outline-none focus:ring-0"
    : "flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[12px] border border-dashed border-edge-primary px-3 text-left text-[13px] text-txt-muted transition-colors hover:border-edge-secondary hover:text-txt-secondary focus:outline-none focus:ring-0";

  if (current.length === 0 && !is_adding) {
    return (
      <button
        aria-label={`${t("common.add_alias_website")} ${alias_address}`}
        className={empty_add_class}
        disabled={saving}
        type="button"
        onClick={() => set_is_adding(true)}
      >
        {is_mobile ? (
          !hide_icon && <LinkIcon className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <PlusIcon className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate">
          {t("common.add_alias_website_placeholder")}
        </span>
      </button>
    );
  }

  return (
    <div
      className={`mt-1 flex flex-wrap items-center gap-1.5 ${is_mobile ? "" : "justify-end"}`}
    >
      {current.map((url) => (
        <span key={url} className={chip_class}>
          <GlobeAltIcon className="h-3 w-3 flex-shrink-0" />
          <a
            className="max-w-[180px] truncate hover:underline"
            href={url}
            rel="noopener noreferrer"
            target="_blank"
            title={url}
            onClick={(event) => {
              event.preventDefault();
              open_website(url);
            }}
          >
            {display_website(url)}
          </a>
          <button
            aria-label={`${t("common.remove_alias_website")} ${display_website(url)}`}
            className="flex-shrink-0 opacity-60 hover:opacity-100"
            disabled={saving}
            type="button"
            onClick={() => remove_website(url)}
          >
            <XMarkIcon className="h-3 w-3" />
          </button>
        </span>
      ))}

      {is_adding ? (
        is_mobile ? (
          <span className="inline-flex items-center gap-1">
            <input
              ref={input_ref}
              autoFocus
              aria-label={`${t("common.add_alias_website")} ${alias_address}`}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className="w-44 bg-transparent text-[12px] text-[var(--mobile-text-muted)] outline-none ring-0 border-b border-edge-primary placeholder:opacity-50 focus:outline-none focus:ring-0"
              disabled={saving}
              inputMode="url"
              maxLength={MAX_WEBSITE_URL_LENGTH}
              placeholder={t("common.add_alias_website_placeholder")}
              spellCheck={false}
              value={draft}
              onBlur={commit_add}
              onChange={(event) => set_draft(event.target.value)}
              onKeyDown={handle_key_down}
            />
            {saving ? (
              <Spinner className="text-txt-muted" size="xs" />
            ) : (
              <button
                aria-label={t("common.add_alias_website")}
                className="opacity-60 hover:opacity-100"
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit_add();
                }}
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ) : (
          <div className="relative w-full min-w-0">
            <Input
              ref={input_ref}
              autoFocus
              aria-label={`${t("common.add_alias_website")} ${alias_address}`}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className="w-full pr-8"
              disabled={saving}
              inputMode="url"
              maxLength={MAX_WEBSITE_URL_LENGTH}
              placeholder={t("common.add_alias_website_placeholder")}
              size="md"
              spellCheck={false}
              value={draft}
              onBlur={commit_add}
              onChange={(event) => set_draft(event.target.value)}
              onKeyDown={handle_key_down}
            />
            {saving && (
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                <Spinner className="text-txt-muted" size="xs" />
              </span>
            )}
          </div>
        )
      ) : (
        current.length < MAX_ALIAS_WEBSITES && (
          <button
            aria-label={`${t("common.add_alias_website")} ${alias_address}`}
            className={add_button_class}
            disabled={saving}
            type="button"
            onClick={() => set_is_adding(true)}
          >
            <PlusIcon className="h-3 w-3" />
            {t("common.add_alias_website")}
          </button>
        )
      )}
    </div>
  );
}
