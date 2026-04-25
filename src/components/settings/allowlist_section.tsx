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
import { useState, useEffect, useCallback } from "react";
import {
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import { Checkbox, Radio } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_shift_range_select } from "@/lib/use_shift_range_select";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  list_allowed_senders,
  remove_allowed_sender_by_token,
  bulk_remove_allowed_senders_by_tokens,
  allow_sender,
  type DecryptedAllowedSender,
} from "@/services/api/allowed_senders";
import { show_toast } from "@/components/toast/simple_toast";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";

export function AllowlistSection() {
  const { t } = use_i18n();
  const [allowed_senders, set_allowed_senders] = useState<
    DecryptedAllowedSender[]
  >([]);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [is_loading, set_is_loading] = useState(true);
  const [is_removing, set_is_removing] = useState(false);
  const [search_query, set_search_query] = useState("");
  const [show_add_form, set_show_add_form] = useState(false);
  const [new_value, set_new_value] = useState("");
  const [is_domain, set_is_domain] = useState(false);
  const [is_adding, set_is_adding] = useState(false);
  const [form_visible, set_form_visible] = useState(false);

  const open_add_form = () => {
    set_show_add_form(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        set_form_visible(true);
      });
    });
  };

  const close_add_form = () => {
    set_form_visible(false);
    setTimeout(() => {
      set_show_add_form(false);
      set_new_value("");
      set_is_domain(false);
    }, 200);
  };

  const fetch_allowed_senders = useCallback(async () => {
    try {
      const result = await list_allowed_senders();

      if (result.data) {
        set_allowed_senders(result.data);
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    fetch_allowed_senders();
  }, [fetch_allowed_senders]);

  const filtered_senders = allowed_senders.filter((sender) => {
    if (!search_query) return true;
    const query = search_query.toLowerCase();

    return (
      sender.email.toLowerCase().includes(query) ||
      sender.name?.toLowerCase().includes(query)
    );
  });

  const handle_select = use_shift_range_select(
    filtered_senders,
    (sender) => sender.id,
    selected_ids,
    set_selected_ids,
  );

  const handle_select_all = () => {
    if (selected_ids.size === filtered_senders.length) {
      set_selected_ids(new Set());
    } else {
      set_selected_ids(new Set(filtered_senders.map((s) => s.id)));
    }
  };

  const handle_remove = async (sender: DecryptedAllowedSender) => {
    set_allowed_senders((prev) => prev.filter((s) => s.id !== sender.id));
    show_toast(
      t("common.removed_from_allowlist", { email: sender.email }),
      "success",
    );

    const result = await remove_allowed_sender_by_token(sender.sender_token);

    if (!result.data?.success) {
      set_allowed_senders((prev) => [...prev, sender]);
    }
  };

  const handle_bulk_remove = async () => {
    if (selected_ids.size === 0) return;

    set_is_removing(true);
    try {
      const tokens = allowed_senders
        .filter((s) => selected_ids.has(s.id))
        .map((s) => s.sender_token);
      const result = await bulk_remove_allowed_senders_by_tokens(tokens);

      if (result.data?.success) {
        set_allowed_senders((prev) =>
          prev.filter((s) => !selected_ids.has(s.id)),
        );
        show_toast(
          t("common.removed_count_from_allowlist", {
            count: String(result.data.removed_count),
          }),
          "success",
        );
        set_selected_ids(new Set());
      }
    } finally {
      set_is_removing(false);
    }
  };

  const handle_add_allowed = async () => {
    if (!new_value.trim()) return;

    let value = new_value.trim();

    if (is_domain) {
      value = value.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    }

    if (value.length > 254) {
      show_toast(t("common.value_too_long"), "error");

      return;
    }

    if (is_domain) {
      const domain_regex =
        /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

      if (!domain_regex.test(value) || value.length > 253) {
        show_toast(t("common.please_enter_valid_domain"), "error");

        return;
      }
    } else {
      const email_regex =
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

      if (!email_regex.test(value)) {
        show_toast(t("common.please_enter_valid_email"), "error");

        return;
      }

      const split_parts = value.split("@");
      const local_part = split_parts[0];

      if (!local_part || local_part.length > 64) {
        show_toast(t("common.email_local_part_too_long"), "error");

        return;
      }
    }

    set_is_adding(true);
    try {
      const result = await allow_sender(value, undefined, is_domain);

      if (result.data) {
        set_allowed_senders((prev) => {
          const filtered = prev.filter((s) => s.id !== result.data!.id);

          return [result.data!, ...filtered];
        });
        show_toast(
          t("common.added_to_allowlist", { email: result.data.email }),
          "success",
        );
        close_add_form();
      } else if (result.error) {
        show_toast(result.error, "error");
      }
    } finally {
      set_is_adding(false);
    }
  };

  const format_date = (date_string: string) => {
    const date = new Date(date_string);

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (is_loading) {
    return <SettingsSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-txt-primary">
            {t("settings.allowlist_title")}
          </h3>
          <Button
            className="gap-2"
            size="md"
            onClick={() => (show_add_form ? close_add_form() : open_add_form())}
          >
            <PlusIcon className="w-4 h-4" />
            {t("common.add")}
          </Button>
        </div>
        <div className="mt-2 h-px bg-edge-secondary" />
        <p className="text-sm mt-3 text-txt-muted">
          {t("settings.allowlist_description")}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-muted" />
          <Input
            className="!pl-9"
            placeholder={t("common.search_allowlist")}
            size="md"
            value={search_query}
            onChange={(e) => set_search_query(e.target.value)}
          />
        </div>
        {selected_ids.size > 0 && (
          <Button
            className="gap-2"
            disabled={is_removing}
            size="md"
            variant="destructive"
            onClick={handle_bulk_remove}
          >
            {is_removing ? (
              <Spinner size="md" />
            ) : (
              <TrashIcon className="w-4 h-4" />
            )}
            {t("settings.remove_count", { count: String(selected_ids.size) })}
          </Button>
        )}
      </div>

      {show_add_form && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ opacity: form_visible ? 1 : 0, transition: "opacity 200ms" }}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
            onClick={close_add_form}
          />
          <div
            className="relative w-full max-w-md mx-4 rounded-xl border p-6 shadow-xl transition-all duration-200 bg-modal-bg border-edge-primary"
            style={{
              transform: form_visible
                ? "scale(1) translateY(0)"
                : "scale(0.97) translateY(4px)",
              opacity: form_visible ? 1 : 0,
            }}
          >
            <h4 className="text-[15px] font-semibold mb-2 text-txt-primary">
              {t("settings.add_to_allowlist")}
            </h4>
            <p className="text-[13px] mb-4 text-txt-muted">
              {t("settings.allowlist_popup_description")}
            </p>
            <div className="flex items-center gap-4 mb-4">
              <Radio
                checked={!is_domain}
                label={t("settings.email_address")}
                name="allowlist_type"
                onChange={() => set_is_domain(false)}
              />
              <Radio
                checked={is_domain}
                label={t("settings.entire_domain")}
                name="allowlist_type"
                onChange={() => set_is_domain(true)}
              />
            </div>
            <Input
              className="w-full mb-4"
              placeholder={
                is_domain
                  ? t("settings.enter_domain_placeholder")
                  : t("settings.enter_email_placeholder")
              }
              type={is_domain ? "text" : "email"}
              value={new_value}
              onChange={(e) => set_new_value(e.target.value)}
              onKeyDown={(e) => {
                if (e["key"] === "Enter") {
                  handle_add_allowed();
                }
              }}
            />
            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={close_add_form}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={is_adding || !new_value.trim()}
                onClick={handle_add_allowed}
              >
                {is_adding ? <Spinner size="md" /> : t("common.add")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {allowed_senders.length === 0 ? (
        <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
          <CheckCircleIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
          <p className="text-sm text-txt-muted">
            {t("settings.no_allowed_senders")}
          </p>
        </div>
      ) : filtered_senders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg border bg-surf-tertiary border-edge-secondary">
          <p className="text-[14px] font-medium text-txt-primary">
            {t("common.no_results")}
          </p>
          <p className="text-[13px] mt-1 text-txt-muted">
            {t("settings.try_different_search")}
          </p>
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden border border-edge-secondary">
          <div className="flex items-center px-4 py-2 border-b border-edge-secondary">
            <Checkbox
              checked={selected_ids.size === filtered_senders.length}
              onCheckedChange={handle_select_all}
            />
            <span className="ml-3 text-xs font-medium text-txt-muted">
              {t("settings.allowed_senders_count", {
                count: String(filtered_senders.length),
              })}
            </span>
          </div>
          {filtered_senders.map((sender, index) => (
            <div
              key={sender.id}
              className="flex items-center gap-3 px-4 py-3"
              style={{
                borderTop:
                  index > 0 ? "1px solid var(--border-secondary)" : "none",
              }}
            >
              <Checkbox
                checked={selected_ids.has(sender.id)}
                onCheckedChange={() => handle_select(index)}
              />

              {sender.is_domain ? (
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                  <GlobeAltIcon className="w-5 h-5 text-txt-muted" />
                </div>
              ) : (
                <ProfileAvatar
                  use_domain_logo
                  className="flex-shrink-0"
                  email={sender.email}
                  name={sender.name || sender.email}
                  size="md"
                />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate text-txt-primary">
                    {sender.is_domain ? `*.${sender.email}` : sender.email}
                  </span>
                  {sender.is_domain && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: "var(--accent-blue-muted)",
                        color: "var(--accent-blue)",
                      }}
                    >
                      {t("settings.entire_domain")}
                    </span>
                  )}
                </div>
                {sender.name && !sender.is_domain && (
                  <p className="text-[12px] truncate text-txt-muted">
                    {sender.name}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <span className="text-[11px] text-txt-muted">
                  {t("settings.added_on_date", {
                    date: format_date(sender.allowed_at),
                  })}
                </span>
                <Button
                  size="md"
                  variant="destructive"
                  onClick={() => handle_remove(sender)}
                >
                  {t("common.remove")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
