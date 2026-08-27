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
  UserIcon,
  PlusIcon,
  LinkIcon,
  TrashIcon,
  ArrowPathIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { Switch } from "@aster/ui";

import { copy_text_or_throw } from "@/utils/copy_text";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { InfoPopover } from "@/components/ui/info_popover";
import {
  TurnstileWidget,
  type TurnstileWidgetRef,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";
import { Spinner } from "@/components/ui/spinner";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { apply_input_transform } from "@/utils/input_transform";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";
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
  type SeatBreakdown,
} from "@/services/api/family";
import { use_sticky_value } from "@/hooks/use_sticky_value";

const DOMAINS = ["astermail.org", "aster.cx"];
const GIB = 1073741824;

type Availability = {
  state: "idle" | "checking" | "ok" | "bad" | "error";
  reason?: string;
};

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
  const [seat_breakdown, set_seat_breakdown] = useState<SeatBreakdown | null>(
    null,
  );
  const [loading, set_loading] = useState(true);

  const [show_form, set_show_form] = useState(false);
  const [username, set_username] = useState("");
  const [domain, set_domain] = useState(DOMAINS[0]);
  const [nickname, set_nickname] = useState("");
  const default_alloc = Math.max(
    0,
    Math.floor(group.storage_pool_bytes / Math.max(1, group.max_members)),
  );
  const [alloc, set_alloc] = useState(default_alloc);
  const [consent, set_consent] = useState(false);
  const [availability, set_availability] = useState<Availability>({
    state: "idle",
  });
  const [captcha, set_captcha] = useState<string | null>(null);
  const [submitting, set_submitting] = useState(false);
  const [release_target, set_release_target] = useState<{
    id: string;
    address: string;
  } | null>(null);
  const [releasing, set_releasing] = useState(false);
  const release_target_view = use_sticky_value(release_target);
  const [load_failed, set_load_failed] = useState(false);
  const [regenerating_id, set_regenerating_id] = useState<string | null>(null);
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const check_timeout_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const availability_request_ref = useRef(0);
  const turnstile_required = !!TURNSTILE_SITE_KEY;

  const allocated_in_pool = reservations
    .filter((r) => r.status === "reserved")
    .reduce((s, r) => s + r.allocated_storage_bytes, 0);
  const pool_remaining = Math.max(
    0,
    group.storage_pool_bytes - group.storage_used_bytes - allocated_in_pool,
  );
  const seats_full = seats_used >= max_members;

  useEffect(() => {
    set_alloc((prev) => Math.min(prev, pool_remaining));
  }, [pool_remaining]);

  const load = useCallback(async () => {
    set_loading(true);
    set_load_failed(false);
    const r = await list_reservations();

    if (r.data) {
      set_reservations(r.data.reservations);
      set_seats_used(r.data.seats_used);
      set_max_members(r.data.max_members);
      set_seat_breakdown(r.data.seats ?? null);
    } else {
      set_load_failed(true);
      show_toast(t("settings.fam_kids_load_failed"), "error");
    }
    set_loading(false);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced availability check - mirrors the alias address field one-to-one.
  useEffect(() => {
    if (check_timeout_ref.current) clearTimeout(check_timeout_ref.current);
    const name = username.trim().toLowerCase();

    if (name.length < 3) {
      availability_request_ref.current += 1;
      set_availability({ state: "idle" });

      return;
    }
    set_availability({ state: "checking" });
    check_timeout_ref.current = setTimeout(async () => {
      const request_id = ++availability_request_ref.current;
      const r = await check_address_availability(name, domain);

      if (request_id !== availability_request_ref.current) return;
      if (r.data) {
        set_availability(
          r.data.available
            ? { state: "ok" }
            : { state: "bad", reason: r.data.reason },
        );
      } else {
        set_availability({ state: "error" });
      }
    }, 400);

    return () => {
      if (check_timeout_ref.current) clearTimeout(check_timeout_ref.current);
    };
  }, [username, domain]);

  const reset_form = () => {
    set_username("");
    set_nickname("");
    set_domain(DOMAINS[0]);
    set_alloc(Math.min(default_alloc, pool_remaining));
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
    if (!consent) {
      show_toast(t("settings.fam_kids_consent_required"), "error");

      return;
    }
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
      let copied = false;

      if (r.data.claim_url) {
        try {
          await copy_text_or_throw(r.data.claim_url);
          copied = true;
        } catch {
          show_toast(t("common.failed_to_copy"), "error");
        }
      }
      show_toast(
        copied
          ? t("settings.fam_kids_created")
          : t("settings.fam_kids_address_reserved"),
        "success",
      );
      set_show_form(false);
      reset_form();
      void load();
    } else {
      show_toast(t("settings.fam_kids_create_failed"), "error");
      set_captcha(null);
      turnstile_ref.current?.reset();
    }
  };

  const handle_copy = async (url?: string) => {
    if (!url) return;
    try {
      await copy_text_or_throw(url);
      show_toast(t("settings.fam_kids_link_copied"), "success");
    } catch {
      show_toast(t("common.failed_to_copy"), "error");
    }
  };

  const handle_regenerate = async (id: string) => {
    if (regenerating_id) return;
    set_regenerating_id(id);
    try {
      const r = await regenerate_claim_link(id);

      if (r.data) {
        set_reservations((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, claim_url: r.data!.claim_url } : item,
          ),
        );
        try {
          await copy_text_or_throw(r.data.claim_url);
        } catch {
          show_toast(t("common.failed_to_copy"), "error");
        }
        show_toast(t("settings.fam_kids_regenerated"), "success");
      } else {
        show_toast(t("settings.fam_org_action_failed"), "error");
      }
    } finally {
      set_regenerating_id(null);
    }
  };

  const handle_release = (id: string, address: string) => {
    set_release_target({ id, address });
  };

  const confirm_release = async () => {
    if (!release_target) return;
    set_releasing(true);
    const r = await release_reservation(release_target.id);

    set_releasing(false);
    if (!r.error) {
      show_toast(t("settings.fam_kids_released"), "success");
      set_release_target(null);
      void load();
    } else {
      show_toast(t("settings.fam_org_action_failed"), "error");
    }
  };

  const address_border =
    availability.state === "ok"
      ? "border-green-500"
      : availability.state === "bad"
        ? "border-red-500"
        : "border-edge-secondary";

  const max_gib = Math.max(1, Math.floor(pool_remaining / GIB));
  const visible = reservations.filter(
    (r) => r.status === "reserved" || r.status === "claimed",
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-txt-primary flex items-center gap-1.5">
            <UserIcon className="w-4 h-4" /> {t("settings.fam_kids_title")}
          </h3>
          <p className="text-sm text-txt-secondary mt-0.5">
            {t("settings.fam_kids_subtitle")}
          </p>
          <p className="text-xs text-txt-muted mt-1">
            {t("settings.fam_kids_seats_used", {
              used: seats_used,
              max: max_members,
            })}
          </p>
          {seat_breakdown && (
            <p className="text-xs text-txt-muted mt-0.5">
              {t("settings.fam_seats_breakdown", {
                members: seat_breakdown.active_members,
                invites: seat_breakdown.pending_invites,
                reserved: seat_breakdown.reserved_addresses,
              })}
            </p>
          )}
        </div>
        {!show_form && (
          <button
            className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
            disabled={seats_full}
            title={seats_full ? t("settings.fam_kids_seats_full") : undefined}
            onClick={() => set_show_form(true)}
          >
            <PlusIcon className="w-4 h-4" />{" "}
            {t("settings.fam_kids_reserve_btn")}
          </button>
        )}
      </div>

      {show_form && (
        <div className="rounded-xl border border-edge-secondary p-4 space-y-5">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <label
                className="text-sm font-medium text-txt-primary"
                htmlFor="kid-address"
              >
                {t("settings.fam_kids_username_label")}
              </label>
              <InfoPopover
                description={t("settings.fam_kids_info_desc")}
                title={t("settings.fam_kids_info_title")}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                className={`flex-1 min-w-0 h-10 px-3 rounded-lg bg-transparent border text-sm text-txt-primary placeholder:text-txt-muted outline-none ${address_border}`}
                id="kid-address"
                maxLength={40}
                placeholder={t("settings.fam_kids_username_ph")}
                spellCheck={false}
                value={username}
                onChange={(e) =>
                  set_username(
                    apply_input_transform(e.target, (v) =>
                      v.toLowerCase().replace(/[^a-z0-9.]/g, ""),
                    ),
                  )
                }
              />
              <Select value={domain} onValueChange={set_domain}>
                <SelectTrigger className="h-10 w-auto shrink-0 rounded-lg border border-edge-secondary bg-transparent text-sm px-3 focus:ring-0 focus:ring-offset-0">
                  <span className="text-txt-muted me-0.5">@</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOMAINS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {availability.state === "checking" && (
              <p className="text-xs mt-1.5 text-txt-muted">
                {t("settings.fam_kids_checking")}
              </p>
            )}
            {availability.state === "ok" && (
              <p className="text-xs mt-1.5 text-green-500">
                {t("settings.fam_kids_available")}
              </p>
            )}
            {availability.state === "error" && (
              <p className="text-xs mt-1.5 text-txt-muted">
                {t("common.something_went_wrong_try_again")}
              </p>
            )}
            {availability.state === "bad" && (
              <p className="text-xs mt-1.5 text-red-500">
                {t(
                  availability.reason === "reserved"
                    ? "settings.fam_kids_reserved_taken"
                    : availability.reason === "invalid"
                      ? "settings.fam_kids_invalid"
                      : "settings.fam_kids_taken",
                )}
              </p>
            )}
          </div>

          <div>
            <label
              className="block text-sm font-medium text-txt-primary mb-2"
              htmlFor="kid-nickname"
            >
              {t("settings.fam_kids_nickname_label")}
            </label>
            <Input
              id="kid-nickname"
              maxLength={60}
              placeholder={t("settings.fam_kids_nickname_ph")}
              value={nickname}
              onChange={(e) => set_nickname(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-txt-primary">
                {t("settings.fam_kids_storage_label")}
              </label>
              <span className="text-xs tabular-nums text-txt-muted">
                {format_bytes(alloc)} / {format_bytes(pool_remaining)}
              </span>
            </div>
            <Slider
              max={max_gib}
              min={0}
              value={Math.min(Math.round(alloc / GIB), max_gib)}
              onChange={(v) => set_alloc(v * GIB)}
            />
          </div>

          <div className="flex items-end gap-3 rounded-lg bg-surf-secondary px-3 py-2.5">
            <Switch
              aria-label={t("settings.fam_kids_consent_label")}
              checked={consent}
              size="lg"
              onCheckedChange={set_consent}
            />
            <span className="text-xs text-txt-secondary leading-relaxed pb-0.5">
              {t("settings.fam_kids_consent_label")}
            </span>
          </div>

          <p className="text-xs text-txt-muted leading-relaxed">
            {t("settings.fam_kids_link_hint")}
          </p>

          {turnstile_required && (
            <TurnstileWidget
              ref={turnstile_ref}
              class_name="flex justify-start"
              on_expire={() => set_captcha(null)}
              on_verify={set_captcha}
            />
          )}

          <div className="flex gap-2 pt-1">
            <button
              className="aster_btn aster_btn_primary aster_btn_sm flex items-center gap-1.5 disabled:opacity-50"
              disabled={!can_submit}
              onClick={handle_reserve}
            >
              {submitting ? (
                <Spinner size="sm" />
              ) : (
                <PlusIcon className="w-4 h-4" />
              )}
              {submitting
                ? t("settings.fam_kids_creating")
                : t("settings.fam_kids_create")}
            </button>
            <button
              className="aster_btn aster_btn_ghost aster_btn_sm"
              onClick={() => {
                set_show_form(false);
                reset_form();
              }}
            >
              {t("settings.fam_kids_cancel")}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : load_failed && reservations.length === 0 ? (
        <LoadFailedNotice on_retry={() => void load()} />
      ) : visible.length === 0 ? (
        <div className="py-6 text-center">
          <UserIcon className="w-8 h-8 text-txt-muted mx-auto mb-2" />
          <p className="text-sm text-txt-muted">
            {t("settings.fam_kids_empty")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => {
            const token = claim_token_from_url(r.claim_url);

            return (
              <div
                key={r.id}
                className="rounded-xl border border-edge-secondary px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-txt-primary truncate">
                    {r.username}@{r.email_domain}
                  </span>
                  {r.status === "reserved" ? (
                    <span className="aster_badge aster_badge_amber">
                      {t("settings.fam_kids_status_reserved")}
                    </span>
                  ) : (
                    <span className="aster_badge aster_badge_green">
                      {t("settings.fam_kids_status_claimed")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-txt-muted mt-0.5">
                  {r.status === "claimed"
                    ? t("settings.fam_kids_claimed_active")
                    : format_bytes(r.allocated_storage_bytes)}
                </p>
                {r.status === "reserved" && (
                  <div className="flex items-center gap-1 flex-wrap mt-2.5">
                    {token && (
                      <button
                        className="aster_btn aster_btn_ghost aster_btn_sm flex items-center gap-1.5"
                        onClick={() => navigate(`/family/claim/${token}`)}
                      >
                        <ArrowRightIcon className="w-3.5 h-3.5 rtl:-scale-x-100" />{" "}
                        {t("settings.fam_kids_setup_now")}
                      </button>
                    )}
                    <button
                      className="aster_btn aster_btn_ghost aster_btn_sm flex items-center gap-1.5"
                      onClick={() => handle_copy(r.claim_url)}
                    >
                      <LinkIcon className="w-3.5 h-3.5" />{" "}
                      {t("settings.fam_kids_copy_link")}
                    </button>
                    <button
                      className="aster_btn aster_btn_ghost aster_btn_sm flex items-center gap-1.5 disabled:opacity-50"
                      disabled={regenerating_id === r.id}
                      onClick={() => handle_regenerate(r.id)}
                    >
                      <ArrowPathIcon className="w-3.5 h-3.5" />{" "}
                      {t("settings.fam_kids_regenerate")}
                    </button>
                    <button
                      className="aster_btn aster_btn_ghost aster_btn_sm flex items-center gap-1.5 text-red-500"
                      onClick={() =>
                        handle_release(r.id, `${r.username}@${r.email_domain}`)
                      }
                    >
                      <TrashIcon className="w-3.5 h-3.5" />{" "}
                      {t("settings.fam_kids_release")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        is_open={!!release_target}
        on_close={() => {
          if (!releasing) set_release_target(null);
        }}
        show_close_button={!releasing}
        size="sm"
      >
        <ModalHeader>
          <ModalTitle>{t("settings.fam_kids_release_modal_title")}</ModalTitle>
          <ModalDescription>
            {t("settings.fam_kids_release_modal_body", {
              address: release_target_view?.address ?? "",
            })}
          </ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <button
            className="aster_btn aster_btn_ghost aster_btn_sm"
            disabled={releasing}
            onClick={() => set_release_target(null)}
          >
            {t("settings.fam_kids_cancel")}
          </button>
          <button
            className="aster_btn aster_btn_destructive aster_btn_sm flex items-center gap-1.5 disabled:opacity-50"
            disabled={releasing}
            onClick={confirm_release}
          >
            {releasing ? (
              <Spinner size="sm" />
            ) : (
              <TrashIcon className="w-4 h-4" />
            )}
            {t("settings.fam_kids_release_btn")}
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
