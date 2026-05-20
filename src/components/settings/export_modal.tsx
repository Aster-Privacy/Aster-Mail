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
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  XMarkIcon,
  ArchiveBoxArrowDownIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { Button, Checkbox } from "@aster/ui";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { show_toast } from "@/components/toast/simple_toast";
import {
  verify_passphrase_for_export,
  issue_export_token,
  consume_export_token,
} from "@/services/crypto/memory_key_store";
import {
  is_fsa_supported,
  pick_zip_file,
  open_zip_blob,
  suggested_zip_filename,
  sink_write_data_file,
  sink_complete,
  sink_abort,
  type ExportSink,
} from "@/services/export/destination";
import { run_export, type ExportProgress, type ExportSummary } from "@/services/export/pipeline";
import { create_account_message_source } from "@/services/export/message_source";
import { emit_export_event } from "@/services/export/audit";
import { build_account_data_files } from "@/services/export/account_data";

type ExportStep =
  | "reauth"
  | "warning"
  | "scope"
  | "format"
  | "destination"
  | "progress"
  | "complete";

type ExportFormat = "mbox" | "eml_dir";

interface ExportModalProps {
  is_open: boolean;
  on_close: () => void;
}

function format_bytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

export function ExportModal({ is_open, on_close }: ExportModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  const [step, set_step] = useState<ExportStep>("reauth");
  const [passphrase, set_passphrase] = useState("");
  const [reauth_error, set_reauth_error] = useState(false);
  const [token, set_token] = useState<string | null>(null);
  const [warning_ack, set_warning_ack] = useState(false);
  const [format, set_format] = useState<ExportFormat>("mbox");
  const [include_mail, set_include_mail] = useState(true);
  const [include_contacts, set_include_contacts] = useState(true);
  const [include_settings, set_include_settings] = useState(true);
  const [date_from, set_date_from] = useState("");
  const [date_to, set_date_to] = useState("");
  const [progress, set_progress] = useState<ExportProgress | null>(null);
  const [summary, set_summary] = useState<ExportSummary | null>(null);
  const [destination_label, set_destination_label] = useState<string | null>(
    null,
  );
  const abort_ref = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    set_step("reauth");
    set_passphrase("");
    set_reauth_error(false);
    set_token(null);
    set_warning_ack(false);
    set_format("mbox");
    set_include_mail(true);
    set_include_contacts(true);
    set_include_settings(true);
    set_date_from("");
    set_date_to("");
    set_progress(null);
    set_summary(null);
    set_destination_label(null);
  }, []);

  const handle_close = useCallback(() => {
    if (step === "progress") return;
    reset();
    on_close();
  }, [on_close, reset, step]);

  useEffect(() => {
    if (!is_open) reset();
  }, [is_open, reset]);

  const handle_reauth_submit = useCallback(() => {
    if (!verify_passphrase_for_export(passphrase)) {
      set_reauth_error(true);
      return;
    }
    const t_str = issue_export_token();
    if (!t_str) {
      set_reauth_error(true);
      return;
    }
    set_token(t_str);
    set_passphrase("");
    set_step("warning");
  }, [passphrase]);

  const handle_warning_continue = useCallback(() => {
    if (!warning_ack) return;
    set_step("scope");
  }, [warning_ack]);

  const handle_scope_continue = useCallback(() => {
    if (!include_mail && !include_contacts && !include_settings) return;
    set_step(include_mail ? "format" : "destination");
  }, [include_mail, include_contacts, include_settings]);

  const run_pipeline = useCallback(
    async (sink: ExportSink, dest_label: string) => {
      if (!token || !consume_export_token(token)) {
        show_toast(t("settings.export_error_no_vault"), "error");
        set_step("reauth");
        return;
      }
      set_destination_label(dest_label);
      set_step("progress");

      const controller = new AbortController();
      abort_ref.current = controller;

      const source = create_account_message_source();
      emit_export_event({
        kind: "started",
        count: 0,
        total_bytes: 0,
        format,
      });

      let result: ExportSummary | null = null;
      let fatal = false;
      try {
        if (include_mail) {
          result = await run_export({
            scope: {
              preset: date_from || date_to ? "custom" : "all",
              date_from: date_from || undefined,
              date_to: date_to || undefined,
            },
            format,
            sink,
            source,
            signal: controller.signal,
            on_progress: (p) => set_progress(p),
          });
        }

        if (include_contacts || include_settings) {
          const extras = await build_account_data_files({
            contacts: include_contacts,
            settings: include_settings,
          });
          for (const f of extras) {
            await sink_write_data_file(sink, f.name, f.bytes);
          }
        }

        await sink_complete(sink);
      } catch (err) {
        fatal = true;
        if (import.meta.env.DEV) console.error(err);
        await sink_abort(sink);
        show_toast(t("settings.export_error_write_fatal"), "error");
      }
      emit_export_event({
        kind: fatal || result?.cancelled ? "aborted" : "completed",
        count: result?.processed ?? 0,
        total_bytes: result?.bytes_written ?? 0,
        format,
      });

      set_summary(result);
      set_step("complete");
    },
    [date_from, date_to, format, include_mail, include_contacts, include_settings, t, token],
  );

  const handle_pick_destination = useCallback(async () => {
    const name = suggested_zip_filename();
    if (is_fsa_supported()) {
      const sink = await pick_zip_file(name);
      if (!sink) return;
      await run_pipeline(sink, sink.filename);
    } else {
      const sink = open_zip_blob(name);
      await run_pipeline(sink, name);
    }
  }, [run_pipeline]);

  const handle_cancel_progress = useCallback(() => {
    abort_ref.current?.abort();
  }, []);

  const render_step = () => {
    if (step === "reauth") {
      return (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-txt-primary">
            {t("settings.export_step_reauth_title")}
          </h3>
          <p className="text-xs text-txt-muted">
            {t("settings.export_reauth_prompt")}
          </p>
          <input
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-surf-secondary border border-edge-secondary text-sm text-txt-primary"
            placeholder="••••••••"
            type="password"
            value={passphrase}
            onChange={(e) => {
              set_passphrase(e.target.value);
              set_reauth_error(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && handle_reauth_submit()}
          />
          {reauth_error && (
            <p className="text-xs text-red-500">
              {t("settings.export_reauth_failed")}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button size="md" variant="outline" onClick={handle_close}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={passphrase.length === 0}
              size="md"
              variant="depth"
              onClick={handle_reauth_submit}
            >
              {t("settings.export_reauth_submit")}
            </Button>
          </div>
        </div>
      );
    }

    if (step === "warning") {
      return (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-txt-primary">
            {t("settings.export_warning_title")}
          </h3>
          <p className="text-xs text-txt-muted leading-relaxed">
            {t("settings.export_warning_body")}
          </p>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <Checkbox
              checked={warning_ack}
              onCheckedChange={(v) => set_warning_ack(v === true)}
            />
            <span className="text-xs text-txt-secondary">
              {t("settings.export_warning_confirm")}
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="md" variant="outline" onClick={handle_close}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!warning_ack}
              size="md"
              variant="depth"
              onClick={handle_warning_continue}
            >
              {t("common.continue")}
            </Button>
          </div>
        </div>
      );
    }

    if (step === "scope") {
      const none_selected =
        !include_mail && !include_contacts && !include_settings;
      const Row = ({
        checked,
        on_change,
        title,
        body,
      }: {
        checked: boolean;
        on_change: (v: boolean) => void;
        title: string;
        body: string;
      }) => (
        <label
          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
            checked
              ? "border-brand bg-surf-secondary"
              : "border-edge-secondary"
          }`}
        >
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => on_change(v === true)}
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-txt-primary">{title}</p>
            <p className="text-xs text-txt-muted mt-0.5">{body}</p>
          </div>
        </label>
      );
      return (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-txt-primary">
            {t("settings.export_step_scope_title")}
          </h3>
          <Row
            checked={include_mail}
            on_change={set_include_mail}
            title={t("settings.export_scope_mail_title")}
            body={t("settings.export_scope_mail_body")}
          />
          <Row
            checked={include_contacts}
            on_change={set_include_contacts}
            title={t("settings.export_scope_contacts_title")}
            body={t("settings.export_scope_contacts_body")}
          />
          <Row
            checked={include_settings}
            on_change={set_include_settings}
            title={t("settings.export_scope_settings_title")}
            body={t("settings.export_scope_settings_body")}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button size="md" variant="outline" onClick={handle_close}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={none_selected}
              size="md"
              variant="depth"
              onClick={handle_scope_continue}
            >
              {t("common.continue")}
            </Button>
          </div>
        </div>
      );
    }

    if (step === "format") {
      return (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-txt-primary">
            {t("settings.export_step_format_title")}
          </h3>
          <button
            className={`w-full text-left p-3 rounded-lg border ${
              format === "mbox"
                ? "border-brand bg-surf-secondary"
                : "border-edge-secondary"
            }`}
            type="button"
            onClick={() => set_format("mbox")}
          >
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.export_format_mbox_name")}
            </p>
            <p className="text-xs text-txt-muted mt-1">
              {t("settings.export_format_mbox_hint")}
            </p>
          </button>
          <button
            className={`w-full text-left p-3 rounded-lg border ${
              format === "eml_dir"
                ? "border-brand bg-surf-secondary"
                : "border-edge-secondary"
            }`}
            type="button"
            onClick={() => set_format("eml_dir")}
          >
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.export_format_eml_name")}
            </p>
            <p className="text-xs text-txt-muted mt-1">
              {t("settings.export_format_eml_hint")}
            </p>
          </button>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <div>
              <label className="text-xs text-txt-muted">
                {t("settings.export_scope_date_from")}
              </label>
              <input
                className="w-full mt-1 px-2 py-1.5 rounded-lg bg-surf-secondary border border-edge-secondary text-xs text-txt-primary"
                type="date"
                value={date_from}
                onChange={(e) => set_date_from(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-txt-muted">
                {t("settings.export_scope_date_to")}
              </label>
              <input
                className="w-full mt-1 px-2 py-1.5 rounded-lg bg-surf-secondary border border-edge-secondary text-xs text-txt-primary"
                type="date"
                value={date_to}
                onChange={(e) => set_date_to(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button size="md" variant="outline" onClick={handle_close}>
              {t("common.cancel")}
            </Button>
            <Button
              size="md"
              variant="depth"
              onClick={() => set_step("destination")}
            >
              {t("common.continue")}
            </Button>
          </div>
        </div>
      );
    }

    if (step === "destination") {
      const fsa = is_fsa_supported();
      const action_label = fsa
        ? t("settings.export_destination_pick_file")
        : t("common.download");
      return (
        <div className="space-y-5">
          <h3 className="text-sm font-medium text-txt-primary">
            {t("settings.export_step_destination_title")}
          </h3>
          <div className="flex flex-col items-center justify-center gap-3 p-6 rounded-lg border border-dashed border-edge-secondary bg-surf-secondary/40">
            <ArchiveBoxArrowDownIcon className="w-10 h-10 text-txt-secondary" />
            <p className="text-xs text-txt-secondary text-center">
              {suggested_zip_filename()}
            </p>
          </div>
          {!fsa && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surf-secondary/60 border border-edge-secondary">
              <InformationCircleIcon className="w-4 h-4 mt-0.5 text-txt-muted flex-shrink-0" />
              <p className="text-xs text-txt-muted leading-relaxed">
                {t("settings.export_destination_fallback_notice")}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button size="md" variant="outline" onClick={handle_close}>
              {t("common.cancel")}
            </Button>
            <Button size="md" variant="depth" onClick={handle_pick_destination}>
              {action_label}
            </Button>
          </div>
        </div>
      );
    }

    if (step === "progress") {
      const total = progress?.total ?? 0;
      const processed = progress?.processed ?? 0;
      const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
      return (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-txt-primary">
            {t("settings.export_step_progress_title")}
          </h3>
          <div className="flex items-center gap-2 text-xs text-txt-secondary">
            <Spinner className="text-brand" size="sm" />
            <span>
              {t("settings.export_progress_messages", {
                processed: String(processed),
                total: String(total),
              })}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surf-tertiary overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: percent + "%",
                background: "var(--color-brand)",
                transition: "width 0.4s ease-out",
              }}
            />
          </div>
          <p className="text-xs text-txt-muted">
            {t("settings.export_progress_bytes_written", {
              bytes: format_bytes(progress?.bytes_written ?? 0),
            })}
          </p>
          <div className="flex justify-end pt-2">
            <Button
              size="md"
              variant="outline"
              onClick={handle_cancel_progress}
            >
              {t("settings.export_cancel")}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-txt-primary">
          {t("settings.export_step_complete_title")}
        </h3>
        <p className="text-xs text-txt-secondary">
          {t("settings.export_complete_summary", {
            count: String(summary?.processed ?? 0),
            total: String(summary?.total ?? 0),
          })}
        </p>
        <p className="text-xs text-txt-muted">
          {t("settings.export_complete_bytes", {
            bytes: format_bytes(summary?.bytes_written ?? 0),
          })}
        </p>
        {destination_label && (
          <p className="text-xs text-txt-muted">
            {t("settings.export_complete_location", {
              location: destination_label,
            })}
          </p>
        )}
        {summary && summary.errors.length > 0 && (
          <p className="text-xs text-red-500">
            {t("settings.export_complete_errors", {
              count: String(summary.errors.length),
            })}
          </p>
        )}
        <div className="flex justify-end pt-2">
          <Button size="md" variant="depth" onClick={handle_close}>
            {t("common.done")}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {is_open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && handle_close()}
          onKeyDown={(e) => e.key === "Escape" && handle_close()}
        >
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden="true"
            className="absolute inset-0 backdrop-blur-md"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            style={{ backgroundColor: "var(--modal-overlay)" }}
            transition={{ duration: reduce_motion ? 0 : 0.2 }}
            onClick={handle_close}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-modal="true"
            className="relative w-full max-w-md rounded-xl border overflow-hidden bg-modal-bg border-edge-primary"
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.97, y: 4 }}
            role="dialog"
            style={{ boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)" }}
            transition={{
              duration: reduce_motion ? 0 : 0.2,
              ease: [0.16, 1, 0.3, 1],
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <h2 className="text-[16px] font-semibold text-txt-primary">
                {t("settings.export_title")}
              </h2>
              {step !== "progress" && (
                <button
                  className="p-1 rounded-[14px] transition-colors hover:bg-white/10"
                  onClick={handle_close}
                >
                  <XMarkIcon className="w-5 h-5 text-txt-muted" />
                </button>
              )}
            </div>
            <div className="px-6 pb-6">{render_step()}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
