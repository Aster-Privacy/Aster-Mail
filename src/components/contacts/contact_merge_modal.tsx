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
import type { DecryptedContact } from "@/types/contacts";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Checkbox, Island, PillButton } from "@aster/ui";

import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { contact_display_name, merge_contacts } from "@/lib/contact_duplicates";
import {
  bulk_delete_contacts,
  update_contact_encrypted,
} from "@/services/api/contacts";
import { user_facing_error } from "@/utils/user_facing_error";

interface ContactMergeModalProps {
  contacts: DecryptedContact[];
  on_close: () => void;
  on_merged: () => void;
}

const ROW_DIVIDER =
  "1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)";

function MergeSectionLabel({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <span className="text-[12.5px] font-medium text-txt-secondary">
        {children}
      </span>
      {trailing && (
        <span className="text-[12px] text-txt-muted tabular-nums">
          {trailing}
        </span>
      )}
    </div>
  );
}

function MergeDetailRow({
  label,
  values,
  is_first,
}: {
  label: string;
  values: string[];
  is_first: boolean;
}) {
  return (
    <div
      className="flex items-start justify-between gap-4 px-4 py-3"
      style={{ borderTop: is_first ? "none" : ROW_DIVIDER }}
    >
      <span className="flex-shrink-0 text-[13px] text-txt-muted">{label}</span>
      <div className="min-w-0 text-end">
        {values.map((value) => (
          <p
            key={value}
            className="break-words text-[13px] font-medium text-txt-primary"
          >
            <bdi>{value}</bdi>
          </p>
        ))}
      </div>
    </div>
  );
}

