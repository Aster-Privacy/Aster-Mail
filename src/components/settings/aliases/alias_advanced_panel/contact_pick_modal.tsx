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
import type { DecryptedContact } from "@/types/contacts";
import type { TranslationKey } from "@/lib/i18n/types";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MagnifyingGlassIcon, UsersIcon } from "@heroicons/react/24/outline";
import { Button, Checkbox, IslandEmpty } from "@aster/ui";

import {
  MAX_CONTACT_PICK,
  add_senders_in_batches,
  select_all_saturated,
  build_pick_candidates,
  clear_visible,
  collect_pick_addresses,
  filter_pick_candidates,
  finalize_picks,
  has_available_email,
  resolve_existing_statuses,
  select_all_visible,
  toggle_pick,
  type ExistingPin,
  type PickCandidate,
  type PickEmail,
  type PickEmailStatus,
} from "./contact_pick";

import { use_i18n } from "@/lib/i18n/context";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { show_toast } from "@/components/toast/simple_toast";
import { list_all_contacts, decrypt_contacts } from "@/services/api/contacts";
import { sha256_base64 } from "@/services/api/alias_hash";

type LoadState = "loading" | "ready" | "error";

const TYPE_LABEL_KEYS: Record<string, TranslationKey> = {
  home: "common.type_home",
  work: "common.type_work",
  personal: "common.type_personal",
  other: "common.type_other",
};

interface ContactPickModalProps {
  is_open: boolean;
  pins: ExistingPin[];
  on_close: () => void;
  on_add: (address: string) => Promise<{ error?: unknown }>;
  on_finished: () => Promise<void> | void;
}

