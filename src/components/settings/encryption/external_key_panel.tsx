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
  blocking_device,
  external_key_action_result,
  external_key_support,
} from "@/services/crypto/external_pgp_key";
import type {
  external_key_change,
  normalized_external_key,
} from "@/services/crypto/external_pgp_import";
import type { TranslationKey } from "@/lib/i18n/types";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ClipboardIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  MinusCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Island,
  IslandDivider,
  IslandRow,
  IslandSection,
} from "@aster/ui";

import { InfoPopover } from "@/components/ui/info_popover";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { Input } from "@/components/ui/input";
import { ButtonSpinner } from "@/components/ui/spinner";
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { show_toast } from "@/components/toast/simple_toast";
import { use_register_search_items } from "@/components/settings/search_context";
import { trigger_download } from "@/utils/download_blob";
import { copy_text_or_throw } from "@/utils/copy_text";
import { SETTINGS_ANCHORS } from "@/lib/settings_links";
import { app_locale, get_display_time_zone } from "@/utils/date_format";
import { clamp_password } from "@/services/sanitize";
import { external_key_import_error } from "@/services/crypto/external_pgp_import";
import {
  check_external_pgp_support,
  delete_external_key,
  export_external_public_key,
  prepare_external_key_import,
  replace_external_key,
  request_external_pgp_key_load,
  set_external_key_published,
  submit_external_key_revocation,
  upload_external_key,
} from "@/services/crypto/external_pgp_key";
import {
  external_key_device_label_key,
  external_key_expires_soon,
  external_key_has_expired,
  format_external_fingerprint,
  use_external_key_state,
} from "@/components/settings/encryption/use_external_key_state";

const MAX_KEY_FILE_BYTES = 1024 * 1024;

const REJECTION_KEYS: Record<string, TranslationKey> = {
  unreadable: "settings.external_key_error_unreadable",
  not_private: "settings.external_key_error_not_private",
  unsupported_version: "settings.external_key_error_unsupported_version",
  unsupported_algorithm: "settings.external_key_error_unsupported_algorithm",
  weak_rsa: "settings.external_key_error_weak_rsa",
  stub_key: "settings.external_key_error_stub_key",
  missing_secret: "settings.external_key_error_stub_key",
  passphrase_required: "settings.external_key_error_passphrase_required",
  wrong_passphrase: "settings.external_key_error_wrong_passphrase",
  expired: "settings.external_key_error_expired",
  revoked: "settings.external_key_error_revoked",
  invalid_self_signature: "settings.external_key_error_invalid_signature",
  weak_self_signature: "settings.external_key_error_weak_signature",
  no_encryption_subkey: "settings.external_key_error_no_encryption_subkey",
  fingerprint_changed: "settings.external_key_error_fingerprint_changed",
};

const SERVER_CODE_KEYS: Record<string, TranslationKey> = {
  EXTERNAL_KEY_EXISTS: "settings.external_key_error_exists",
  UNSUPPORTED_ALGORITHM: "settings.external_key_error_unsupported_algorithm",
  KEY_EXPIRED: "settings.external_key_error_expired",
  KEY_REVOKED: "settings.external_key_error_revoked",
  NO_ENCRYPTION_SUBKEY: "settings.external_key_error_no_encryption_subkey",
  MASTER_KEY_REQUIRED: "settings.external_key_needs_upgrade",
  EXTERNAL_UID_MISMATCH: "settings.external_key_uid_mismatch",
};

const CHANGE_KEYS: Record<external_key_change, TranslationKey> = {
  preferences_updated: "settings.external_key_change_preferences",
  user_id_added: "settings.external_key_change_user_id",
  user_attributes_removed: "settings.external_key_change_attributes",
  third_party_certifications_removed:
    "settings.external_key_change_certifications",
  inactive_user_ids_removed: "settings.external_key_change_user_ids_removed",
  inactive_subkeys_removed: "settings.external_key_change_subkeys_removed",
};