export function ContactMergeModal({
  contacts,
  on_close,
  on_merged,
}: ContactMergeModalProps) {
  const { t } = use_i18n();
  const [order, set_order] = useState<DecryptedContact[]>(contacts);
  const [excluded, set_excluded] = useState<Set<string>>(new Set());
  const [is_merging, set_is_merging] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    set_order(contacts);
    set_excluded(new Set());
  }, [contacts]);

  const selected = useMemo(
    () => order.filter((contact) => !excluded.has(contact.id)),
    [order, excluded],
  );

  const preview = useMemo(
    () => (selected.length > 0 ? merge_contacts(selected) : null),
    [selected],
  );

  const primary_id = selected[0]?.id;

  const toggle = useCallback((id: string) => {
    set_excluded((prev) => {
      const next = new Set(prev);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }, []);

  const make_primary = useCallback((id: string) => {
    set_order((prev) => {
      const index = prev.findIndex((contact) => contact.id === id);

      if (index <= 0) return prev;

      const next = [...prev];
      const [item] = next.splice(index, 1);

      next.unshift(item);

      return next;
    });
  }, []);

  const handle_close = useCallback(() => {
    if (!is_merging) on_close();
  }, [is_merging, on_close]);

  const run_merge = useCallback(async () => {
    if (selected.length < 2 || !preview) return;

    set_is_merging(true);
    set_error(null);
    try {
      const [keeper, ...absorbed] = selected;
      const response = await update_contact_encrypted(keeper.id, preview);

      if (response.error) {
        set_error(response.error);

        return;
      }

      const removed = await bulk_delete_contacts({
        contact_ids: absorbed.map((contact) => contact.id),
      });

      if (removed.error) {
        set_error(removed.error);

        return;
      }

      show_toast(
        t("common.contacts_merged", { count: selected.length }),
        "success",
      );
      on_merged();
    } catch (err) {
      set_error(user_facing_error(err, t("common.failed_to_merge_contacts")));
    } finally {
      set_is_merging(false);
    }
  }, [on_merged, preview, selected, t]);

  const detail_rows = useMemo(() => {
    if (!preview) return [];

    const name =
      `${preview.first_name} ${preview.last_name}`.trim() ||
      preview.emails[0] ||
      "";

    return [
      { key: "name", label: t("common.name"), values: name ? [name] : [] },
      { key: "email", label: t("common.email"), values: preview.emails },
      {
        key: "phone",
        label: t("common.phone"),
        values: preview.phone ? [preview.phone] : [],
      },
      {
        key: "company",
        label: t("common.company"),
        values: preview.company ? [preview.company] : [],
      },
      {
        key: "job_title",
        label: t("common.job_title"),
        values: preview.job_title ? [preview.job_title] : [],
      },
    ].filter((row) => row.values.length > 0);
  }, [preview, t]);

  return (
    <Modal
      is_open
      close_on_escape={!is_merging}
      close_on_overlay={!is_merging}
      on_close={handle_close}
      size="lg"
      z_index={70}
    >
      <ModalHeader>
        <ModalTitle>{t("common.merge_contacts")}</ModalTitle>
        <ModalDescription>
          {t("common.merge_primary_description")}
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-4">
          <div className="space-y-2">
            <MergeSectionLabel
              trailing={t("common.import_selected_count", {
                selected: selected.length,
                total: order.length,
              })}
            >
              {t("common.contacts")}
            </MergeSectionLabel>
            <Island className="overflow-hidden">
              <div className="max-h-[288px] overflow-y-auto overscroll-contain">
                {order.map((contact, index) => {
                  const is_included = !excluded.has(contact.id);
                  const is_primary = contact.id === primary_id;
                  const name = contact_display_name(contact);

                  return (
                    <div
                      key={contact.id}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--aster-island-hover)]"
                      role="presentation"
                      style={{ borderTop: index > 0 ? ROW_DIVIDER : "none" }}
                      onClick={() => !is_merging && toggle(contact.id)}
                    >
                      <span
                        className="flex flex-shrink-0"
                        role="presentation"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          aria-label={name}
                          checked={is_included}
                          className="-m-2 p-2"
                          disabled={is_merging}
                          onCheckedChange={() => toggle(contact.id)}
                        />
                      </span>
                      <div
                        className="flex min-w-0 flex-1 items-center gap-3 transition-opacity"
                        style={{ opacity: is_included ? 1 : 0.5 }}
                      >
                        <ContactAvatar
                          avatar_url={contact.avatar_url}
                          email={contact.emails[0]}
                          name={name}
                          profile_color={contact.profile_color}
                          size_px={32}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-txt-primary">
                            {name}
                          </p>
                          <p className="truncate text-[12px] text-txt-muted">
                            <bdi>
                              {contact.emails.join(", ") ||
                                t("common.no_email")}
                            </bdi>
                          </p>
                        </div>
                      </div>
                      {is_primary ? (
                        <Badge className="flex-shrink-0" color="gray">
                          {t("common.merge_primary_label")}
                        </Badge>
                      ) : (
                        is_included && (
                          <PillButton
                            className="flex-shrink-0"
                            disabled={is_merging}
                            size="sm"
                            variant="neutral"
                            onClick={(event) => {
                              event.stopPropagation();
                              make_primary(contact.id);
                            }}
                          >
                            {t("common.merge_make_primary")}
                          </PillButton>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </Island>
          </div>

          {detail_rows.length > 0 && (
            <div className="space-y-2">
              <MergeSectionLabel>
                {t("common.merged_contact_preview")}
              </MergeSectionLabel>
              <Island className="overflow-hidden">
                {detail_rows.map((row, index) => (
                  <MergeDetailRow
                    key={row.key}
                    is_first={index === 0}
                    label={row.label}
                    values={row.values}
                  />
                ))}
              </Island>
            </div>
          )}

          {error && (
            <p
              className="px-1 text-[12.5px]"
              role="alert"
              style={{ color: "var(--color-danger)" }}
            >
              {error}
            </p>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button disabled={is_merging} variant="ghost" onClick={handle_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={selected.length < 2}
          is_loading={is_merging}
          variant="depth"
          onClick={run_merge}
        >
          {t("common.merge")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
