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
  XMarkIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ComputerDesktopIcon,
  ArrowRightStartOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { Island, IslandRow, PillButton } from "@aster/ui";

import { ConsentGateDialog, FamilyLoadFailed } from "./filters";
import {
  FamilySkeletonRows,
  FamilyStatusText,
  family_row_icon,
} from "./family_ui";

import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { Input } from "@/components/ui/input";
import { InfoPopover } from "@/components/ui/info_popover";
import { ButtonSpinner } from "@/components/ui/spinner";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  get_security_policy,
  update_security_policy,
  get_member_compliance,
  notify_non_compliant_2fa,
  type SecurityPolicy,
  type MemberComplianceInfo,
} from "@/services/api/family_org";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { parse_bounded_int } from "@/lib/parse_bounded_int";
import type {} from "@/lib/i18n/types";

import { ignore_error } from "@/lib/ignore_error";
import {
  BillingNotice,
  BillingSectionLabel,
} from "@/components/settings/billing/billing_layout";

export function MemberSecurityView() {
  const { t } = use_i18n();
  const [policy, set_policy] = useState<SecurityPolicy | null>(null);
  const [load_failed, set_load_failed] = useState(false);

  const load_policy = useCallback(() => {
    set_load_failed(false);
    get_security_policy()
      .then((r) => {
        if (r.data) set_policy(r.data);
        else set_load_failed(true);
      })
      .catch((caught) => {
        set_load_failed(true);
        ignore_error(
          "components/settings/billing/family_section/security:MemberSecurityView",
          caught,
        );
      });
  }, []);

  useEffect(() => {
    load_policy();
  }, [load_policy]);

  if (!policy && load_failed) {
    return <FamilyLoadFailed on_retry={load_policy} />;
  }

  if (!policy) return <FamilySkeletonRows count={3} />;

  return (
    <div className="flex flex-col gap-4">
      <p className="ms-1 text-[13px] leading-relaxed text-txt-muted">
        {t("settings.fam_org_sec_member_notice")}
      </p>
      <Island divided className="overflow-hidden" padding="none">
        <IslandRow
          icon={family_row_icon(ShieldCheckIcon)}
          label={t("settings.fam_org_sec_require_2fa")}
          value={
            <FamilyStatusText tone={policy.require_2fa ? "success" : "muted"}>
              {policy.require_2fa
                ? t("settings.fam_org_sec_confirm_on")
                : t("settings.fam_org_sec_confirm_off")}
            </FamilyStatusText>
          }
        />
        {policy.require_2fa && (
          <IslandRow
            icon={family_row_icon(ClockIcon)}
            label={t("settings.fam_org_sec_grace")}
            value={`${policy.require_2fa_grace_days} ${t("settings.fam_org_sec_days")}`}
          />
        )}
        <IslandRow
          icon={family_row_icon(ComputerDesktopIcon)}
          label={t("settings.fam_org_sec_max_sessions")}
          value={
            policy.max_sessions_per_member ?? t("settings.fam_org_sec_no_limit")
          }
        />
        <IslandRow
          icon={family_row_icon(ArrowRightStartOnRectangleIcon)}
          label={t("settings.fam_org_sec_auto_signout")}
          value={
            policy.session_timeout_hours
              ? `${policy.session_timeout_hours}h`
              : t("settings.fam_org_sec_never")
          }
        />
      </Island>
    </div>
  );
}

