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
import type {
  
  
  
  
  AddressEntry,
  
  
  
  
  
  
  
  AddressEntryType,
  
  
  
  
  
} from "@/types/contacts";
import type { TranslationKey } from "@/lib/i18n";

import { useEffect,  useState } from "react";
import {
  PlusIcon,
  XMarkIcon,
  ChevronDownIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { show_toast } from "@/components/toast/simple_toast";
import { Spinner } from "@/components/ui/spinner";
import {
  Modal,
  ModalBody,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import {
  discover_external_key,
  format_fingerprint,
  get_key_source_label_key,
  type ExternalKeyInfo,
} from "@/services/api/keys";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ADDRESS_TYPE_OPTIONS, FIELD_CLASS, SELECT_CLASS, type_label_key } from "./helpers";

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <h2 className="text-[15px] font-semibold text-txt-primary pb-2 border-b border-edge-primary">
        {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function FieldLabel({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-3.5 h-3.5 text-txt-muted" />
      <p className="text-[12px] tracking-wide text-txt-secondary font-medium">
        {children}
      </p>
    </div>
  );
}

export function ContactPgpKeyRow({
  email,
  t,
  on_copy,
}: {
  email: string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  on_copy: (text: string, field: string) => void;
}) {
  const [key_info, set_key_info] = useState<ExternalKeyInfo | null>(null);
  const [is_loading, set_is_loading] = useState(true);
  const [is_key_open, set_is_key_open] = useState(false);

  useEffect(() => {
    let cancelled = false;

    set_is_loading(true);
    set_key_info(null);

    discover_external_key(email).then((response) => {
      if (cancelled) return;

      set_key_info(response.data ?? null);
      set_is_loading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [email]);

  const field_key = `pgp_key_${email}`;

  return (
    <div className="flex items-start justify-between gap-3 py-2.5 px-3 rounded-lg bg-surf-secondary">
      <div className="min-w-0 flex-1 flex items-start gap-2">
        <KeyIcon className="w-3.5 h-3.5 text-txt-muted mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] text-txt-primary font-medium truncate">
            {email}
          </p>
          {is_loading ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Spinner size="xs" />
              <p className="text-[12px] text-txt-muted">
                {t("settings.pgp_key_checking")}
              </p>
            </div>
          ) : key_info?.found ? (
            <div className="mt-0.5 space-y-0.5">
              <p className="text-[12px] text-emerald-500 font-medium">
                {t("settings.pgp_key_found")}
              </p>
              {key_info.fingerprint && (
                <p className="text-[11px] text-txt-muted font-mono truncate">
                  {key_info.fingerprint}
                </p>
              )}
              {key_info.source && (
                <p className="text-[11px] text-txt-muted">
                  {t("settings.pgp_key_discovered_via", {
                    source: t(get_key_source_label_key(key_info.source)),
                  })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[12px] text-txt-muted mt-0.5">
              {t("settings.pgp_key_not_found")}
            </p>
          )}
        </div>
      </div>
      {key_info?.found && key_info.public_key && (
        <div className="flex-shrink-0 flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => set_is_key_open(true)}
          >
            {t("settings.view_public_key")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              on_copy(key_info.public_key as string, field_key);
              show_toast(t("common.copied"), "success");
            }}
          >
            {t("settings.copy_public_key")}
          </Button>
        </div>
      )}
      <Modal is_open={is_key_open} size="2xl" on_close={() => set_is_key_open(false)}>
        <ModalHeader>
          <ModalTitle>{t("settings.view_public_key")}</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-3">
          <p className="text-[13px] text-txt-secondary break-all">{email}</p>
          {key_info?.fingerprint && (
            <p className="text-[12px] text-txt-muted font-mono break-all">
              {format_fingerprint(key_info.fingerprint)}
            </p>
          )}
          <pre className="max-h-[50vh] overflow-auto rounded-lg bg-surf-secondary p-3 text-[11px] leading-relaxed text-txt-primary font-mono whitespace-pre-wrap break-all">
            {key_info?.public_key}
          </pre>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!key_info?.public_key) return;
                on_copy(key_info.public_key, field_key);
                show_toast(t("common.copied"), "success");
              }}
            >
              {t("settings.copy_public_key")}
            </Button>
          </div>
        </ModalBody>
      </Modal>
    </div>
  );
}

export interface TypedListProps<T extends string> {
  entries: { value: string; type: T }[];
  options: T[];
  placeholder: string;
  input_type?: string;
  type_default: T;
  disabled: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  on_add: () => void;
  on_change: (idx: number, value: string) => void;
  on_remove: (idx: number) => void;
  on_type_change: (idx: number, type: string) => void;
}

export function TypedList<T extends string>({
  entries,
  options,
  placeholder,
  input_type,
  disabled,
  t,
  on_add,
  on_change,
  on_remove,
  on_type_change,
}: TypedListProps<T>) {
  return (
    <div className="space-y-2">
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            className={`${FIELD_CLASS} flex-1 min-w-0`}
            placeholder={placeholder}
            readOnly={disabled}
            type={input_type || "text"}
            value={entry.value}
            onChange={(e) => on_change(idx, e.target.value)}
          />
          <Select
            disabled={disabled}
            value={entry.type}
            onValueChange={(v) => on_type_change(idx, v)}
          >
            <SelectTrigger className="w-[120px] h-11 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] border border-edge-secondary/60 dark:border-transparent text-[13px] text-txt-primary">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {t(type_label_key(opt))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!disabled && (
            <button
              aria-label={t("common.remove")}
              className="flex-shrink-0 w-8 h-8 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors"
              type="button"
              onClick={() => on_remove(idx)}
            >
              <XMarkIcon className="w-4 h-4 text-txt-muted" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-[12px] bg-black/[0.04] dark:bg-white/[0.04] text-[12px] text-txt-secondary hover:text-txt-primary hover:bg-black/[0.08] dark:hover:bg-white/[0.08] transition-colors"
          type="button"
          onClick={on_add}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          {entries.length === 0 ? t("common.add") : t("common.add_more")}
        </button>
      )}
    </div>
  );
}

export interface AddressListProps {
  entries: AddressEntry[];
  disabled: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  on_add: () => void;
  on_change: (idx: number, patch: Partial<AddressEntry>) => void;
  on_remove: (idx: number) => void;
}

export function AddressList({
  entries,
  disabled,
  t,
  on_add,
  on_change,
  on_remove,
}: AddressListProps) {
  return (
    <div className="space-y-3">
      {entries.map((entry, idx) => (
        <div
          key={idx}
          className="rounded-xl bg-black/10 dark:bg-white/[0.02] p-3 space-y-2 relative"
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <select
                className={`${SELECT_CLASS} pr-7 w-full`}
                disabled={disabled}
                value={entry.type}
                onChange={(e) =>
                  on_change(idx, {
                    type: e.target.value as AddressEntryType,
                  })
                }
              >
                {ADDRESS_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {t(type_label_key(opt))}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-txt-muted" />
            </div>
            {!disabled && (
              <button
                aria-label={t("common.remove")}
                className="flex-shrink-0 w-8 h-8 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors"
                type="button"
                onClick={() => on_remove(idx)}
              >
                <XMarkIcon className="w-4 h-4 text-txt-muted" />
              </button>
            )}
          </div>
          <input
            className={FIELD_CLASS}
            placeholder={t("common.address_placeholder")}
            readOnly={disabled}
            value={entry.street || ""}
            onChange={(e) => on_change(idx, { street: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className={FIELD_CLASS}
              placeholder={t("common.city_placeholder")}
              readOnly={disabled}
              value={entry.city || ""}
              onChange={(e) => on_change(idx, { city: e.target.value })}
            />
            <input
              className={FIELD_CLASS}
              placeholder={t("common.state_placeholder")}
              readOnly={disabled}
              value={entry.state || ""}
              onChange={(e) => on_change(idx, { state: e.target.value })}
            />
            <input
              className={FIELD_CLASS}
              placeholder={t("common.postal_code_placeholder")}
              readOnly={disabled}
              value={entry.postal_code || ""}
              onChange={(e) =>
                on_change(idx, { postal_code: e.target.value })
              }
            />
            <input
              className={FIELD_CLASS}
              placeholder={t("common.country_placeholder")}
              readOnly={disabled}
              value={entry.country || ""}
              onChange={(e) => on_change(idx, { country: e.target.value })}
            />
          </div>
        </div>
      ))}
      {!disabled && (
        <button
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-[12px] bg-black/[0.04] dark:bg-white/[0.04] text-[12px] text-txt-secondary hover:text-txt-primary hover:bg-black/[0.08] dark:hover:bg-white/[0.08] transition-colors"
          type="button"
          onClick={on_add}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          {entries.length === 0 ? t("common.add") : t("common.add_more")}
        </button>
      )}
    </div>
  );
}
