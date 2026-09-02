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
} from "@heroicons/react/24/outline";
import { Switch, Button } from "@aster/ui";

import { ConsentGateDialog } from "./filters";

import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { Input } from "@/components/ui/input";
import { InfoPopover } from "@/components/ui/info_popover";
import { Spinner } from "@/components/ui/spinner";
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
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";

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
    return <LoadFailedNotice on_retry={load_policy} />;
  }

  if (!policy) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-surf-tertiary border border-edge-secondary">
        <ShieldCheckIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
        <p className="text-xs text-txt-muted">
          {t("settings.fam_org_sec_member_notice")}
        </p>
      </div>
      <div className="divide-y divide-edge-secondary">
        <div className="flex items-center justify-between py-4">
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.fam_org_sec_require_2fa")}
          </p>
          <span
            className={
              policy.require_2fa
                ? "aster_badge aster_badge_green"
                : "aster_badge aster_badge_gray"
            }
          >
            {policy.require_2fa
              ? t("settings.fam_org_sec_confirm_on")
              : t("settings.fam_org_sec_confirm_off")}
          </span>
        </div>
        {policy.require_2fa && (
          <div className="flex items-center justify-between py-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.fam_org_sec_grace")}
            </p>
            <span className="text-sm text-txt-secondary">
              {policy.require_2fa_grace_days} {t("settings.fam_org_sec_days")}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between py-4">
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.fam_org_sec_max_sessions")}
          </p>
          <span className="text-sm text-txt-secondary">
            {policy.max_sessions_per_member ??
              t("settings.fam_org_sec_no_limit")}
          </span>
        </div>
        <div className="flex items-center justify-between py-4">
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.fam_org_sec_auto_signout")}
          </p>
          <span className="text-sm text-txt-secondary">
            {policy.session_timeout_hours
              ? `${policy.session_timeout_hours}h`
              : t("settings.fam_org_sec_never")}
          </span>
        </div>
      </div>
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
      <div className="text-center py-8">
        <p className="text-sm text-txt-secondary mb-3">
          {t("settings.fam_org_sec_load_failed")}
        </p>
        <Button size="sm" variant="outline" onClick={load_security}>
          {t("common.retry")}
        </Button>
      </div>
    ) : (
      <div className="flex justify-center items-center gap-2 py-8">
        <Spinner size="sm" />
        <span className="text-sm text-txt-muted">
          {t("settings.fam_org_sec_loading")}
        </span>
      </div>
    );

  const non_2fa = compliance.filter((m) => !m.has_2fa).length;
  const with_2fa = compliance.filter((m) => m.has_2fa).length;
  const total_members = compliance.length;

  return (
    <div className="space-y-4">
      {total_members > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-txt-primary font-medium">
              {t("settings.fam_org_2fa_summary", {
                withCount: with_2fa,
                total: total_members,
              })}
            </span>
            <span className="text-txt-muted text-xs font-semibold tabular-nums">
              {Math.round((with_2fa / total_members) * 100)}%
            </span>
          </div>
          <div className="w-full h-2 bg-edge-secondary rounded-full overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${non_2fa === 0 ? "bg-green-500" : "bg-amber-500"}`}
              style={{ width: `${(with_2fa / total_members) * 100}%` }}
            />
          </div>
        </div>
      )}
      {non_2fa > 0 && !banner_dismissed && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{
            background: "#ef4444",
            backgroundImage: "none",
            boxShadow: "none",
            border: "none",
          }}
        >
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 text-white" />
          <p className="text-sm font-semibold flex-1 min-w-0 text-white">
            {t("settings.fam_org_2fa_banner", { count: non_2fa })}
          </p>
          <button
            className="text-xs font-semibold text-white hover:underline flex-shrink-0 disabled:opacity-60 disabled:no-underline disabled:cursor-default"
            disabled={reminding || reminder_sent}
            onClick={async () => {
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
                  show_toast(
                    t("settings.fam_org_2fa_reminder_rate_limited"),
                    "info",
                  );
                } else {
                  show_toast(
                    t("settings.fam_org_2fa_reminder_failed"),
                    "error",
                  );
                }
              } catch {
                show_toast(t("settings.fam_org_2fa_reminder_failed"), "error");
              } finally {
                set_reminding(false);
              }
            }}
          >
            {reminding
              ? t("settings.fam_org_2fa_sending")
              : reminder_sent
                ? t("settings.fam_org_2fa_reminder_sent")
                : t("settings.fam_org_2fa_send_reminder")}
          </button>
          <button
            aria-label={t("settings.fam_org_2fa_dismiss")}
            className="p-0.5 text-white hover:opacity-70 flex-shrink-0"
            title={t("settings.fam_org_2fa_dismiss")}
            onClick={dismiss_banner}
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="divide-y divide-edge-secondary">
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
              {t("settings.fam_org_sec_require_2fa")}
              <InfoPopover
                description={t("settings.fam_org_sec_require_2fa_info_desc")}
                title={t("settings.fam_org_sec_require_2fa_info_title")}
              />
              {policy.require_2fa && (
                <span className="aster_badge aster_badge_green text-[10px]">
                  {t("settings.fam_org_sec_active")}
                </span>
              )}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.fam_org_sec_require_2fa_desc")}
            </p>
          </div>
          <Switch
            aria-label={t("settings.fam_org_sec_require_2fa")}
            checked={policy.require_2fa}
            size="lg"
            onCheckedChange={(val) => patch_draft({ require_2fa: val })}
          />
        </div>
        {policy.require_2fa && (
          <div className="flex items-center justify-between py-4">
            <div className="flex-1 pe-4">
              <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
                {t("settings.fam_org_sec_grace")}
                <InfoPopover
                  description={t("settings.fam_org_sec_grace_info_desc")}
                  title={t("settings.fam_org_sec_grace_info_title")}
                />
              </p>
              <p className="text-sm mt-0.5 text-txt-muted">
                {t("settings.fam_org_sec_grace_desc")}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Input
                className="w-16"
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
              <span className="text-xs text-txt-muted">
                {t("settings.fam_org_sec_days")}
              </span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
              {t("settings.fam_org_sec_max_sessions")}
              <InfoPopover
                description={t("settings.fam_org_sec_max_sessions_info_desc")}
                title={t("settings.fam_org_sec_max_sessions_info_title")}
              />
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.fam_org_sec_max_sessions_desc")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Input
              min="1"
              placeholder={t("settings.fam_org_sec_no_limit")}
              style={{ width: "4rem", flex: "0 0 auto" }}
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
            <span className="text-xs text-txt-muted">
              {t("settings.fam_org_sec_sessions")}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
              {t("settings.fam_org_sec_auto_signout")}
              <InfoPopover
                description={t("settings.fam_org_sec_auto_signout_info_desc")}
                title={t("settings.fam_org_sec_auto_signout_info_title")}
              />
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.fam_org_sec_auto_signout_desc")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Input
              min="1"
              placeholder={t("settings.fam_org_sec_never")}
              style={{ width: "4rem", flex: "0 0 auto" }}
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
            <span className="text-xs text-txt-muted">
              {t("settings.fam_org_sec_hours")}
            </span>
          </div>
        </div>
      </div>
      {(has_changes || saving) && (
        <div className="flex items-center justify-between gap-3 pt-1">
          {saving ? (
            <p className="flex items-center gap-1.5 text-xs text-txt-muted">
              <Spinner size="sm" /> {t("settings.fam_org_sec_saving")}
            </p>
          ) : (
            <p className="text-xs text-txt-muted">
              {consent_sent
                ? t("settings.fam_consent_sent_toast")
                : t("settings.fam_org_sec_unsaved")}
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="aster_btn aster_btn_ghost aster_btn_sm"
              disabled={saving}
              onClick={() => {
                set_consent_sent(false);
                set_draft(committed);
              }}
            >
              {t("settings.fam_org_sec_discard")}
            </button>
            {!consent_sent && (
              <button
                className="aster_btn aster_btn_primary aster_btn_sm"
                disabled={saving}
                onClick={
                  needs_consent
                    ? () => set_consent_open(true)
                    : () => set_confirm_open(true)
                }
              >
                {needs_consent
                  ? t("settings.fam_ret_request_consent")
                  : t("settings.fam_org_sec_apply")}
              </button>
            )}
          </div>
        </div>
      )}
      {confirm_open && draft && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center"
          onClick={() => set_confirm_open(false)}
        >
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative w-full max-w-sm rounded-xl border border-edge-primary bg-modal-bg p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-txt-primary mb-2">
              {t("settings.fam_org_sec_confirm_title")}
            </h3>
            <p className="text-sm text-txt-secondary mb-4">
              {t("settings.fam_org_sec_confirm_desc")}
            </p>
            <div className="space-y-1.5 mb-5 text-xs text-txt-muted">
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
              <button
                className="aster_btn aster_btn_ghost aster_btn_md flex-1"
                onClick={() => set_confirm_open(false)}
              >
                {t("settings.fam_org_sec_confirm_cancel")}
              </button>
              <button
                className="aster_btn aster_btn_primary aster_btn_md flex-1"
                onClick={do_save}
              >
                {t("settings.fam_org_sec_confirm_apply")}
              </button>
            </div>
          </div>
        </div>
      )}
      {compliance.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-txt-primary">
              {t("settings.fam_org_sec_compliance")}
            </h3>
            <div className="mt-2 h-px bg-edge-secondary" />
          </div>
          <div className="divide-y divide-edge-secondary">
            {compliance.map((m) => {
              return (
                <div key={m.user_id} className="flex items-center gap-3 py-3.5">
                  <ProfileAvatar
                    email={`${m.username}@${m.email_domain}`}
                    name={m.username}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-txt-primary truncate">
                      {m.username}@{m.email_domain}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {m.has_2fa ? (
                      <span className="aster_badge aster_badge_green">
                        {t("settings.fam_org_sec_2fa_badge")}
                      </span>
                    ) : (
                      <span className="aster_badge aster_badge_amber">
                        {t("settings.fam_org_sec_no_2fa_badge")}
                      </span>
                    )}
                    {m.imap_enabled && (
                      <span className="aster_badge aster_badge_gray">
                        {t("settings.fam_org_sec_imap_badge")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