export function SecurityContent({
  other_member_count,
  initial_security,
  initial_compliance,
}: {
  other_member_count: number;
  initial_security?: SecurityPolicy | null;
  initial_compliance?: MemberComplianceInfo[] | null;
}) {
  const { t } = use_i18n();
  const [committed, set_committed] = useState<SecurityPolicy | null>(
    initial_security ?? null,
  );
  const [draft, set_draft] = useState<SecurityPolicy | null>(
    initial_security ?? null,
  );
  const [compliance, set_compliance] = useState<MemberComplianceInfo[]>(
    initial_compliance ?? [],
  );
  const [saving, set_saving] = useState(false);
  const [load_failed, set_load_failed] = useState(false);
  const [confirm_open, set_confirm_open] = useState(false);
  const [consent_open, set_consent_open] = useState(false);
  const [reminding, set_reminding] = useState(false);

  use_escape_layer(confirm_open, () => set_confirm_open(false));
  const [reminder_sent, set_reminder_sent] = useState(false);
  const [banner_dismissed, set_banner_dismissed] = useState(() => {
    try {
      return localStorage.getItem("aster_family_2fa_banner_dismissed") === "1";
    } catch {
      return false;
    }
  });

  const dismiss_banner = () => {
    try {
      localStorage.setItem("aster_family_2fa_banner_dismissed", "1");
    } catch (caught) {
      ignore_error(
        "components/settings/billing/family_section/security:dismiss_banner",
        caught,
      );
    }
    set_banner_dismissed(true);
  };

  const load_security = useCallback(() => {
    const on_failure = () => {
      set_load_failed(true);
      show_toast(t("settings.fam_org_sec_load_failed"), "error");
    };

    set_load_failed(false);

    get_security_policy()
      .then((r) => {
        if (r.data) {
          set_load_failed(false);
          set_committed(r.data);
          set_draft(r.data);
        } else {
          on_failure();
        }
      })
      .catch(on_failure);
  }, [t]);

  useEffect(() => {
    if (initial_security && initial_compliance) return;
    if (!initial_security) {
      load_security();
    }
    if (!initial_compliance) {
      get_member_compliance()
        .then((r) => {
          if (r.data) set_compliance(r.data);
        })
        .catch((caught) =>
          ignore_error(
            "components/settings/billing/family_section/security:apply_security_fallback",
            caught,
          ),
        );
    }
  }, []);

  const [consent_sent, set_consent_sent] = useState(false);

  const patch_draft = useCallback((p: Partial<SecurityPolicy>) => {
    set_consent_sent(false);
    set_draft((prev) => (prev ? { ...prev, ...p } : prev));
  }, []);

  const has_changes =
    committed && draft && JSON.stringify(committed) !== JSON.stringify(draft);

  const DATA_TOUCHING_FIELDS: (keyof SecurityPolicy)[] = [
    "require_2fa",
    "require_2fa_grace_days",
    "max_sessions_per_member",
    "session_timeout_hours",
    "block_external_forwarding",
  ];
  const has_data_touching_changes =
    committed &&
    draft &&
    DATA_TOUCHING_FIELDS.some((k) => committed[k] !== draft[k]);
  const needs_consent = other_member_count > 0 && !!has_data_touching_changes;

  const do_save = useCallback(async () => {
    if (!draft) return;
    set_saving(true);
    set_confirm_open(false);
    try {
      const r = await update_security_policy(draft);

      if (r.data) {
        set_committed(r.data);
        set_draft(r.data);
        set_consent_sent(false);
        show_toast(t("settings.fam_org_sec_saved"), "success");
      } else {
        show_toast(t("settings.fam_org_sec_save_failed"), "error");
      }
    } catch {
      show_toast(t("settings.fam_org_sec_save_failed"), "error");
    } finally {
      set_saving(false);
    }
  }, [draft, t]);

  const policy = draft;

  if (!policy)
    return load_failed ? (
      <FamilyLoadFailed on_retry={load_security} />
    ) : (
      <FamilySkeletonRows count={4} />
    );

  const non_2fa = compliance.filter((m) => !m.has_2fa).length;
  const with_2fa = compliance.filter((m) => m.has_2fa).length;
  const total_members = compliance.length;

  const send_reminder = async () => {
    if (reminding) return;
    set_reminding(true);
    try {
      const r = await notify_non_compliant_2fa();

      if (r.data != null) {
        set_reminder_sent(true);
        show_toast(
          t("settings.fam_org_2fa_reminder_sent_toast", {
            count: r.data.notified,
          }),
          "success",
        );
      } else if (r.code === "RATE_LIMIT_EXCEEDED") {
        set_reminder_sent(true);
        show_toast(t("settings.fam_org_2fa_reminder_rate_limited"), "info");
      } else {
        show_toast(t("settings.fam_org_2fa_reminder_failed"), "error");
      }
    } catch {
      show_toast(t("settings.fam_org_2fa_reminder_failed"), "error");
    } finally {
      set_reminding(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {total_members > 0 && (
        <Island className="flex flex-col gap-2.5" padding="md">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-txt-primary">
              {t("settings.fam_org_2fa_summary", {
                withCount: with_2fa,
                total: total_members,
              })}
            </span>
            <span className="text-[12.5px] font-semibold tabular-nums text-txt-muted">
              {Math.round((with_2fa / total_members) * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(with_2fa / total_members) * 100}%`,
                backgroundColor:
                  non_2fa === 0
                    ? "var(--color-success)"
                    : "var(--color-warning)",
              }}
            />
          </div>
        </Island>
      )}
      {non_2fa > 0 && !banner_dismissed && (
        <BillingNotice
          icon={ExclamationTriangleIcon}
          role="alert"
          title={t("settings.fam_org_2fa_banner", { count: non_2fa })}
          tone="warning"
        >
          <PillButton
            disabled={reminding || reminder_sent}
            leading={reminding ? <ButtonSpinner /> : undefined}
            size="sm"
            type="button"
            variant="tonal"
            onClick={send_reminder}
          >
            {reminding
              ? t("settings.fam_org_2fa_sending")
              : reminder_sent
                ? t("settings.fam_org_2fa_reminder_sent")
                : t("settings.fam_org_2fa_send_reminder")}
          </PillButton>
          <PillButton
            leading={<XMarkIcon className="h-4 w-4" />}
            size="sm"
            type="button"
            variant="ghost"
            onClick={dismiss_banner}
          >
            {t("settings.fam_org_2fa_dismiss")}
          </PillButton>
        </BillingNotice>
      )}
      <Island divided className="overflow-hidden" padding="none">
        <IslandRow
          description={t("settings.fam_org_sec_require_2fa_desc")}
          icon={family_row_icon(ShieldCheckIcon)}
          label={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {t("settings.fam_org_sec_require_2fa")}
              <InfoPopover
                description={t("settings.fam_org_sec_require_2fa_info_desc")}
                title={t("settings.fam_org_sec_require_2fa_info_title")}
              />
            </span>
          }
          toggle={{
            checked: policy.require_2fa,
            aria_label: t("settings.fam_org_sec_require_2fa"),
            on_change: (val) => patch_draft({ require_2fa: val }),
          }}
        />
        {policy.require_2fa && (
          <IslandRow
            description={t("settings.fam_org_sec_grace_desc")}
            icon={family_row_icon(ClockIcon)}
            label={
              <span className="inline-flex items-center gap-1.5">
                {t("settings.fam_org_sec_grace")}
                <InfoPopover
                  description={t("settings.fam_org_sec_grace_info_desc")}
                  title={t("settings.fam_org_sec_grace_info_title")}
                />
              </span>
            }
            trailing={
              <span className="flex flex-shrink-0 items-center gap-2">
                <Input
                  aria-label={t("settings.fam_org_sec_grace")}
                  className="aster_input_tonal w-20"
                  max="30"
                  min="0"
                  type="number"
                  value={policy.require_2fa_grace_days}
                  onChange={(e) =>
                    patch_draft({
                      require_2fa_grace_days:
                        parse_bounded_int(e.target.value, 0, 30) ?? 0,
                    })
                  }
                />
                <span className="text-[12.5px] text-txt-muted">
                  {t("settings.fam_org_sec_days")}
                </span>
              </span>
            }
          />
        )}
        <IslandRow
          description={t("settings.fam_org_sec_max_sessions_desc")}
          icon={family_row_icon(ComputerDesktopIcon)}
          label={
            <span className="inline-flex items-center gap-1.5">
              {t("settings.fam_org_sec_max_sessions")}
              <InfoPopover
                description={t("settings.fam_org_sec_max_sessions_info_desc")}
                title={t("settings.fam_org_sec_max_sessions_info_title")}
              />
            </span>
          }
          trailing={
            <span className="flex flex-shrink-0 items-center gap-2">
              <Input
                aria-label={t("settings.fam_org_sec_max_sessions")}
                className="aster_input_tonal w-20"
                min="1"
                placeholder={t("settings.fam_org_sec_no_limit")}
                type="number"
                value={policy.max_sessions_per_member ?? ""}
                onChange={(e) =>
                  patch_draft({
                    max_sessions_per_member: parse_bounded_int(
                      e.target.value,
                      1,
                      100,
                    ),
                  })
                }
              />
              <span className="text-[12.5px] text-txt-muted">
                {t("settings.fam_org_sec_sessions")}
              </span>
            </span>
          }
        />
        <IslandRow
          description={t("settings.fam_org_sec_auto_signout_desc")}
          icon={family_row_icon(ArrowRightStartOnRectangleIcon)}
          label={
            <span className="inline-flex items-center gap-1.5">
              {t("settings.fam_org_sec_auto_signout")}
              <InfoPopover
                description={t("settings.fam_org_sec_auto_signout_info_desc")}
                title={t("settings.fam_org_sec_auto_signout_info_title")}
              />
            </span>
          }
          trailing={
            <span className="flex flex-shrink-0 items-center gap-2">
              <Input
                aria-label={t("settings.fam_org_sec_auto_signout")}
                className="aster_input_tonal w-20"
                min="1"
                placeholder={t("settings.fam_org_sec_never")}
                type="number"
                value={policy.session_timeout_hours ?? ""}
                onChange={(e) =>
                  patch_draft({
                    session_timeout_hours: parse_bounded_int(
                      e.target.value,
                      1,
                      8760,
                    ),
                  })
                }
              />
              <span className="text-[12.5px] text-txt-muted">
                {t("settings.fam_org_sec_hours")}
              </span>
            </span>
          }
        />
      </Island>
      {(has_changes || saving) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="ms-1 text-[12.5px] text-txt-muted">
            {saving
              ? t("settings.fam_org_sec_saving")
              : consent_sent
                ? t("settings.fam_consent_sent_toast")
                : t("settings.fam_org_sec_unsaved")}
          </p>
          <div className="flex gap-2">
            <PillButton
              disabled={saving}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                set_consent_sent(false);
                set_draft(committed);
              }}
            >
              {t("settings.fam_org_sec_discard")}
            </PillButton>
            {!consent_sent && (
              <PillButton
                disabled={saving}
                leading={saving ? <ButtonSpinner /> : undefined}
                size="sm"
                type="button"
                onClick={
                  needs_consent
                    ? () => set_consent_open(true)
                    : () => set_confirm_open(true)
                }
              >
                {needs_consent
                  ? t("settings.fam_ret_request_consent")
                  : t("settings.fam_org_sec_apply")}
              </PillButton>
            )}
          </div>
        </div>
      )}
      {confirm_open && draft && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center"
          onClick={() => set_confirm_open(false)}
        >
          <div className="absolute inset-0 aster_scrim" />
          <div
            className="relative w-full max-w-sm rounded-[var(--aster-radius-floating,16px)] bg-[var(--aster-floating-bg,var(--modal-bg))] p-6 shadow-[var(--aster-floating-shadow)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-base font-semibold text-txt-primary">
              {t("settings.fam_org_sec_confirm_title")}
            </h3>
            <p className="mb-4 text-sm text-txt-secondary">
              {t("settings.fam_org_sec_confirm_desc")}
            </p>
            <div className="mb-5 flex flex-col gap-1.5 text-[12.5px] text-txt-muted">
              {committed && draft.require_2fa !== committed.require_2fa && (
                <p>
                  - {t("settings.fam_org_sec_require_2fa")}:{" "}
                  <span className="font-medium text-txt-primary">
                    {draft.require_2fa
                      ? t("settings.fam_org_sec_confirm_on")
                      : t("settings.fam_org_sec_confirm_off")}
                  </span>
                </p>
              )}
              {committed &&
                draft.max_sessions_per_member !==
                  committed.max_sessions_per_member && (
                  <p>
                    - {t("settings.fam_org_sec_max_sessions")}:{" "}
                    <span className="font-medium text-txt-primary">
                      {draft.max_sessions_per_member ??
                        t("settings.fam_org_sec_no_limit")}
                    </span>
                  </p>
                )}
              {committed &&
                draft.session_timeout_hours !==
                  committed.session_timeout_hours && (
                  <p>
                    - {t("settings.fam_org_sec_auto_signout")}:{" "}
                    <span className="font-medium text-txt-primary">
                      {draft.session_timeout_hours
                        ? `${draft.session_timeout_hours}h`
                        : t("settings.fam_org_sec_never")}
                    </span>
                  </p>
                )}
            </div>
            <div className="flex gap-2">
              <PillButton
                className="flex-1"
                type="button"
                variant="tonal"
                onClick={() => set_confirm_open(false)}
              >
                {t("settings.fam_org_sec_confirm_cancel")}
              </PillButton>
              <PillButton className="flex-1" type="button" onClick={do_save}>
                {t("settings.fam_org_sec_confirm_apply")}
              </PillButton>
            </div>
          </div>
        </div>
      )}
      {compliance.length > 0 && (
        <div className="flex flex-col">
          <BillingSectionLabel>
            {t("settings.fam_org_sec_compliance")}
          </BillingSectionLabel>
          <Island divided className="overflow-hidden" padding="none">
            {compliance.map((m) => (
              <IslandRow
                key={m.user_id}
                description={
                  m.imap_enabled
                    ? t("settings.fam_org_sec_imap_badge")
                    : undefined
                }
                icon={
                  <ProfileAvatar
                    email={`${m.username}@${m.email_domain}`}
                    name={m.username}
                    size="xs"
                  />
                }
                label={
                  <span className="block truncate">
                    {m.username}@{m.email_domain}
                  </span>
                }
                value={
                  m.has_2fa ? (
                    <FamilyStatusText tone="success">
                      {t("settings.fam_org_sec_2fa_badge")}
                    </FamilyStatusText>
                  ) : (
                    <FamilyStatusText tone="warning">
                      {t("settings.fam_org_sec_no_2fa_badge")}
                    </FamilyStatusText>
                  )
                }
              />
            ))}
          </Island>
        </div>
      )}
      <ConsentGateDialog
        description={t("settings.fam_consent_security_desc")}
        kind="security_policy"
        member_count={other_member_count}
        on_close={() => set_consent_open(false)}
        on_sent={() => set_consent_sent(true)}
        open={consent_open}
        payload={draft}
      />
    </div>
  );
}
