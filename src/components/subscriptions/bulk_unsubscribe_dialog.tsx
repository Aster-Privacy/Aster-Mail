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
import type { CachedSubscription } from "@/services/subscription_cache";
import type { BulkUnsubscribeSummary } from "@/hooks/use_subscriptions";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_external_link } from "@/contexts/external_link_context";
import { safe_sender_name } from "@/lib/sender_trust_store";
import {
  get_manual_unsubscribe_url,
  unsubscribe_info_from_stored,
} from "@/utils/unsubscribe_detector";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert_dialog";

export type BulkUnsubscribePhase = "confirm" | "running" | "pages" | "summary";

interface BulkUnsubscribeDialogProps {
  senders: CachedSubscription[];
  start_phase: "confirm" | "pages";
  run_bulk: (
    sender_emails: string[],
    on_progress?: (done: number, total: number) => void,
    signal?: AbortSignal,
  ) => Promise<BulkUnsubscribeSummary>;
  mark_unsubscribed: (sender_email: string) => Promise<boolean>;
  on_close: (remaining: string[]) => void;
}

interface Tally {
  automatic: number;
  website: number;
  skipped: number;
  failed: number;
}

const EMPTY_TALLY: Tally = { automatic: 0, website: 0, skipped: 0, failed: 0 };

export function is_automatic_unsubscribe(sub: CachedSubscription): boolean {
  const info = unsubscribe_info_from_stored(sub);

  return Boolean(
    (info.method === "one-click" && info.unsubscribe_link) ||
    info.unsubscribe_mailto,
  );
}

export function manual_page_url(sub: CachedSubscription): string {
  return get_manual_unsubscribe_url(unsubscribe_info_from_stored(sub));
}

