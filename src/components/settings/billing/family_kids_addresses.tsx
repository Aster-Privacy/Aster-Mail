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
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import {
  Island,
  IslandDivider,
  IslandEmpty,
  IslandRow,
  PillButton,
  Switch,
} from "@aster/ui";

import {
  FamilyCreateBar,
  FamilySkeletonRows,
  FamilyStatusText,
  family_row_icon,
  use_family_seat_breakdown,
} from "./family_section/family_ui";

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
import { ButtonSpinner } from "@/components/ui/spinner";
import { BillingSectionLabel } from "@/components/settings/billing/billing_layout";
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

type KidsSnapshot = {
  reservations: ReservedAddress[];
  seats_used: number;
  max_members: number;
  seat_breakdown: SeatBreakdown | null;
};

const kids_cache = new Map<string, KidsSnapshot>();

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
  const seat_breakdown_text = use_family_seat_breakdown();
  const navigate = useNavigate();
  const cached = kids_cache.get(group.id);
  const [reservations, set_reservations] = useState<ReservedAddress[]>(
    cached?.reservations ?? [],
  );
  const [seats_used, set_seats_used] = useState(cached?.seats_used ?? 0);
  const [max_members, set_max_members] = useState(
    cached?.max_members ?? group.max_members,
  );
  const [seat_breakdown, set_seat_breakdown] = useState<SeatBreakdown | null>(
    cached?.seat_breakdown ?? null,
  );
  const [loading, set_loading] = useState(!cached);

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

  const loaded_once_ref = useRef(!!cached);

  const load = useCallback(async () => {
    if (!loaded_once_ref.current) set_loading(true);
    set_load_failed(false);
    const r = await list_reservations();

    if (r.data) {
      set_reservations(r.data.reservations);
      set_seats_used(r.data.seats_used);
      set_max_members(r.data.max_members);
      set_seat_breakdown(r.data.seats ?? null);
      kids_cache.set(group.id, {
        reservations: r.data.reservations,
        seats_used: r.data.seats_used,
        max_members: r.data.max_members,
        seat_breakdown: r.data.seats ?? null,
      });
      loaded_once_ref.current = true;
    } else {
      set_load_failed(true);
      show_toast(t("settings.fam_kids_load_failed"), "error");
    }
    set_loading(false);
  }, [t, group.id]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const address_status =
    availability.state === "ok"
      ? "success"
      : availability.state === "bad"
        ? "error"
        : "default";

  const max_gib = Math.max(1, Math.floor(pool_remaining / GIB));
  const visible = reservations.filter(
    (r) => r.status === "reserved" || r.status === "claimed",
  );

  const availability_hint =
    availability.state === "checking"
      ? { color: "var(--text-muted)", text: t("settings.fam_kids_checking") }
      : availability.state === "ok"
        ? {
            color: "var(--color-success)",
            text: t("settings.fam_kids_available"),
          }
        : availability.state === "error"
          ? {
              color: "var(--text-muted)",
              text: t("common.something_went_wrong_try_again"),
            }
          : availability.state === "bad"
            ? {
                color: "var(--color-danger)",
                text: t(
                  availability.reason === "reserved"
                    ? "settings.fam_kids_reserved_taken"
                    : availability.reason === "invalid"
                      ? "settings.fam_kids_invalid"
                      : "settings.fam_kids_taken",
                ),
              }
            : null;

  const seats_description = seats_full
    ? t("settings.fam_kids_seats_full")
    : seat_breakdown
      ? `${t("settings.fam_kids_seats_used", {
          used: seats_used,
          max: max_members,
        })}. ${seat_breakdown_text(seat_breakdown)}`
      : t("settings.fam_kids_seats_used", {
          used: seats_used,
          max: max_members,
        });

  return (
    <div className="flex flex-col gap-4">
      {!show_form ? (
        <Island className="overflow-hidden" padding="none">
          <IslandRow
            chevron={!seats_full}
            description={seats_description}
            disabled={seats_full}
            icon={family_row_icon(PlusIcon)}
            label={t("settings.fam_kids_reserve_btn")}
            on_press={() => set_show_form(true)}
          />
        </Island>
      ) : (
        <div className="flex flex-col">
          <BillingSectionLabel>
            {t("settings.fam_kids_reserve_btn")}
          </BillingSectionLabel>
          <Island className="flex flex-col gap-5" padding="md">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <label
                  className="text-[13px] font-medium text-txt-primary"
                  htmlFor="kid-address"
                >
                  {t("settings.fam_kids_username_label")}
                </label>
                <InfoPopover
                  description={t("settings.fam_kids_info_desc")}
                  title={t("settings.fam_kids_info_title")}
                />
              </div>
              <FamilyCreateBar>
                <Input
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="aster_input_tonal sm:flex-1"
                  id="kid-address"
                  maxLength={40}
                  placeholder={t("settings.fam_kids_username_ph")}
                  spellCheck={false}
                  status={address_status}
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
                  <SelectTrigger className="rounded-[var(--aster-radius-field)] sm:w-44">
                    <span className="me-0.5 text-txt-muted">@</span>
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
              </FamilyCreateBar>
              {availability_hint && (
                <p
                  aria-live="polite"
                  className="text-[12.5px] leading-5"
                  style={{ color: availability_hint.color }}
                >
                  {availability_hint.text}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label
                className="text-[13px] font-medium text-txt-primary"
                htmlFor="kid-nickname"
              >
                {t("settings.fam_kids_nickname_label")}
              </label>
              <Input
                className="aster_input_tonal"
                id="kid-nickname"
                maxLength={60}
                placeholder={t("settings.fam_kids_nickname_ph")}
                value={nickname}
                onChange={(e) => set_nickname(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-txt-primary">
                  {t("settings.fam_kids_storage_label")}
                </span>
                <span className="text-[13px] tabular-nums text-txt-muted">
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

            <div
              className="flex items-start gap-3 rounded-[var(--aster-radius-field)] p-4"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--accent-color) 10%, transparent)",
              }}
            >
              <Switch
                aria-label={t("settings.fam_kids_consent_label")}
                checked={consent}
                size="lg"
                onCheckedChange={set_consent}
              />
              <span className="text-[13px] leading-5 text-txt-secondary">
                {t("settings.fam_kids_consent_label")}
              </span>
            </div>

            <p className="text-[12.5px] leading-5 text-txt-muted">
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

            <div className="flex flex-wrap items-center gap-2">
              <PillButton
                disabled={!can_submit}
                leading={
                  submitting ? (
                    <ButtonSpinner />
                  ) : (
                    <PlusIcon className="h-4 w-4" />
                  )
                }
                variant="filled"
                onClick={handle_reserve}
              >
                {submitting
                  ? t("settings.fam_kids_creating")
                  : t("settings.fam_kids_create")}
              </PillButton>
              <PillButton
                variant="ghost"
                onClick={() => {
                  set_show_form(false);
                  reset_form();
                }}
              >
                {t("settings.fam_kids_cancel")}
              </PillButton>
            </div>
          </Island>
        </div>
      )}

      <div className="flex flex-col">
        <BillingSectionLabel>
          {t("settings.fam_kids_title")}
        </BillingSectionLabel>
        {loading ? (
          <FamilySkeletonRows count={2} />
        ) : load_failed && reservations.length === 0 ? (
          <Island padding="lg">
            <IslandEmpty
              action={
                <PillButton
                  size="sm"
                  variant="tonal"
                  onClick={() => void load()}
                >
                  {t("common.retry")}
                </PillButton>
              }
              description={t("common.something_went_wrong_try_again")}
              icon={<ExclamationTriangleIcon />}
              title={t("settings.fam_kids_load_failed")}
            />
          </Island>
        ) : visible.length === 0 ? (
          <Island padding="lg">
            <IslandEmpty
              icon={<UserIcon />}
              title={t("settings.fam_kids_empty")}
            />
          </Island>
        ) : (
          <Island className="overflow-hidden" padding="none">
            {visible.map((r, index) => {
              const token = claim_token_from_url(r.claim_url);

              return (
                <div key={r.id}>
                  {index > 0 && <IslandDivider />}
                  <IslandRow
                    description={
                      r.status === "claimed"
                        ? t("settings.fam_kids_claimed_active")
                        : r.label
                          ? `${r.label} · ${format_bytes(r.allocated_storage_bytes)}`
                          : format_bytes(r.allocated_storage_bytes)
                    }
                    icon={family_row_icon(UserIcon)}
                    label={`${r.username}@${r.email_domain}`}
                    value={
                      r.status === "reserved" ? (
                        <FamilyStatusText tone="warning">
                          {t("settings.fam_kids_status_reserved")}
                        </FamilyStatusText>
                      ) : (
                        <FamilyStatusText tone="success">
                          {t("settings.fam_kids_status_claimed")}
                        </FamilyStatusText>
                      )
                    }
                  />
                  {r.status === "reserved" && (
                    <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
                      {token && (
                        <PillButton
                          leading={
                            <ArrowRightIcon className="h-4 w-4 rtl:-scale-x-100" />
                          }
                          size="sm"
                          variant="tonal"
                          onClick={() => navigate(`/family/claim/${token}`)}
                        >
                          {t("settings.fam_kids_setup_now")}
                        </PillButton>
                      )}
                      <PillButton
                        leading={<LinkIcon className="h-4 w-4" />}
                        size="sm"
                        variant="ghost"
                        onClick={() => handle_copy(r.claim_url)}
                      >
                        {t("settings.fam_kids_copy_link")}
                      </PillButton>
                      <PillButton
                        disabled={regenerating_id === r.id}
                        leading={
                          regenerating_id === r.id ? (
                            <ButtonSpinner />
                          ) : (
                            <ArrowPathIcon className="h-4 w-4" />
                          )
                        }
                        size="sm"
                        variant="ghost"
                        onClick={() => handle_regenerate(r.id)}
                      >
                        {t("settings.fam_kids_regenerate")}
                      </PillButton>
                      <PillButton
                        leading={<TrashIcon className="h-4 w-4" />}
                        size="sm"
                        variant="ghost"
                        className="!text-[var(--color-danger)]"
                        onClick={() =>
                          handle_release(
                            r.id,
                            `${r.username}@${r.email_domain}`,
                          )
                        }
                      >
                        {t("settings.fam_kids_release")}
                      </PillButton>
                    </div>
                  )}
                </div>
              );
            })}
          </Island>
        )}
      </div>

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
          <PillButton
            disabled={releasing}
            variant="ghost"
            onClick={() => set_release_target(null)}
          >
            {t("settings.fam_kids_cancel")}
          </PillButton>
          <PillButton
            disabled={releasing}
            leading={
              releasing ? <ButtonSpinner /> : <TrashIcon className="h-4 w-4" />
            }
            variant="danger"
            onClick={confirm_release}
          >
            {t("settings.fam_kids_release_btn")}
          </PillButton>
        </ModalFooter>
      </Modal>
    </div>
  );
}