function format_date(value: string | Date): string {
  return new Date(value).toLocaleDateString(app_locale(), {
    timeZone: get_display_time_zone(),
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function algorithm_label(algorithm: string, key_size: number): string {
  if (algorithm.toLowerCase().startsWith("rsa")) return `RSA ${key_size}`;

  return "Curve25519";
}

function Notice({
  tone,
  children,
}: {
  tone: "warning" | "danger";
  children: ReactNode;
}) {
  const Icon =
    tone === "danger" ? ExclamationCircleIcon : ExclamationTriangleIcon;

  return (
    <Island padding="sm" tone={tone}>
      <div className="flex items-start gap-2.5">
        <Icon
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{
            color:
              tone === "danger"
                ? "var(--color-danger)"
                : "var(--color-warning)",
          }}
        />
        <div className="text-[13px] leading-relaxed text-txt-secondary">
          {children}
        </div>
      </div>
    </Island>
  );
}

function DeviceList({ devices }: { devices: blocking_device[] }) {
  const { t } = use_i18n();

  if (devices.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1">
      {devices.map((device) => (
        <li key={device.client_id} className="text-[12px] text-txt-muted">
          {device.last_seen_at
            ? t("settings.external_key_device_row", {
                platform: t(external_key_device_label_key(device.platform)),
                date: format_date(device.last_seen_at),
              })
            : t(external_key_device_label_key(device.platform))}
        </li>
      ))}
    </ul>
  );
}

interface ImportModalProps {
  is_open: boolean;
  replacing: boolean;
  primary_address: string;
  on_close: () => void;
}

function ImportModal({
  is_open,
  replacing,
  primary_address,
  on_close,
}: ImportModalProps) {
  const { t } = use_i18n();
  const file_input = useRef<HTMLInputElement>(null);
  const [file_bytes, set_file_bytes] = useState<Uint8Array | null>(null);
  const [file_name, set_file_name] = useState("");
  const [passphrase, set_passphrase] = useState("");
  const [prepared, set_prepared] = useState<normalized_external_key | null>(
    null,
  );
  const [error, set_error] = useState("");
  const [busy, set_busy] = useState(false);

  useEffect(() => {
    if (is_open) return;
    set_file_bytes(null);
    set_file_name("");
    set_passphrase("");
    set_prepared(null);
    set_error("");
    set_busy(false);
  }, [is_open]);

  const handle_file = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    event.target.value = "";
    if (!file) return;

    set_prepared(null);
    set_error("");

    if (file.size > MAX_KEY_FILE_BYTES) {
      set_error(t("settings.external_key_error_unreadable"));

      return;
    }

    try {
      set_file_bytes(new Uint8Array(await file.arrayBuffer()));
      set_file_name(file.name);
    } catch {
      set_error(t("settings.external_key_error_read_file"));
    }
  };

  const handle_check = async () => {
    if (!file_bytes) return;

    set_busy(true);
    set_error("");

    try {
      set_prepared(
        await prepare_external_key_import(
          file_bytes,
          passphrase,
          primary_address,
        ),
      );
      set_passphrase("");
    } catch (caught) {
      const reason =
        caught instanceof external_key_import_error ? caught.reason : undefined;

      if (reason === "revoked" || reason === "not_private") {
        const revocation = await submit_external_key_revocation(file_bytes);

        if (revocation?.ok) {
          show_toast(t("settings.external_key_revocation_saved"), "success");
          on_close();

          return;
        }
      }

      set_error(
        t(
          (reason ? REJECTION_KEYS[reason] : undefined) ??
            "settings.external_key_error_generic",
        ),
      );
    } finally {
      set_busy(false);
    }
  };

  const handle_upload = async () => {
    if (!prepared) return;

    set_busy(true);
    set_error("");

    const result = replacing
      ? await replace_external_key(prepared)
      : await upload_external_key(prepared);

    set_busy(false);

    if (result.ok) {
      show_toast(t("settings.external_key_imported"), "success");
      on_close();

      return;
    }

    const key =
      (result.reason ? REJECTION_KEYS[result.reason] : undefined) ??
      SERVER_CODE_KEYS[result.code];

    set_error(
      t(key ?? "settings.external_key_error_generic", {
        address: primary_address,
      }),
    );
  };

  const summary = prepared?.summary;

  return (
    <Modal
      is_open={is_open}
      size="md"
      on_close={busy ? () => undefined : on_close}
    >
      <ModalHeader>
        <ModalTitle>
          {summary
            ? t("settings.external_key_review_title")
            : t("settings.external_key_import_title")}
        </ModalTitle>
        <ModalDescription>
          {summary
            ? t("settings.external_key_review_description")
            : t("settings.external_key_import_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          {!summary && (
            <>
              <div>
                <p className="block text-xs font-medium mb-1.5 text-txt-secondary">
                  {t("settings.external_key_file_label")}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    disabled={busy}
                    size="md"
                    variant="secondary"
                    onClick={() => file_input.current?.click()}
                  >
                    <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                    {t("settings.external_key_choose_file")}
                  </Button>
                  <span className="min-w-0 truncate text-[13px] text-txt-muted">
                    {file_name}
                  </span>
                </div>
                <input
                  ref={file_input}
                  accept=".asc,.gpg,.pgp,.key,application/pgp-keys"
                  aria-label={t("settings.external_key_file_label")}
                  className="hidden"
                  type="file"
                  onChange={handle_file}
                />
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1.5 text-txt-secondary"
                  htmlFor="external_key_passphrase"
                >
                  {t("settings.external_key_passphrase_label")}
                </label>
                <Input
                  autoComplete="off"
                  disabled={busy}
                  id="external_key_passphrase"
                  maxLength={256}
                  type="password"
                  value={passphrase}
                  onChange={(event) =>
                    set_passphrase(clamp_password(event.target.value))
                  }
                />
                <p className="mt-1.5 text-xs leading-relaxed text-txt-muted">
                  {t("settings.external_key_passphrase_hint")}
                </p>
              </div>
            </>
          )}

          {summary && prepared && (
            <>
              <Island>
                <IslandRow
                  description={
                    <code className="break-all text-[11px] font-mono">
                      {format_external_fingerprint(summary.fingerprint)}
                    </code>
                  }
                  label={t("settings.key_fingerprint")}
                />
                <IslandDivider />
                <IslandRow
                  description={algorithm_label(
                    summary.algorithm,
                    summary.key_size,
                  )}
                  label={t("settings.external_key_algorithm")}
                />
                <IslandDivider />
                <IslandRow
                  description={
                    summary.expires_at
                      ? format_date(summary.expires_at)
                      : t("settings.external_key_never_expires")
                  }
                  label={t("settings.external_key_expiry")}
                />
              </Island>

              {summary.warnings.includes("rsa_2048") && (
                <Notice tone="warning">
                  {t("settings.external_key_warning_rsa_2048")}
                </Notice>
              )}
              {summary.expires_at &&
                external_key_expires_soon(summary.expires_at) && (
                  <Notice tone="warning">
                    {t("settings.external_key_expires_soon", {
                      date: format_date(summary.expires_at),
                    })}
                  </Notice>
                )}
              {replacing && (
                <Notice tone="danger">
                  {t("settings.external_key_replace_warning")}
                </Notice>
              )}

              {prepared.changes.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5 text-txt-secondary">
                    {t("settings.external_key_changes_title")}
                  </p>
                  <ul className="list-disc ps-5 space-y-1 text-[13px] text-txt-secondary">
                    {prepared.changes.map((change) => (
                      <li key={change}>
                        {t(CHANGE_KEYS[change], { address: primary_address })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {error && (
            <p
              className="flex items-start gap-1.5 text-[13px] leading-snug"
              role="alert"
              style={{ color: "var(--color-danger)" }}
            >
              <ExclamationCircleIcon
                aria-hidden="true"
                className="mt-px h-4 w-4 shrink-0"
              />
              <span>{error}</span>
            </p>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button disabled={busy} variant="ghost" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        {summary ? (
          <Button disabled={busy} variant="depth" onClick={handle_upload}>
            {replacing
              ? t("settings.external_key_replace")
              : t("settings.external_key_import")}
            {busy && <ButtonSpinner />}
          </Button>
        ) : (
          <Button
            disabled={busy || !file_bytes}
            variant="depth"
            onClick={handle_check}
          >
            {t("settings.external_key_check")}
            {busy && <ButtonSpinner />}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

export function ExternalKeyPanel() {
  const { t } = use_i18n();
  const { user } = use_auth();
  const key_state = use_external_key_state();
  const [support, set_support] = useState<external_key_support | null>(null);
  const [import_mode, set_import_mode] = useState<"import" | "replace" | null>(
    null,
  );
  const [confirm_delete, set_confirm_delete] = useState(false);
  const [busy, set_busy] = useState(false);
  const [blocking, set_blocking] = useState<blocking_device[] | null>(null);
  const [action_error, set_action_error] = useState("");
  const [uid_rejected, set_uid_rejected] = useState(false);
  const primary_address = user?.email ?? "";

  use_register_search_items("encryption", [
    {
      label: t("settings.external_key_title"),
      breadcrumb: `${t("settings.encryption")} > ${t("settings.external_key_title")}`,
      keywords: ["import key", "gpg", "openpgp", "wkd", "own key"],
    },
  ]);

  useEffect(() => {
    let cancelled = false;

    check_external_pgp_support()
      .then((result) => {
        if (!cancelled) set_support(result);
      })
      .catch(() => {
        if (!cancelled) {
          set_support({ available: false, needs_master_key: false });
        }
      });
    void request_external_pgp_key_load();

    return () => {
      cancelled = true;
    };
  }, []);

  const record_fingerprint = key_state.record?.fingerprint;

  useEffect(() => {
    set_uid_rejected(false);
  }, [record_fingerprint]);

  const report = useCallback(
    (result: external_key_action_result) => {
      if (result.ok) {
        set_blocking(null);
        set_action_error("");
        set_uid_rejected(false);

        return true;
      }

      if (result.code === "DEVICES_NOT_READY") {
        set_blocking(result.blocking_devices ?? []);
        set_action_error("");
        set_uid_rejected(false);

        return false;
      }

      set_blocking(null);

      if (result.code === "EXTERNAL_UID_MISMATCH") {
        set_action_error("");
        set_uid_rejected(true);

        return false;
      }

      set_uid_rejected(false);
      set_action_error(
        t(
          SERVER_CODE_KEYS[result.code] ?? "settings.external_key_error_generic",
          { address: primary_address },
        ),
      );

      return false;
    },
    [primary_address, t],
  );

  const toggle_publish = async (publish: boolean) => {
    set_busy(true);
    const result = await set_external_key_published(publish);

    set_busy(false);

    if (report(result)) {
      show_toast(
        publish
          ? t("settings.external_key_published_toast")
          : t("settings.external_key_unpublished_toast"),
        "success",
      );
    }
  };

  const handle_delete = async () => {
    set_busy(true);
    const result = await delete_external_key(true);

    set_busy(false);
    set_confirm_delete(false);

    if (report(result)) {
      show_toast(t("settings.external_key_deleted_toast"), "success");
    }
  };

  const handle_copy_fingerprint = async () => {
    if (!key_state.record) return;

    try {
      await copy_text_or_throw(key_state.record.fingerprint);
      show_toast(t("settings.copied_to_clipboard"), "success");
    } catch {
      show_toast(t("common.failed_to_copy"), "error");
    }
  };

  const open_password_settings = () => {
    window.dispatchEvent(
      new CustomEvent("navigate-settings", {
        detail: { section: "security", anchor: SETTINGS_ANCHORS.two_factor },
      }),
    );
  };

  const handle_export = () => {
    const armored = export_external_public_key();

    if (!armored || !key_state.record) return;

    trigger_download(
      new Blob([armored], { type: "application/pgp-keys" }),
      `public-key-${key_state.record.key_id}.asc`,
    );
  };

  if (!support || !support.available) return null;

  const record = key_state.record;
  const needs_reimport = key_state.status === "needs_reimport";

  return (
    <>
      <IslandSection
        bare
        description={t("settings.external_key_description")}
        icon={<KeyIcon />}
        title={t("settings.external_key_title")}
      >
        {support.needs_master_key ? (
          <Notice tone="warning">
            <p>{t("settings.external_key_needs_upgrade")}</p>
            <Button
              className="mt-2.5"
              size="sm"
              variant="secondary"
              onClick={open_password_settings}
            >
              {t("settings.external_key_open_password_settings")}
            </Button>
          </Notice>
        ) : record ? (
          <div className="space-y-3">
            {needs_reimport && (
              <Notice tone="danger">
                {t("settings.external_key_needs_reimport")}
              </Notice>
            )}
            {(record.uid_mismatch || uid_rejected) && (
              <Notice tone="warning">
                {t("settings.external_key_uid_mismatch", {
                  address: primary_address,
                })}
              </Notice>
            )}
            {record.expires_at &&
              external_key_has_expired(record.expires_at) && (
                <Notice tone="danger">
                  {t("settings.external_key_error_expired")}
                </Notice>
              )}
            {record.expires_at &&
              external_key_expires_soon(record.expires_at) && (
                <Notice tone="warning">
                  {t("settings.external_key_expires_soon", {
                    date: format_date(record.expires_at),
                  })}
                </Notice>
              )}
            {blocking && (
              <Notice tone="warning">
                {t("settings.external_key_devices_not_ready")}
                <DeviceList devices={blocking} />
              </Notice>
            )}
            {action_error && <Notice tone="danger">{action_error}</Notice>}

            <Island>
              <IslandRow
                description={`${algorithm_label(record.algorithm, record.key_size)} · ${
                  record.expires_at
                    ? t("settings.external_key_expires_on", {
                        date: format_date(record.expires_at),
                      })
                    : t("settings.external_key_never_expires")
                }`}
                label={t("settings.external_key_your_key")}
                trailing={
                  <span
                    className="inline-flex items-center gap-1 text-[12px] font-semibold"
                    style={{
                      color: record.published
                        ? "var(--color-success)"
                        : undefined,
                    }}
                  >
                    {record.published ? (
                      <CheckCircleIcon
                        aria-hidden="true"
                        className="h-[15px] w-[15px]"
                      />
                    ) : (
                      <MinusCircleIcon
                        aria-hidden="true"
                        className="h-[15px] w-[15px]"
                      />
                    )}
                    {record.published
                      ? t("settings.external_key_published")
                      : t("settings.external_key_not_published")}
                  </span>
                }
              />
              <IslandDivider />
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <p className="text-xs font-medium text-txt-secondary">
                    {t("settings.key_fingerprint")}
                  </p>
                  <InfoPopover
                    description={t("settings.info_fingerprint_description")}
                    title={t("settings.info_fingerprint_title")}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 break-all rounded-[var(--aster-radius-field,10px)] bg-[var(--aster-field-bg)] px-3 py-2 text-[11px] font-mono tracking-wide text-txt-primary">
                    {format_external_fingerprint(record.fingerprint)}
                  </code>
                  <Button
                    aria-label={t("settings.copy_fingerprint")}
                    size="icon"
                    title={t("settings.copy_fingerprint")}
                    variant="ghost"
                    onClick={handle_copy_fingerprint}
                  >
                    <ClipboardIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <IslandDivider />
              {!needs_reimport && (
                <>
                  <IslandRow
                    description={t(
                      "settings.external_key_publish_description",
                      { address: primary_address },
                    )}
                    label={t("settings.external_key_publish_label")}
                    toggle={{
                      checked: record.published,
                      on_change: () => {
                        if (!busy && key_state.status === "ready") {
                          void toggle_publish(!record.published);
                        }
                      },
                      size: "lg",
                      aria_label: t("settings.external_key_publish_label"),
                    }}
                  />
                  <IslandDivider />
                </>
              )}
              <div className="px-4 py-3 flex flex-wrap gap-2">
                {!needs_reimport && (
                  <Button size="md" variant="secondary" onClick={handle_export}>
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    {t("settings.external_key_export_public")}
                  </Button>
                )}
                <Button
                  disabled={busy}
                  size="md"
                  variant="secondary"
                  onClick={() => set_import_mode("replace")}
                >
                  <ArrowPathIcon className="w-3.5 h-3.5" />
                  {t("settings.external_key_replace")}
                </Button>
                <Button
                  disabled={busy}
                  size="md"
                  variant="destructive"
                  onClick={() => set_confirm_delete(true)}
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  {t("settings.external_key_delete")}
                </Button>
              </div>
            </Island>
          </div>
        ) : (
          <Island className="text-center" padding="lg">
            <KeyIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
            <p className="text-sm text-txt-muted mb-3">
              {t("settings.external_key_none")}
            </p>
            <Button
              disabled={!key_state.loaded}
              size="sm"
              variant="depth"
              onClick={() => set_import_mode("import")}
            >
              {t("settings.external_key_import")}
            </Button>
          </Island>
        )}
      </IslandSection>

      <ImportModal
        is_open={import_mode !== null}
        primary_address={primary_address}
        replacing={import_mode === "replace"}
        on_close={() => set_import_mode(null)}
      />

      <ConfirmationModal
        confirm_text={t("settings.external_key_delete")}
        is_loading={busy}
        is_open={confirm_delete}
        message={t("settings.external_key_delete_message")}
        title={t("settings.external_key_delete_title")}
        variant="danger"
        on_cancel={() => set_confirm_delete(false)}
        on_confirm={handle_delete}
      />
    </>
  );
}
