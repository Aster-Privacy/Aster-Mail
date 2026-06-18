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
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  SparklesIcon,
  LinkIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@aster/ui";
import { TurnstileWidget, type TurnstileWidgetRef, TURNSTILE_SITE_KEY } from "@/components/auth/turnstile_widget";
import { Spinner } from "@/components/ui/spinner";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { format_bytes } from "@/lib/utils";
import {
  list_reservations,
  create_reservation,
  check_address_availability,
  release_reservation,
  regenerate_claim_link,
  type ReservedAddress,
  type FamilyGroupResponse,
} from "@/services/api/family";

const DOMAINS = ["astermail.org", "aster.cx"];

type Availability = { state: "idle" | "checking" | "ok" | "bad"; reason?: string };

function claim_token_from_url(url?: string): string | null {
  if (!url) return null;
  const marker = "/family/claim/";
  const idx = url.indexOf(marker);
  return idx >= 0 ? url.slice(idx + marker.length) : null;
}

export function KidsContent({ group }: { group: FamilyGroupResponse }) {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const [reservations, set_reservations] = useState<ReservedAddress[]>([]);
  const [seats_used, set_seats_used] = useState(0);
  const [max_members, set_max_members] = useState(group.max_members);
  const [loading, set_loading] = useState(true);

  const [show_form, set_show_form] = useState(false);
  const [username, set_username] = useState("");
  const [domain, set_domain] = useState(DOMAINS[0]);
  const [nickname, set_nickname] = useState("");
  const default_alloc = Math.max(0, Math.floor(group.storage_pool_bytes / Math.max(1, group.max_members)));
  const [alloc, set_alloc] = useState(default_alloc);
  const [consent, set_consent] = useState(false);
  const [availability, set_availability] = useState<Availability>({ state: "idle" });
  const [captcha, set_captcha] = useState<string | null>(null);
  const [submitting, set_submitting] = useState(false);
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const turnstile_required = !!TURNSTILE_SITE_KEY;

  const allocated_in_pool = reservations
    .filter(r => r.status === "reserved")
    .reduce((s, r) => s + r.allocated_storage_bytes, 0);
  const pool_remaining = Math.max(0, group.storage_pool_bytes - group.storage_used_bytes - allocated_in_pool);
  const seats_full = seats_used >= max_members;

  const load = useCallback(async () => {
    set_loading(true);
    const r = await list_reservations();
    if (r.data) {
      set_reservations(r.data.reservations);
      set_seats_used(r.data.seats_used);
      set_max_members(r.data.max_members);
    } else if (r.error) {
      show_toast(t("settings.fam_kids_load_failed"), "error");
    }
    set_loading(false);
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const name = username.trim().toLowerCase();
    if (name.length < 3) {
      set_availability({ state: "idle" });
      return;
    }
    set_availability({ state: "checking" });
    const handle = setTimeout(async () => {
      const r = await check_address_availability(name, domain);
      if (r.data) {
        set_availability(r.data.available ? { state: "ok" } : { state: "bad", reason: r.data.reason });
      } else {
        set_availability({ state: "idle" });
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [username, domain]);

  const reset_form = () => {
    set_username("");
    set_nickname("");
    set_domain(DOMAINS[0]);
    set_alloc(default_alloc);
    set_consent(false);
    set_availability({ state: "idle" });
    set_captcha(null);
    turnstile_ref.current?.reset();
  };

  const can_submit =
    availability.state === "ok" &&
    consent &&
    !submitting &&
    !seats_full &&
    alloc <= pool_remaining &&
    (!turnstile_required || !!captcha);

  const handle_reserve = async () => {
    if (!consent) { show_toast(t("settings.fam_kids_consent_required"), "error"); return; }
    set_submitting(true);
    const r = await create_reservation({
      username: username.trim().toLowerCase(),
      email_domain: domain,
      label: nickname.trim() || undefined,
      allocated_storage_bytes: alloc,
      consent_attested: true,
      captcha_token: captcha ?? undefined,
    });
    set_submitting(false);
    if (r.data) {
      show_toast(t("settings.fam_kids_created"), "success");
      if (r.data.claim_url) {
        try { await navigator.clipboard.writeText(r.data.claim_url); show_toast(t("settings.fam_kids_link_copied"), "success"); } catch { /* clipboard blocked */ }
      }
      set_show_form(false);
      reset_form();
      void load();
    } else {
      show_toast(r.error || t("settings.fam_kids_create_failed"), "error");
      set_captcha(null);
      turnstile_ref.current?.reset();
    }
  };

  const handle_copy = async (url?: string) => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); show_toast(t("settings.fam_kids_link_copied"), "success"); } catch { /* clipboard blocked */ }
  };

  const handle_regenerate = async (id: string) => {
    const r = await regenerate_claim_link(id);
    if (r.data) {
      show_toast(t("settings.fam_kids_regenerated"), "success");
      await handle_copy(r.data.claim_url);
      void load();
    } else {
      show_toast(t("settings.fam_org_action_failed"), "error");
    }
  };

  const handle_release = async (id: string) => {
    if (!window.confirm(t("settings.fam_kids_release_confirm"))) return;
    const r = await release_reservation(id);
    if (!r.error) { show_toast(t("settings.fam_kids_released"), "success"); void load(); }
    else show_toast(t("settings.fam_org_action_failed"), "error");
  };

  const availability_hint = () => {
    if (availability.state === "checking") return <span className="text-txt-muted">{t("settings.fam_kids_checking")}</span>;
    if (availability.state === "ok") return <span className="text-green-500 flex items-center gap-1"><CheckCircleIcon className="w-3.5 h-3.5" />{t("settings.fam_kids_available")}</span>;
    if (availability.state === "bad") {
      const key = availability.reason === "reserved" ? "settings.fam_kids_reserved_taken" : availability.reason === "invalid" ? "settings.fam_kids_invalid" : "settings.fam_kids_taken";
      return <span className="text-red-500 flex items-center gap-1"><XCircleIcon className="w-3.5 h-3.5" />{t(key)}</span>;
    }
    return null;
  };

  const visible = reservations.filter(r => r.status === "reserved" || r.status === "claimed");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-1.5">
            <SparklesIcon className="w-4 h-4" /> {t("settings.fam_kids_title")}
          </h3>
          <p className="text-sm text-txt-secondary mt-0.5">{t("settings.fam_kids_subtitle")}</p>
          <p className="text-xs text-txt-muted mt-1">{t("settings.fam_kids_seats_used", { used: seats_used, max: max_members })}</p>
        </div>
        {!show_form && (
          <button
            onClick={() => set_show_form(true)}
            disabled={seats_full}
            className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
            title={seats_full ? t("settings.fam_kids_seats_full") : undefined}
          >
            <SparklesIcon className="w-4 h-4" /> {t("settings.fam_kids_reserve_btn")}
          </button>
        )}
      </div>

      {show_form && (
        <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-txt-secondary">{t("settings.fam_kids_username_label")}</label>
            <div className="flex items-stretch mt-1 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
              <input
                value={username}
                onChange={e => set_username(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())}
                placeholder={t("settings.fam_kids_username_ph")}
                maxLength={40}
                className="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm outline-none"
              />
              <Select value={domain} onValueChange={set_domain}>
                <SelectTrigger className="border-0 border-l border-black/10 dark:border-white/10 rounded-none bg-transparent h-auto shadow-none text-sm max-w-[150px] px-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOMAINS.map(d => <SelectItem key={d} value={d}>@{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs mt-1 min-h-[1rem]">{availability_hint()}</div>
          </div>

          <div>
            <label className="text-xs font-medium text-txt-secondary">{t("settings.fam_kids_nickname_label")}</label>
            <Input value={nickname} onChange={e => set_nickname(e.target.value)} maxLength={60} placeholder={t("settings.fam_kids_nickname_ph")} className="mt-1" />
          </div>

          <div>
            <label className="text-xs font-medium text-txt-secondary flex items-center justify-between">
              <span>{t("settings.fam_kids_storage_label")}</span>
              <span className="text-txt-muted">{format_bytes(alloc)} / {format_bytes(pool_remaining)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={pool_remaining}
              step={1024 * 1024 * 1024}
              value={Math.min(alloc, pool_remaining)}
              onChange={e => set_alloc(Number(e.target.value))}
              className="w-full mt-2 accent-[var(--accent-primary)]"
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <Switch checked={consent} onCheckedChange={set_consent} />
            <span className="text-xs text-txt-secondary leading-relaxed">{t("settings.fam_kids_consent_label")}</span>
          </label>

          <p className="text-xs text-txt-muted leading-relaxed">{t("settings.fam_kids_link_hint")}</p>

          {turnstile_required && (
            <TurnstileWidget
              ref={turnstile_ref}
              on_verify={set_captcha}
              on_expire={() => set_captcha(null)}
              class_name="flex justify-start"
            />
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={handle_reserve} disabled={!can_submit} className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50">
              {submitting ? <Spinner size="sm" /> : <SparklesIcon className="w-4 h-4" />}
              {submitting ? t("settings.fam_kids_creating") : t("settings.fam_kids_create")}
            </button>
            <button onClick={() => { set_show_form(false); reset_form(); }} className="aster_btn aster_btn_ghost aster_btn_sm">{t("settings.fam_kids_cancel")}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-txt-muted py-6 text-center">{t("settings.fam_kids_empty")}</p>
      ) : (
        <div className="space-y-2">
          {visible.map(r => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-black/10 dark:border-white/10 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-txt-primary truncate">{r.username}@{r.email_domain}</span>
                  {r.status === "reserved"
                    ? <span className="aster_badge aster_badge_amber">{t("settings.fam_kids_status_reserved")}</span>
                    : <span className="aster_badge aster_badge_green">{t("settings.fam_kids_status_claimed")}</span>}
                </div>
                <p className="text-xs text-txt-muted mt-0.5">
                  {r.status === "claimed" ? t("settings.fam_kids_claimed_active") : format_bytes(r.allocated_storage_bytes)}
                </p>
              </div>
              {r.status === "reserved" && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {claim_token_from_url(r.claim_url) && (
                    <button onClick={() => navigate(`/family/claim/${claim_token_from_url(r.claim_url)}`)} title={t("settings.fam_kids_setup_now")} className="p-1.5 rounded-lg hover:bg-surf-secondary text-txt-secondary">
                      <ArrowRightIcon className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => handle_copy(r.claim_url)} title={t("settings.fam_kids_copy_link")} className="p-1.5 rounded-lg hover:bg-surf-secondary text-txt-secondary">
                    <LinkIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => handle_regenerate(r.id)} title={t("settings.fam_kids_regenerate")} className="p-1.5 rounded-lg hover:bg-surf-secondary text-txt-secondary">
                    <ArrowPathIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => handle_release(r.id)} title={t("settings.fam_kids_release")} className="p-1.5 rounded-lg hover:bg-surf-secondary text-red-500">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
