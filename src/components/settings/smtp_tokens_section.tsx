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
  ArrowRightIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  list_smtp_tokens,
  revoke_smtp_token,
  type SmtpToken,
} from "@/services/api/smtp_tokens";
import { use_verified_domain_addresses } from "@/components/settings/hooks/use_verified_domain_addresses";
import { SmtpTokenCreateModal } from "@/components/settings/smtp_token_create_modal";
import { InfoPopover } from "@/components/ui/info_popover";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

function format_date_short(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SmtpTokensSection() {
  const { t } = use_i18n();
  const { limits, is_loading: plan_loading } = use_plan_limits();
  const { addresses, is_loading: addresses_loading } =
    use_verified_domain_addresses();
  const [tokens, set_tokens] = useState<SmtpToken[]>([]);
  const [tokens_loading, set_tokens_loading] = useState(true);
  const [revoking_id, set_revoking_id] = useState<string | null>(null);
  const [confirm_revoke_id, set_confirm_revoke_id] = useState<string | null>(
    null,
  );
  const [create_open, set_create_open] = useState(false);

  const load_tokens = useCallback(async () => {
    set_tokens_loading(true);
    try {
      const res = await list_smtp_tokens();

      set_tokens(res.data?.tokens ?? []);
    } finally {
      set_tokens_loading(false);
    }
  }, []);

  useEffect(() => {
    load_tokens();
  }, [load_tokens]);

  if (plan_loading && !limits) return null;
  const is_locked = !!limits && limits.plan_code === "free";

  const handle_revoke = async (id: string) => {
    set_confirm_revoke_id(null);
    set_revoking_id(id);
    try {
      await revoke_smtp_token(id);
      load_tokens();
    } finally {
      set_revoking_id(null);
    }
  };

  const confirm_token = tokens.find((tok) => tok.id === confirm_revoke_id);
  const has_addresses = addresses.length > 0;

  const header = (
    <div className="mb-4">
      <div className="flex items-center gap-1.5">
        <h3 className="text-base font-semibold text-txt-primary">
          {t("settings.smtp_tokens")}
        </h3>
        <InfoPopover
          description={t("settings.smtp_tokens_popover_description")}
          title={t("settings.smtp_tokens")}
        />
      </div>
      <div className="mt-2 h-px bg-edge-secondary" />
      <p className="text-sm text-txt-muted mt-2">
        {t("settings.smtp_tokens_description")}
      </p>
    </div>
  );

  if (is_locked) {
    return (
      <div className="space-y-5">
        {header}
        <div
          className="relative overflow-hidden rounded-2xl p-6"
          style={{ backgroundColor: "#1d4ed8" }}
        >
          <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-end gap-2 pointer-events-none">
            <KeyIcon className="w-20 h-20 text-white/20" />
          </div>
          <div className="relative z-10">
            <h3
              className="text-lg font-bold text-white mb-1 tracking-tight"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
            >
              {t("settings.smtp_tokens_upgrade_title")}
            </h3>
            <p
              className="text-sm text-blue-100/70 mb-5 max-w-[320px]"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}
            >
              {t("settings.smtp_tokens_upgrade_description")}
            </p>
            <button
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[14px] text-sm font-semibold bg-white text-blue-900"
              style={{
                boxShadow:
                  "0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.9) inset",
              }}
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("navigate-settings", { detail: "billing" }),
                )
              }
            >
              {t("settings.smtp_tokens_upgrade_cta")}
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!addresses_loading && !has_addresses) {
    return (
      <div className="space-y-5">
        {header}
        <div className="rounded-xl border border-edge-secondary bg-surf-primary px-6 py-10 text-center">
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.smtp_tokens_no_domain_title")}
          </p>
          <p className="text-sm text-txt-muted mt-1.5 max-w-[360px] mx-auto">
            {t("settings.smtp_tokens_no_domain_description")}
          </p>
          <Button
            className="mt-4"
            variant="depth"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("navigate-settings", { detail: "aliases" }),
              )
            }
          >
            {t("settings.smtp_tokens_add_domain_cta")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
        <div className="flex items-start gap-2.5">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-txt-primary">
              {t("settings.smtp_token_not_e2e_title")}
            </p>
            <p className="text-xs text-txt-muted leading-relaxed mt-1">
              {t("settings.smtp_token_not_e2e_body")}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          disabled={addresses_loading || !has_addresses}
          variant="depth"
          onClick={() => set_create_open(true)}
        >
          <PlusIcon className="w-4 h-4 mr-1.5" />
          {t("settings.smtp_token_generate")}
        </Button>
      </div>

      {tokens_loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div>
                  <Skeleton className="h-4 w-40 mb-1.5" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-txt-muted text-center py-6">
          {t("settings.smtp_tokens_empty")}
        </p>
      ) : (
        <div className="space-y-1">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between py-3 border-b last:border-b-0 border-edge-secondary"
            >
              <div className="flex items-center gap-3 min-w-0">
                <KeyIcon className="w-5 h-5 text-txt-muted flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-txt-primary truncate">
                    {token.name}
                  </p>
                  <p className="text-xs text-txt-muted mt-0.5 truncate">
                    {token.bound_address}
                  </p>
                  <p className="text-xs text-txt-muted mt-0.5">
                    {t("settings.trusted_devices_created")}{" "}
                    {format_date_short(token.created_at)}
                    {" · "}
                    {t("settings.smtp_token_last_used")}{" "}
                    {token.last_used_at
                      ? format_date_short(token.last_used_at)
                      : t("settings.smtp_token_never_used")}
                  </p>
                </div>
              </div>
              <Button
                className="flex-shrink-0 ml-3"
                disabled={revoking_id === token.id}
                size="sm"
                variant="destructive"
                onClick={() => set_confirm_revoke_id(token.id)}
              >
                {revoking_id === token.id ? (
                  <Spinner size="sm" />
                ) : (
                  t("settings.trusted_devices_revoke")
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("settings.trusted_devices_revoke")}
        is_open={confirm_revoke_id !== null}
        message={t("settings.smtp_token_revoke_message").replace(
          "{{ name }}",
          confirm_token?.name ?? "",
        )}
        on_cancel={() => set_confirm_revoke_id(null)}
        on_confirm={() => confirm_revoke_id && handle_revoke(confirm_revoke_id)}
        title={t("settings.smtp_token_revoke_title")}
        variant="danger"
      />

      <SmtpTokenCreateModal
        addresses={addresses}
        is_open={create_open}
        on_close={() => set_create_open(false)}
        on_created={load_tokens}
      />
    </div>
  );
}
