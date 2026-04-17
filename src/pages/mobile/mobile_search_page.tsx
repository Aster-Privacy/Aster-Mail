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
import type { TranslationKey } from "@/lib/i18n/types";
import type { InboxEmail } from "@/types/email";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { use_search } from "@/hooks/use_search";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { MobileHeader } from "@/components/mobile/mobile_header";
import { MobileEmailRow } from "@/components/mobile/mobile_email_row";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";

type SearchFilter = "all" | "unread" | "attachments" | "starred";

const FILTERS: { id: SearchFilter; label: TranslationKey }[] = [
  { id: "all", label: "mail.all" },
  { id: "unread", label: "mail.unread" },
  { id: "attachments", label: "mail.attachments" },
  { id: "starred", label: "mail.starred" },
];

function MobileSearchPage() {
  const navigate = useNavigate();
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const search = use_search();
  const input_ref = useRef<HTMLInputElement>(null);
  const [query, set_query] = useState("");
  const [active_filter, set_active_filter] = useState<SearchFilter>("all");

  useEffect(() => {
    const timer = setTimeout(() => {
      input_ref.current?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const handle_back = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handle_search = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        search.search(query.trim());
      }
    },
    [query, search],
  );

  const handle_clear = useCallback(() => {
    set_query("");
    search.clear_results();
    input_ref.current?.focus();
  }, [search]);

  const handle_email_press = useCallback(
    (id: string) => {
      navigate(`/email/${id}`, { state: { from_view: "search" } });
    },
    [navigate],
  );

  const filtered_results = useMemo(() => {
    const results = (search.state.results ?? []) as InboxEmail[];

    if (active_filter === "all") return results;
    if (active_filter === "unread") return results.filter((e) => !e.is_read);
    if (active_filter === "attachments")
      return results.filter((e) => e.has_attachment);
    if (active_filter === "starred") return results.filter((e) => e.is_starred);

    return results;
  }, [search.state.results, active_filter]);

  const is_loading = search.state.is_searching || search.state.index_building;
  const has_results = filtered_results.length > 0;
  const has_searched =
    (search.state.results ?? []).length > 0 ||
    search.state.is_searching ||
    search.state.index_building;

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="flex h-full flex-col"
      initial={reduce_motion ? false : { opacity: 0, x: 20 }}
      transition={
        reduce_motion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }
      }
    >
      <MobileHeader on_back={handle_back} title={t("common.search")} />

      <form
        className="flex items-center gap-2 border-b border-[var(--border-primary)] px-4 py-2"
        onSubmit={handle_search}
      >
        <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
        <Input
          ref={input_ref}
          className="min-w-0 flex-1 bg-transparent"
          placeholder={t("mail.search_messages")}
          type="text"
          value={query}
          onChange={(e) => set_query(e.target.value)}
        />
        <button
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--bg-tertiary)] transition-opacity ${query ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          type="button"
          onClick={handle_clear}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </form>

      {has_searched && (
        <div className="flex gap-2 overflow-x-auto border-b border-[var(--border-primary)] px-4 py-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
                active_filter === filter.id
                  ? "bg-[var(--accent-color,#3b82f6)] text-white"
                  : "border border-[var(--border-primary)] text-[var(--text-secondary)]"
              }`}
              type="button"
              onClick={() => set_active_filter(filter.id)}
            >
              {t(filter.label)}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {is_loading && (
          <div className="flex flex-col items-center justify-center gap-3 pt-20">
            <Spinner size="lg" />
            <p className="text-[14px] text-[var(--text-muted)]">
              {t("common.searching")}
            </p>
          </div>
        )}

        {!is_loading && !has_searched && (
          <div className="flex flex-col items-center justify-center gap-3 px-8 pt-20">
            <MagnifyingGlassIcon className="h-16 w-16 text-[var(--text-muted)] opacity-40" />
            <p className="text-center text-[15px] text-[var(--text-muted)]">
              {t("mail.search_messages")}
            </p>
          </div>
        )}

        {!is_loading && has_searched && !has_results && (
          <div className="flex flex-col items-center justify-center gap-3 px-8 pt-20">
            <p className="text-center text-[15px] text-[var(--text-muted)]">
              {t("mail.no_results_found")}
            </p>
          </div>
        )}

        {!is_loading &&
          filtered_results.map((email) => (
            <MobileEmailRow
              key={email.id}
              email={email}
              on_long_press={() => {}}
              on_press={handle_email_press}
            />
          ))}
      </div>
    </motion.div>
  );
}

export default MobileSearchPage;