function host_of(url: string): string {
  if (url.toLowerCase().startsWith("mailto:")) {
    return url.slice(7).split("?")[0];
  }
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function BulkUnsubscribeDialog({
  senders,
  start_phase,
  run_bulk,
  mark_unsubscribed,
  on_close,
}: BulkUnsubscribeDialogProps) {
  const { t } = use_i18n();
  const { handle_external_link } = use_external_link();
  const [phase, set_phase] = useState<BulkUnsubscribePhase>(start_phase);
  const [progress, set_progress] = useState<[number, number]>([0, 0]);
  const [queue, set_queue] = useState<string[]>(() =>
    start_phase === "pages" ? senders.map((s) => s.sender_email) : [],
  );
  const [position, set_position] = useState(0);
  const [opened, set_opened] = useState(false);
  const [is_marking, set_is_marking] = useState(false);
  const [tally, set_tally] = useState<Tally>(EMPTY_TALLY);
  const unsubscribed_ref = useRef<Set<string>>(new Set());
  const abort_ref = useRef<AbortController | null>(null);
  const stopped_ref = useRef(false);
  const closed_ref = useRef(false);
  const open_button_ref = useRef<HTMLButtonElement | null>(null);

  const by_email = useMemo(
    () => new Map(senders.map((s) => [s.sender_email, s])),
    [senders],
  );

  const page_only_count = useMemo(
    () =>
      senders.filter((s) => !is_automatic_unsubscribe(s) && manual_page_url(s))
        .length,
    [senders],
  );

  const finish = useCallback(() => {
    if (closed_ref.current) return;
    closed_ref.current = true;
    abort_ref.current?.abort();
    on_close(
      senders
        .map((s) => s.sender_email)
        .filter((email) => !unsubscribed_ref.current.has(email)),
    );
  }, [on_close, senders]);

  useEffect(
    () => () => {
      abort_ref.current?.abort();
    },
    [],
  );

  const single_page_flow = start_phase === "pages" && senders.length === 1;

  const advance = useCallback(
    (next_tally: Tally) => {
      set_tally(next_tally);
      set_opened(false);
      if (position + 1 < queue.length) {
        set_position(position + 1);

        return;
      }
      if (single_page_flow) {
        finish();

        return;
      }
      set_phase("summary");
    },
    [position, queue.length, single_page_flow, finish],
  );

  const handle_start = useCallback(async () => {
    const controller = new AbortController();

    abort_ref.current = controller;
    stopped_ref.current = false;
    set_progress([0, senders.length]);
    set_phase("running");

    const summary = await run_bulk(
      senders.map((s) => s.sender_email),
      (done, total) => set_progress([done, total]),
      controller.signal,
    );

    if (closed_ref.current) return;

    for (const email of summary.unsubscribed) {
      unsubscribed_ref.current.add(email);
    }

    const base: Tally = {
      automatic: summary.unsubscribed.length,
      website: 0,
      skipped: 0,
      failed: summary.failed.length,
    };

    if (stopped_ref.current || summary.needs_page.length === 0) {
      set_tally({ ...base, skipped: summary.needs_page.length });
      set_phase("summary");

      return;
    }

    set_tally(base);
    set_queue(summary.needs_page);
    set_position(0);
    set_opened(false);
    set_phase("pages");
  }, [run_bulk, senders]);

  const handle_stop_running = useCallback(() => {
    stopped_ref.current = true;
    abort_ref.current?.abort();
  }, []);

  const current_email = queue[position];
  const current_sub = current_email ? by_email.get(current_email) : undefined;
  const current_url = current_sub ? manual_page_url(current_sub) : "";

  const handle_open_page = useCallback(() => {
    if (!current_url) return;
    handle_external_link(
      current_url,
      (was_opened) => {
        if (was_opened) set_opened(true);
      },
      null,
      open_button_ref.current,
      "unsubscribe",
    );
  }, [current_url, handle_external_link]);

  const handle_skip = useCallback(() => {
    advance({ ...tally, skipped: tally.skipped + 1 });
  }, [advance, tally]);

  const handle_mark_done = useCallback(async () => {
    if (!current_email || is_marking) return;
    set_is_marking(true);
    const saved = await mark_unsubscribed(current_email);

    set_is_marking(false);
    if (closed_ref.current) return;
    if (saved) {
      unsubscribed_ref.current.add(current_email);
      advance({ ...tally, website: tally.website + 1 });
    } else {
      advance({ ...tally, failed: tally.failed + 1 });
    }
  }, [advance, current_email, is_marking, mark_unsubscribed, tally]);

  const handle_stop_pages = useCallback(() => {
    if (single_page_flow) {
      finish();

      return;
    }
    set_tally({
      ...tally,
      skipped: tally.skipped + (queue.length - position),
    });
    set_phase("summary");
  }, [finish, position, queue.length, single_page_flow, tally]);

  const handle_dismiss = useCallback(() => {
    if (phase === "running") {
      handle_stop_running();

      return;
    }
    if (phase === "pages") {
      handle_stop_pages();

      return;
    }
    finish();
  }, [finish, handle_stop_pages, handle_stop_running, phase]);

  const position_label = (current: number, total: number) =>
    t("settings.bulk_unsubscribe_position", { current, total });

  const summary_rows: Array<[string, number]> = [
    [t("settings.bulk_unsubscribe_summary_automatic"), tally.automatic],
    [t("settings.bulk_unsubscribe_summary_website"), tally.website],
    [t("settings.bulk_unsubscribe_summary_skipped"), tally.skipped],
    [t("settings.bulk_unsubscribe_summary_failed"), tally.failed],
  ];
  const shown_rows = summary_rows.filter(([, count]) => count > 0);
  const has_leftovers = tally.skipped + tally.failed > 0;

  const shown_name = current_sub
    ? safe_sender_name(current_sub.sender_name, current_sub.sender_email) ||
      current_sub.sender_email
    : "";

  const [done, total] = progress;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <AlertDialog
      open
      onOpenChange={(next_open) => {
        if (!next_open) handle_dismiss();
      }}
    >
      <AlertDialogContent className="gap-0 p-0 overflow-hidden w-[calc(100%-2rem)] max-w-[420px]">
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6 pb-5">
            {phase === "confirm" && (
              <AlertDialogHeader className="space-y-2 text-start">
                <AlertDialogTitle className="text-[16px] font-semibold">
                  {t("mail.unsubscribe_senders_title", {
                    count: senders.length,
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription
                  className="text-[14px] leading-5"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {page_only_count > 0
                    ? `${t("mail.unsubscribe_bulk_body")} ${t("settings.bulk_unsubscribe_pages_note")}`
                    : t("mail.unsubscribe_bulk_body")}
                </AlertDialogDescription>
              </AlertDialogHeader>
            )}

            {phase === "running" && (
              <>
                <AlertDialogHeader className="space-y-2 text-start">
                  <AlertDialogTitle className="text-[16px] font-semibold">
                    {t("settings.unsubscribing")}
                  </AlertDialogTitle>
                  <AlertDialogDescription
                    className="text-[14px] leading-5 tabular-nums"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {position_label(done, total)}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div
                  aria-valuemax={total}
                  aria-valuemin={0}
                  aria-valuenow={done}
                  className="mt-5 h-1 w-full overflow-hidden rounded-full"
                  role="progressbar"
                  style={{ backgroundColor: "var(--bg-tertiary)" }}
                >
                  <div
                    className="h-full rounded-full bg-[var(--accent-color)] transition-[width] duration-200 ease-out motion-reduce:transition-none"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </>
            )}

            {phase === "pages" && current_sub && (
              <>
                <AlertDialogHeader className="space-y-2 text-start">
                  {queue.length > 1 && (
                    <p className="text-[13px] leading-5 text-txt-muted tabular-nums">
                      {position_label(position + 1, queue.length)}
                    </p>
                  )}
                  <AlertDialogTitle className="text-[16px] font-semibold">
                    {t("settings.bulk_unsubscribe_pages_title")}
                  </AlertDialogTitle>
                  <AlertDialogDescription
                    className="text-[14px] leading-5"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {t("settings.bulk_unsubscribe_pages_body")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="mt-5">
                  <p className="text-start text-[16px] font-semibold leading-5 text-txt-primary [overflow-wrap:anywhere]">
                    {shown_name}
                  </p>
                  <p className="mt-1 text-start text-[14px] leading-[22px] text-txt-muted [overflow-wrap:anywhere]">
                    {current_sub.sender_email}
                  </p>
                  {current_url && (
                    <p className="text-start text-[14px] leading-[22px] text-txt-muted [overflow-wrap:anywhere]">
                      {host_of(current_url)}
                    </p>
                  )}
                </div>
              </>
            )}

            {phase === "summary" && (
              <>
                <AlertDialogHeader className="space-y-2 text-start">
                  <AlertDialogTitle className="text-[16px] font-semibold">
                    {t("settings.bulk_unsubscribe_summary_title")}
                  </AlertDialogTitle>
                  {has_leftovers && (
                    <AlertDialogDescription
                      className="text-[14px] leading-5"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {t("settings.bulk_unsubscribe_summary_note")}
                    </AlertDialogDescription>
                  )}
                </AlertDialogHeader>
                <dl className="mt-4 flex flex-col">
                  {shown_rows.map(([label, count]) => (
                    <div
                      key={label}
                      className="flex min-h-9 items-center justify-between gap-4 text-[14px] leading-5"
                    >
                      <dt className="text-txt-secondary">{label}</dt>
                      <dd className="font-semibold tabular-nums text-txt-primary">
                        {count}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </div>

          <AlertDialogFooter className="flex-row flex-wrap gap-3 px-6 pb-6 pt-2 sm:justify-end max-sm:pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
            {phase === "confirm" && (
              <>
                <Button
                  className="mt-0 whitespace-nowrap max-sm:flex-1"
                  variant="outline"
                  onClick={finish}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  className="whitespace-nowrap max-sm:flex-1"
                  variant="depth_destructive"
                  onClick={() => void handle_start()}
                >
                  {t("mail.unsubscribe")}
                </Button>
              </>
            )}

            {phase === "running" && (
              <Button
                className="mt-0 whitespace-nowrap max-sm:flex-1"
                variant="outline"
                onClick={handle_stop_running}
              >
                {t("common.stop")}
              </Button>
            )}

            {phase === "pages" && (
              <>
                {queue.length > 1 && (
                  <Button
                    className="mt-0 whitespace-nowrap max-sm:flex-1 sm:me-auto"
                    variant="ghost"
                    onClick={handle_stop_pages}
                  >
                    {t("common.stop")}
                  </Button>
                )}
                <Button
                  className="mt-0 whitespace-nowrap max-sm:flex-1"
                  variant="outline"
                  onClick={single_page_flow ? finish : handle_skip}
                >
                  {single_page_flow ? t("common.cancel") : t("common.skip")}
                </Button>
                {opened ? (
                  <>
                    <Button
                      className="whitespace-nowrap max-sm:flex-1"
                      variant="outline"
                      onClick={handle_open_page}
                    >
                      {t("mail.open_page")}
                    </Button>
                    <Button
                      className="whitespace-nowrap max-sm:flex-1"
                      disabled={is_marking}
                      variant="primary"
                      onClick={() => void handle_mark_done()}
                    >
                      {t("settings.bulk_unsubscribe_mark_done")}
                    </Button>
                  </>
                ) : (
                  <Button
                    ref={open_button_ref}
                    className="whitespace-nowrap max-sm:flex-1"
                    disabled={!current_url}
                    variant="primary"
                    onClick={handle_open_page}
                  >
                    {t("mail.open_page")}
                  </Button>
                )}
              </>
            )}

            {phase === "summary" && (
              <Button
                className="whitespace-nowrap max-sm:flex-1"
                variant="primary"
                onClick={finish}
              >
                {t("common.done")}
              </Button>
            )}
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