export function ContactPickModal({
  is_open,
  pins,
  on_close,
  on_add,
  on_finished,
}: ContactPickModalProps) {
  const { t } = use_i18n();
  const [load_state, set_load_state] = useState<LoadState>("loading");
  const [contacts, set_contacts] = useState<DecryptedContact[]>([]);
  const [statuses, set_statuses] = useState<Map<string, PickEmailStatus>>(
    () => new Map(),
  );
  const [query, set_query] = useState("");
  const [selected, set_selected] = useState<Set<string>>(() => new Set());
  const [saving, set_saving] = useState(false);
  const [reload_token, set_reload_token] = useState(0);

  useEffect(() => {
    if (!is_open) return;
    set_query("");
    set_selected(new Set());
    set_saving(false);
  }, [is_open]);

  useEffect(() => {
    if (!is_open) return;
    let cancelled = false;

    set_load_state("loading");
    (async () => {
      try {
        const response = await list_all_contacts();

        if (cancelled) return;
        if (!response.data) {
          set_load_state("error");

          return;
        }
        const decrypted = await decrypt_contacts(response.data);

        if (cancelled) return;
        set_contacts(decrypted);
        set_load_state("ready");
      } catch {
        if (!cancelled) set_load_state("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [is_open, reload_token]);

  useEffect(() => {
    if (!is_open || load_state !== "ready") return;
    let cancelled = false;

    resolve_existing_statuses(
      collect_pick_addresses(contacts),
      pins,
      sha256_base64,
    ).then((next) => {
      if (cancelled) return;
      set_statuses(next);
      set_selected((previous) => {
        const kept = new Set([...previous].filter((a) => !next.has(a)));

        return kept.size === previous.size ? previous : kept;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [is_open, load_state, contacts, pins]);

  const candidates = useMemo(
    () => build_pick_candidates(contacts, statuses),
    [contacts, statuses],
  );
  const visible = useMemo(
    () => filter_pick_candidates(candidates, query),
    [candidates, query],
  );
  const open_count = useMemo(
    () => candidates.filter(has_available_email).length,
    [candidates],
  );
  const picks = useMemo(
    () => finalize_picks(selected, statuses),
    [selected, statuses],
  );
  const visible_open = visible.some(has_available_email);
  const every_visible_selected = select_all_saturated(selected, visible);
  const at_limit = selected.size >= MAX_CONTACT_PICK;

  const toggle = useCallback((address: string, checked: boolean) => {
    set_selected((previous) => toggle_pick(previous, address, checked));
  }, []);

  const toggle_all = (checked: boolean) => {
    set_selected((previous) =>
      checked
        ? select_all_visible(previous, visible)
        : clear_visible(previous, visible),
    );
  };

  const submit = async () => {
    if (saving || picks.length === 0) return;
    set_saving(true);
    try {
      const result = await add_senders_in_batches(picks, on_add);

      await on_finished();
      if (result.failed.length === 0) {
        show_toast(
          t("settings.alias_sender_pick_added", {
            count: result.added.length,
          }),
          "success",
        );
        on_close();
      } else {
        set_selected(new Set(result.failed));
        show_toast(
          t("settings.alias_sender_pick_partial", {
            added: result.added.length,
            total: picks.length,
          }),
          "error",
        );
      }
    } finally {
      set_saving(false);
    }
  };

  const status_text = (status: PickEmailStatus): string | null =>
    status === "added"
      ? t("settings.alias_sender_pick_already_added")
      : status === "blocked"
        ? t("settings.alias_sender_pick_blocked")
        : null;

  const email_meta = (email: PickEmail): string | null => {
    if (email.label?.trim()) return email.label.trim();
    const key = email.type ? TYPE_LABEL_KEYS[email.type] : undefined;

    return key ? t(key) : null;
  };

  const render_option = (
    candidate: PickCandidate,
    email: PickEmail,
    nested: boolean,
  ) => {
    const checkbox_id = `alias_pick_${candidate.contact_id}_${email.address}`;
    const is_checked = selected.has(email.address);
    const disabled =
      saving || email.status !== "available" || (!is_checked && at_limit);
    const status = status_text(email.status);
    const meta = email_meta(email);
    const title = nested ? email.address : candidate.name || email.address;
    const subtitle = nested ? meta : candidate.name ? email.address : null;

    return (
      <label
        key={email.address}
        className={`contact_group_option ${disabled ? "cursor-default" : ""}`}
        data-checked={is_checked}
        data-disabled={disabled}
        data-testid={`alias_pick_option_${email.address}`}
        htmlFor={checkbox_id}
        style={{
          opacity: email.status === "available" ? 1 : 0.6,
          paddingInlineStart: nested ? 52 : undefined,
          minHeight: nested ? 40 : undefined,
        }}
      >
        {!nested && (
          <ContactAvatar
            avatar_url={candidate.avatar_url}
            email={email.address}
            name={candidate.name || email.address}
            profile_color={candidate.profile_color}
            size_px={32}
          />
        )}
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-txt-primary ${
              nested ? "text-[13px]" : "text-[13.5px] font-medium"
            }`}
          >
            {title}
          </span>
          {subtitle && (
            <span className="block truncate text-[12px] text-txt-muted">
              {subtitle}
            </span>
          )}
        </span>
        {status ? (
          <span className="flex-shrink-0 text-[12px] text-txt-muted">
            {status}
          </span>
        ) : (
          <Checkbox
            checked={is_checked}
            disabled={disabled}
            id={checkbox_id}
            onCheckedChange={(value) => toggle(email.address, value === true)}
          />
        )}
      </label>
    );
  };

  const render_candidate = (candidate: PickCandidate) => {
    if (candidate.emails.length === 1) {
      return (
        <div
          key={candidate.contact_id}
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "auto 48px",
          }}
        >
          {render_option(candidate, candidate.emails[0], false)}
        </div>
      );
    }

    return (
      <div
        key={candidate.contact_id}
        aria-label={candidate.name || candidate.emails[0].address}
        className="flex flex-col gap-0.5"
        data-testid={`alias_pick_group_${candidate.contact_id}`}
        role="group"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: `auto ${48 + candidate.emails.length * 40}px`,
        }}
      >
        <div className="flex min-h-[48px] items-center gap-3 px-2.5 py-1.5">
          <ContactAvatar
            avatar_url={candidate.avatar_url}
            email={candidate.emails[0].address}
            name={candidate.name || candidate.emails[0].address}
            profile_color={candidate.profile_color}
            size_px={32}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium text-txt-primary">
              {candidate.name || t("common.unnamed")}
            </span>
            <span className="block truncate text-[12px] text-txt-muted">
              {t("settings.alias_sender_pick_address_count", {
                count: candidate.emails.length,
              })}
            </span>
          </span>
        </div>
        {candidate.emails.map((email) => render_option(candidate, email, true))}
      </div>
    );
  };

  const render_body = () => {
    if (load_state === "loading") {
      return (
        <div
          className="flex justify-center py-10"
          data-testid="alias_pick_loading"
        >
          <Spinner size="md" />
        </div>
      );
    }

    if (load_state === "error") {
      return (
        <LoadFailedNotice
          on_retry={() => set_reload_token((value) => value + 1)}
        />
      );
    }

    if (candidates.length === 0) {
      return (
        <div data-testid="alias_pick_no_contacts">
          <IslandEmpty
            description={t(
              "settings.alias_sender_pick_no_contacts_description",
            )}
            icon={<UsersIcon />}
            title={t("settings.alias_sender_pick_no_contacts_title")}
          />
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="relative">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-muted"
          />
          <Input
            autoFocus
            aria-label={t("common.search_contacts")}
            className="aster_input_tonal"
            data-testid="alias_pick_search"
            placeholder={t("common.search_contacts")}
            size="md"
            style={{ paddingInlineStart: "38px" }}
            value={query}
            onChange={(event) => set_query(event.target.value)}
          />
        </div>

        {open_count === 0 && (
          <p
            className="px-1 text-[12.5px] text-txt-muted"
            data-testid="alias_pick_all_added"
          >
            {t("settings.alias_sender_pick_all_added")}
          </p>
        )}

        {open_count > 0 && (
          <div className="flex min-h-[28px] items-center justify-between gap-3 px-1">
            {visible_open ? (
              <label
                className="flex cursor-pointer items-center gap-2.5 text-[12.5px] font-medium text-txt-secondary"
                data-testid="alias_pick_select_all"
              >
                <Checkbox
                  checked={every_visible_selected}
                  disabled={saving}
                  onCheckedChange={(value) => toggle_all(value === true)}
                />
                {t("settings.alias_sender_pick_select_all")}
              </label>
            ) : (
              <span />
            )}
            <span
              className="text-[12px] tabular-nums text-txt-muted"
              data-testid="alias_pick_selected_count"
            >
              {t("settings.alias_sender_pick_selected", {
                count: selected.size,
              })}
            </span>
          </div>
        )}

        <div
          aria-label={t("settings.alias_sender_pick_title")}
          className="contact_group_picker max-h-[360px] overflow-y-auto overscroll-contain"
          data-testid="alias_pick_list"
          role="group"
        >
          {visible.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-txt-muted">
              {t("common.no_contacts_match", { query: query.trim() })}
            </p>
          ) : (
            visible.map(render_candidate)
          )}
        </div>

        {at_limit && (
          <p
            className="px-1 text-[12.5px] text-txt-muted"
            data-testid="alias_pick_limit"
            role="status"
          >
            {t("settings.alias_sender_pick_limit", {
              count: MAX_CONTACT_PICK,
            })}
          </p>
        )}
      </div>
    );
  };

  return (
    <Modal is_open={is_open} on_close={saving ? () => {} : on_close} size="md">
      <ModalHeader>
        <ModalTitle>{t("settings.alias_sender_pick_title")}</ModalTitle>
        <ModalDescription>
          {t("settings.alias_sender_pick_description")}
        </ModalDescription>
      </ModalHeader>

      <ModalBody>{render_body()}</ModalBody>

      <ModalFooter>
        <Button disabled={saving} variant="ghost" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          data-testid="alias_pick_submit"
          disabled={picks.length === 0}
          is_loading={saving}
          variant="depth"
          onClick={submit}
        >
          {picks.length > 0
            ? t("settings.alias_sender_pick_submit_count", {
                count: picks.length,
              })
            : t("settings.alias_sender_pick_submit")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
