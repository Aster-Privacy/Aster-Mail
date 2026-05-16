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
import type { DecryptedExternalAccount } from "@/services/api/external_accounts";

import { useState, useCallback, useEffect } from "react";
import {
  PlusIcon,
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
  EnvelopeIcon,
  ServerStackIcon,
  ArrowPathIcon,
  PencilIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Switch } from "@aster/ui";
import { Button } from "@aster/ui";

import { SettingsGroup, SettingsHeader, chip_selected_style } from "./shared";

import { get_favicon_url } from "@/lib/favicon_url";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  use_external_accounts,
  get_folder_depth,
} from "@/components/settings/hooks/use_external_accounts";
import {
  is_syncing as check_is_syncing,
  get_sync_progress_state,
} from "@/services/sync_manager";
import { TAG_COLOR_PRESETS } from "@/components/ui/email_tag";

export function ExternalAccountsSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const state = use_external_accounts();
  const [show_form, set_show_form] = useState(false);

  useEffect(() => {
    if (!state.show_add_form && !state.editing_account) {
      set_show_form(false);
    }
  }, [state.show_add_form, state.editing_account]);

  const open_form = useCallback(() => {
    state.open_add_form();
    set_show_form(true);
  }, [state.open_add_form]);

  const close_mobile_form = useCallback(() => {
    set_show_form(false);
    state.close_form();
  }, [state.close_form]);

  const start_edit = useCallback(
    (account: DecryptedExternalAccount) => {
      state.handle_edit(account);
      set_show_form(true);
    },
    [state.handle_edit],
  );

  if (state.is_loading) {
    return (
      <div className="flex h-full flex-col">
        <SettingsHeader
          on_back={on_back}
          on_close={on_close}
          title={state.t("settings.external_accounts")}
        />
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (show_form) {
    return (
      <div className="flex h-full flex-col">
        <SettingsHeader
          on_back={close_mobile_form}
          on_close={on_close}
          title={
            state.editing_account
              ? state.t("settings.edit_account")
              : state.t("settings.add_external_account")
          }
        />
        <div className="flex-1 overflow-y-auto pb-48">
          <SettingsGroup title={state.t("settings.account_info")}>
            <div className="space-y-3 px-4 py-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                  {state.t("settings.email_address")}
                </label>
                <Input
                  autoComplete="email"
                  className="w-full"
                  maxLength={254}
                  placeholder={state.t("settings.username_placeholder")}
                  type="email"
                  value={state.form_email}
                  onChange={(e) => state.handle_email_change(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                  {state.t("settings.display_name")}
                </label>
                <Input
                  autoComplete="name"
                  className="w-full"
                  maxLength={200}
                  placeholder={state.t("common.display_name_example")}
                  type="text"
                  value={state.form_display_name}
                  onChange={(e) => state.set_form_display_name(e.target.value)}
                />
              </div>
            </div>
          </SettingsGroup>

          <SettingsGroup title={state.t("settings.protocol")}>
            <div className="flex gap-2 px-4 py-3">
              <button
                className={`flex-1 rounded-[14px] py-2.5 text-center text-[14px] font-medium transition-colors ${
                  state.form_protocol === "imap"
                    ? "bg-[var(--accent-color,#3b82f6)] text-white"
                    : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                }`}
                type="button"
                onClick={() => state.handle_protocol_change("imap")}
              >
                IMAP
              </button>
              <button
                className={`flex-1 rounded-[14px] py-2.5 text-center text-[14px] font-medium transition-colors ${
                  state.form_protocol === "pop3"
                    ? "bg-[var(--accent-color,#3b82f6)] text-white"
                    : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                }`}
                type="button"
                onClick={() => state.handle_protocol_change("pop3")}
              >
                POP3
              </button>
            </div>
          </SettingsGroup>

          <SettingsGroup title={state.t("settings.incoming_mail")}>
            <div className="space-y-3 px-4 py-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                    {state.t("settings.server_host")}
                  </label>
                  <Input
                    autoComplete="off"
                    className="w-full"
                    maxLength={253}
                    placeholder={
                      state.form_protocol === "imap"
                        ? "imap.example.com"
                        : "pop.example.com"
                    }
                    type="text"
                    value={state.form_host}
                    onChange={(e) => state.handle_host_change(e.target.value)}
                  />
                </div>
                <div className="w-20">
                  <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                    {state.t("settings.port")}
                  </label>
                  <Input
                    className="w-full"
                    max={65535}
                    min={1}
                    type="number"
                    value={state.form_port}
                    onChange={(e) => state.handle_port_change(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                  {state.t("settings.username")}
                </label>
                <Input
                  autoComplete="username"
                  className="w-full"
                  maxLength={254}
                  placeholder={state.t("settings.username_placeholder")}
                  type="text"
                  value={state.form_username}
                  onChange={(e) => state.handle_username_change(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                  {state.t("settings.password")}
                </label>
                <div className="relative">
                  <Input
                    autoComplete="current-password"
                    className="w-full pr-10"
                    placeholder={
                      state.editing_account
                        ? state.t("settings.re_enter_password")
                        : ""
                    }
                    type={state.show_password ? "text" : "password"}
                    value={state.form_password}
                    onChange={(e) =>
                      state.handle_password_change(e.target.value)
                    }
                  />
                  <button
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1"
                    type="button"
                    onClick={() =>
                      state.set_show_password(!state.show_password)
                    }
                  >
                    {state.show_password ? (
                      <EyeSlashIcon className="h-4.5 w-4.5 text-[var(--text-muted)]" />
                    ) : (
                      <EyeIcon className="h-4.5 w-4.5 text-[var(--text-muted)]" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-[var(--text-primary)]">
                  {state.t("settings.use_tls")}
                </span>
                <Switch
                  checked={state.form_use_tls}
                  onCheckedChange={(checked) =>
                    state.set_form_use_tls(checked === true)
                  }
                />
              </div>
            </div>
          </SettingsGroup>

          <SettingsGroup title={state.t("settings.outgoing_mail_smtp")}>
            <div className="space-y-3 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-[var(--text-primary)]">
                  {state.t("settings.same_as_incoming")}
                </span>
                <Switch
                  checked={state.smtp_same_as_incoming}
                  onCheckedChange={(checked) =>
                    state.handle_smtp_same_toggle(checked)
                  }
                />
              </div>
              {!state.smtp_same_as_incoming && (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                        {state.t("settings.smtp_server_host")}
                      </label>
                      <Input
                        autoComplete="off"
                        className="w-full"
                        maxLength={253}
                        placeholder={state.t("settings.smtp_host_placeholder")}
                        type="text"
                        value={state.form_smtp_host}
                        onChange={(e) =>
                          state.handle_smtp_host_change(e.target.value)
                        }
                      />
                    </div>
                    <div className="w-20">
                      <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                        {state.t("settings.port")}
                      </label>
                      <Input
                        className="w-full"
                        max={65535}
                        min={1}
                        type="number"
                        value={state.form_smtp_port}
                        onChange={(e) =>
                          state.handle_smtp_port_change(e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                      {state.t("settings.smtp_username")}
                    </label>
                    <Input
                      autoComplete="username"
                      className="w-full"
                      maxLength={254}
                      placeholder={state.t("settings.username_placeholder")}
                      type="text"
                      value={state.form_smtp_username}
                      onChange={(e) =>
                        state.handle_smtp_username_change(e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                      {state.t("settings.smtp_password")}
                    </label>
                    <div className="relative">
                      <Input
                        autoComplete="current-password"
                        className="w-full pr-10"
                        placeholder={
                          state.editing_account
                            ? state.t("settings.re_enter_password")
                            : ""
                        }
                        type={state.show_smtp_password ? "text" : "password"}
                        value={state.form_smtp_password}
                        onChange={(e) =>
                          state.handle_smtp_password_change(e.target.value)
                        }
                      />
                      <button
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1"
                        type="button"
                        onClick={() =>
                          state.set_show_smtp_password(
                            !state.show_smtp_password,
                          )
                        }
                      >
                        {state.show_smtp_password ? (
                          <EyeSlashIcon className="h-4.5 w-4.5 text-[var(--text-muted)]" />
                        ) : (
                          <EyeIcon className="h-4.5 w-4.5 text-[var(--text-muted)]" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] text-[var(--text-primary)]">
                      {state.t("settings.use_tls")}
                    </span>
                    <Switch
                      checked={state.form_smtp_use_tls}
                      onCheckedChange={(checked) =>
                        state.set_form_smtp_use_tls(checked === true)
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </SettingsGroup>

          <SettingsGroup title={state.t("settings.label")}>
            <div className="space-y-3 px-4 py-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                  {state.t("settings.label_name")}
                </label>
                <Input
                  className="w-full"
                  maxLength={100}
                  placeholder={state.t("settings.label_name_placeholder")}
                  type="text"
                  value={state.form_label_name}
                  onChange={(e) => state.set_form_label_name(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                  {state.t("settings.label_color")}
                </label>
                <div className="flex flex-wrap gap-2.5 py-1">
                  {TAG_COLOR_PRESETS.map((color) => (
                    <button
                      key={color.hex}
                      className="h-8 w-8 rounded-full"
                      style={{
                        backgroundColor: color.hex,
                        boxShadow:
                          state.form_label_color.toLowerCase() === color.hex
                            ? `0 0 0 2px var(--bg-primary), 0 0 0 3.5px ${color.hex}`
                            : "none",
                      }}
                      type="button"
                      onClick={() => state.set_form_label_color(color.hex)}
                    />
                  ))}
                </div>
                <Input
                  className="mt-2 w-full font-mono"
                  maxLength={7}
                  placeholder="#000000"
                  type="text"
                  value={state.form_label_color}
                  onChange={(e) =>
                    state.handle_label_color_input(e.target.value)
                  }
                />
              </div>
            </div>
          </SettingsGroup>

          <SettingsGroup title={state.t("settings.sync_frequency")}>
            <div className="flex flex-wrap gap-2 px-4 py-3">
              {state.sync_frequency_options.map((opt) => (
                <button
                  key={opt.value}
                  className={`rounded-[14px] px-3.5 py-2 text-[13px] font-medium transition-colors ${
                    state.form_sync_frequency === opt.value
                      ? "text-white"
                      : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                  }`}
                  style={
                    state.form_sync_frequency === opt.value
                      ? chip_selected_style
                      : undefined
                  }
                  type="button"
                  onClick={() => state.set_form_sync_frequency(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </SettingsGroup>

          {state.form_protocol === "imap" && (
            <SettingsGroup title={state.t("settings.imap_folders")}>
              <div className="px-4 py-3">
                <Button
                  className="w-full gap-2"
                  disabled={state.is_fetching_folders}
                  variant="outline"
                  onClick={state.handle_fetch_folders}
                >
                  {state.is_fetching_folders ? (
                    <Spinner size="md" />
                  ) : (
                    <ArrowPathIcon className="h-4 w-4" />
                  )}
                  {state.t("settings.fetch_folders")}
                </Button>
                {state.truncated_folders.length > 0 && (
                  <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-[var(--border-primary)]">
                    {state.truncated_folders.map((folder) => {
                      const folder_path = folder.path || folder.name;
                      const depth = Math.min(
                        get_folder_depth(folder_path, folder.delimiter),
                        10,
                      );
                      const is_selected =
                        state.selected_folders.includes(folder_path);
                      const is_selectable = folder.is_selectable !== false;

                      return (
                        <button
                          key={folder_path}
                          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-[var(--mobile-bg-card-hover)]"
                          disabled={!is_selectable}
                          style={{ paddingLeft: `${12 + depth * 16}px` }}
                          type="button"
                          onClick={() =>
                            state.handle_folder_toggle(folder_path)
                          }
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${is_selected ? "border-[var(--accent-color,#3b82f6)] bg-[var(--accent-color,#3b82f6)]" : "border-[var(--border-primary)]"}`}
                          >
                            {is_selected && (
                              <CheckIcon
                                className="h-3 w-3 text-white"
                                strokeWidth={2.5}
                              />
                            )}
                          </span>
                          <span
                            className={`flex-1 truncate text-[14px] ${is_selectable ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
                          >
                            {folder.name}
                          </span>
                          {(folder.message_count ?? 0) > 0 && (
                            <span className="text-[11px] text-[var(--text-muted)]">
                              {folder.message_count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {state.available_folders.length === 0 && (
                  <p className="mt-2 text-[13px] text-[var(--text-muted)]">
                    {state.has_fetched_folders
                      ? state.t("settings.no_folders_found")
                      : state.t("settings.fetch_folders_instruction")}
                  </p>
                )}
              </div>
            </SettingsGroup>
          )}

          <div className="px-4 py-1.5">
            <button
              className="flex w-full items-center gap-2 rounded-[16px] bg-[var(--mobile-bg-card)] px-4 py-3.5 text-left"
              type="button"
              onClick={() => state.set_show_advanced(!state.show_advanced)}
            >
              <ChevronDownIcon
                className="h-4 w-4 text-[var(--text-muted)] transition-transform"
                style={{
                  transform: state.show_advanced
                    ? "rotate(180deg)"
                    : "rotate(0deg)",
                }}
              />
              <span className="flex-1 text-[15px] font-medium text-[var(--text-primary)]">
                {state.t("settings.advanced_settings")}
              </span>
            </button>
            {state.show_advanced && (
              <div className="mt-1 overflow-hidden rounded-2xl bg-[var(--mobile-bg-card)]">
                <div className="space-y-3 px-4 py-3">
                  <div>
                    <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-muted)]">
                      {state.t("settings.tls_method")}
                    </label>
                    <div className="flex gap-2">
                      {state.tls_method_options.map((opt) => (
                        <button
                          key={opt.value}
                          className={`flex-1 rounded-[14px] py-2 text-center text-[13px] font-medium transition-colors ${
                            state.form_tls_method === opt.value
                              ? "bg-[var(--accent-color,#3b82f6)] text-white"
                              : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                          }`}
                          type="button"
                          onClick={() => state.set_form_tls_method(opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
                      {state.t("settings.connection_timeout")}
                    </label>
                    <Input
                      className="w-24"
                      max={120}
                      min={5}
                      type="number"
                      value={state.form_connection_timeout}
                      onChange={(e) =>
                        state.handle_connection_timeout_change(e.target.value)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] text-[var(--text-primary)]">
                      {state.t("settings.archive_sent_label")}
                    </span>
                    <Switch
                      checked={state.form_archive_sent}
                      onCheckedChange={(checked) =>
                        state.set_form_archive_sent(checked === true)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[14px] ${state.form_delete_after_fetch ? "text-[var(--color-danger,#ef4444)]" : "text-[var(--text-primary)]"}`}
                    >
                      {state.t("settings.delete_after_fetch_label")}
                    </span>
                    <Switch
                      checked={state.form_delete_after_fetch}
                      onCheckedChange={(checked) =>
                        state.set_form_delete_after_fetch(checked === true)
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {state.test_result && (
            <div className="px-4 pt-2">
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px]"
                style={{
                  backgroundColor: state.test_result.success
                    ? "rgba(34,197,94,0.1)"
                    : "rgba(239,68,68,0.1)",
                  color: state.test_result.success
                    ? "rgb(34,197,94)"
                    : "rgb(239,68,68)",
                }}
              >
                {state.test_result.success ? (
                  <CheckCircleIcon className="h-4 w-4 shrink-0" />
                ) : (
                  <XCircleIcon className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  {state.form_protocol.toUpperCase()}:{" "}
                  {state.test_result.message}
                </span>
              </div>
            </div>
          )}

          {state.smtp_test_result && (
            <div className="px-4 pt-2">
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px]"
                style={{
                  backgroundColor: state.smtp_test_result.success
                    ? "rgba(34,197,94,0.1)"
                    : "rgba(239,68,68,0.1)",
                  color: state.smtp_test_result.success
                    ? "rgb(34,197,94)"
                    : "rgb(239,68,68)",
                }}
              >
                {state.smtp_test_result.success ? (
                  <CheckCircleIcon className="h-4 w-4 shrink-0" />
                ) : (
                  <XCircleIcon className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">
                  SMTP: {state.smtp_test_result.message}
                </span>
              </div>
            </div>
          )}
        </div>

        <div
          className="sticky bottom-0 z-10 border-t border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-3"
          style={{
            paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))",
          }}
        >
          <div className="flex gap-2 pb-2">
            <Button
              className="flex-1 gap-1.5"
              disabled={state.is_form_busy}
              size="md"
              variant="outline"
              onClick={state.handle_test_connection}
            >
              {state.is_testing ? (
                <Spinner size="md" />
              ) : (
                <ServerStackIcon className="h-4 w-4" />
              )}
              {state.t("settings.test_connection")}
            </Button>
            <Button
              className="flex-1 gap-1.5"
              disabled={state.is_form_busy}
              size="md"
              variant="outline"
              onClick={state.handle_test_smtp}
            >
              {state.is_testing_smtp ? (
                <Spinner size="md" />
              ) : (
                <EnvelopeIcon className="h-4 w-4" />
              )}
              {state.t("settings.test_smtp")}
            </Button>
          </div>
          <Button
            className="w-full"
            disabled={state.is_form_busy}
            onClick={state.handle_submit}
          >
            {state.is_submitting ? (
              <Spinner size="md" />
            ) : state.editing_account ? (
              state.t("settings.update_account_button")
            ) : (
              state.t("settings.save_account")
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={state.t("settings.external_accounts")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 pt-4 space-y-3">
          <p className="text-[14px] text-[var(--text-muted)]">
            {state.t("settings.external_accounts_description")}
          </p>
          {state.accounts.length < 5 && (
            <Button
              className="w-full gap-2"
              size="xl"
              variant="depth"
              onClick={open_form}
            >
              <PlusIcon className="h-4 w-4" />
              {state.t("settings.add_account")}
            </Button>
          )}
        </div>

        {state.accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 py-16">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
              <ServerStackIcon className="h-7 w-7 text-[var(--text-muted)]" />
            </div>
            <p className="text-[15px] font-medium text-[var(--text-primary)]">
              {state.t("settings.no_external_accounts")}
            </p>
            <p className="mt-1 text-center text-[13px] text-[var(--text-muted)]">
              {state.t("settings.no_external_accounts_description")}
            </p>
          </div>
        ) : (
          <div className="space-y-3 px-4 pt-4">
            {state.accounts.map((account) => {
              const domain = account.email.split("@")[1];
              const icon_ok = domain && !state.failed_icons.has(domain);
              const syncing = check_is_syncing(account.id);
              const progress = get_sync_progress_state(account.id);

              return (
                <div
                  key={account.id}
                  className="overflow-hidden rounded-2xl bg-[var(--mobile-bg-card)]"
                >
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    {icon_ok ? (
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full"
                        style={{
                          backgroundColor: account.is_enabled
                            ? `${account.label_color}20`
                            : "var(--bg-tertiary)",
                        }}
                      >
                        <img
                          alt=""
                          className="h-5 w-5 object-contain"
                          src={get_favicon_url(domain)}
                          onError={() =>
                            state.set_failed_icons(
                              (prev) => new Set([...prev, domain]),
                            )
                          }
                        />
                      </div>
                    ) : (
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: account.is_enabled
                            ? `${account.label_color}20`
                            : "var(--bg-tertiary)",
                        }}
                      >
                        <EnvelopeIcon
                          className="h-5 w-5"
                          style={{
                            color: account.is_enabled
                              ? account.label_color
                              : "var(--text-muted)",
                          }}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              account.last_sync_status === "success"
                                ? "rgb(34,197,94)"
                                : account.last_sync_status === "error"
                                  ? "rgb(239,68,68)"
                                  : "var(--text-muted)",
                          }}
                        />
                        <span className="truncate text-[15px] font-medium text-[var(--text-primary)]">
                          {account.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--text-muted)]">
                          {account.protocol}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: account.is_enabled
                              ? "rgba(34,197,94,0.1)"
                              : "var(--bg-tertiary)",
                            color: account.is_enabled
                              ? "rgb(34,197,94)"
                              : "var(--text-muted)",
                          }}
                        >
                          {account.is_enabled
                            ? state.t("common.active")
                            : state.t("common.paused")}
                        </span>
                        {account.email_count > 0 && (
                          <span className="text-[11px] text-[var(--text-muted)]">
                            {state.t("settings.email_count", {
                              count: String(account.email_count),
                            })}
                          </span>
                        )}
                      </div>
                      {(syncing || progress) && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <ArrowPathIcon className="h-3 w-3 animate-spin text-[var(--text-muted)]" />
                          <span className="text-[11px] text-[var(--text-muted)]">
                            {state.t("settings.syncing")}
                          </span>
                        </div>
                      )}
                      {!syncing && !progress && account.last_sync_at && (
                        <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                          {state.format_sync_time(account.last_sync_at)}
                        </span>
                      )}
                    </div>
                    <Switch
                      checked={account.is_enabled}
                      onCheckedChange={() => state.handle_toggle(account)}
                    />
                  </div>
                  <div className="flex border-t border-[var(--border-primary)]">
                    <button
                      className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[13px] text-[var(--text-secondary)] active:bg-[var(--mobile-bg-card-hover)] disabled:opacity-40"
                      disabled={syncing || !account.is_enabled}
                      type="button"
                      onClick={() => state.handle_sync(account)}
                    >
                      <ArrowPathIcon
                        className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
                      />
                      {state.t("common.sync")}
                    </button>
                    <button
                      className="flex flex-1 items-center justify-center gap-1.5 border-l border-[var(--border-primary)] py-2.5 text-[13px] text-[var(--text-secondary)] active:bg-[var(--mobile-bg-card-hover)]"
                      type="button"
                      onClick={() => start_edit(account)}
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                      {state.t("common.edit")}
                    </button>
                    <button
                      className="flex flex-1 items-center justify-center gap-1.5 border-l border-[var(--border-primary)] py-2.5 text-[13px] text-[var(--color-danger,#ef4444)] active:bg-[var(--mobile-bg-card-hover)]"
                      type="button"
                      onClick={() => state.set_purge_target(account)}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      {state.t("common.delete_mail")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ConfirmationModal
        cancel_text={state.t("common.cancel")}
        confirm_text={
          state.is_purging
            ? state.t("common.deleting")
            : state.t("common.delete_mail")
        }
        is_open={!!state.purge_target}
        message={state.t("settings.purge_confirm_message", {
          count: String(state.purge_target?.email_count ?? 0),
          email: state.purge_target?.email ?? state.t("settings.this_account"),
        })}
        on_cancel={() => state.set_purge_target(null)}
        on_confirm={state.handle_purge_confirm}
        title={state.t("common.delete_imported_emails")}
        variant="danger"
      />
    </div>
  );
}
