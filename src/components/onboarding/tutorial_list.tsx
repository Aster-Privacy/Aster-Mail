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
import { useId, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpenIcon,
  CheckIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

export interface TutorialListTask {
  key: string;
  label: string;
  done: boolean;
  on_click: () => void;
}

export interface TutorialListLink {
  key: string;
  label: string;
  on_click: () => void;
}

export interface TutorialListLabels {
  heading: string;
  complete: string;
  complete_action: string;
  progress: string;
  task_done: string;
  domain_heading: string;
  domain_badge: string;
  hide_forever: string;
  shortcuts: string;
  open: string;
  close: string;
}

interface TutorialListProps {
  is_open: boolean;
  tasks: TutorialListTask[];
  domain_links: TutorialListLink[];
  labels: TutorialListLabels;
  reduce_motion: boolean;
  on_toggle: () => void;
  on_hide_forever: () => void;
  on_complete_click?: () => void;
  on_shortcuts?: () => void;
}

const ROW_CLASS =
  "group flex min-h-10 w-full items-center gap-3 rounded-lg px-2 py-2 text-start text-[13px] leading-5 text-txt-primary outline-none transition-colors hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]";

const FOOTER_CLASS =
  "rounded-md px-2 py-1.5 text-start text-xs leading-4 text-txt-muted outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-txt-primary focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]";

const CHEVRON_CLASS =
  "h-3.5 w-3.5 flex-shrink-0 text-txt-muted opacity-60 transition-opacity group-hover:opacity-100 rtl:rotate-180";

const DIVIDER_CLASS = "mx-2 my-2 h-px bg-[var(--border-primary)]";

export function TutorialList({
  is_open,
  tasks,
  domain_links,
  labels,
  reduce_motion,
  on_toggle,
  on_hide_forever,
  on_complete_click,
  on_shortcuts,
}: TutorialListProps): JSX.Element {
  const panel_id = useId();
  const progress_id = useId();
  const launcher_ref = useRef<HTMLButtonElement>(null);
  const done_count = tasks.filter((task) => task.done).length;
  const remaining_count = tasks.length - done_count;
  const all_done = tasks.length > 0 && remaining_count === 0;
  const progress_percent =
    tasks.length > 0 ? Math.round((done_count / tasks.length) * 100) : 0;
  const transition = { duration: reduce_motion ? 0 : 0.16 };

  const handle_key_down = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !is_open) return;
    event.stopPropagation();
    on_toggle();
    launcher_ref.current?.focus();
  };

  return (
    <div
      className="pointer-events-none fixed bottom-24 start-4 end-4 z-30 flex flex-col-reverse items-end gap-2 md:bottom-5 md:start-auto md:end-16"
      data-testid="tutorial-list"
      onKeyDown={handle_key_down}
    >
      <button
        ref={launcher_ref}
        aria-controls={is_open ? panel_id : undefined}
        aria-describedby={is_open ? undefined : progress_id}
        aria-expanded={is_open}
        aria-label={is_open ? labels.close : labels.open}
        className="pointer-events-auto relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border-primary)] bg-[var(--bg-card)] text-txt-secondary outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-txt-primary focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
        type="button"
        onClick={on_toggle}
      >
        {is_open ? (
          <XMarkIcon aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
        ) : (
          <BookOpenIcon
            aria-hidden="true"
            className="h-5 w-5"
            strokeWidth={1.75}
          />
        )}
        {!is_open && remaining_count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-color)] px-1 text-[10px] font-semibold tabular-nums leading-none text-[var(--accent-fg,#ffffff)]"
            data-testid="tutorial-list-remaining"
          >
            {remaining_count}
          </span>
        )}
        {!is_open && (
          <span className="sr-only" id={progress_id}>
            {labels.progress}
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {is_open && (
          <motion.div
            key="panel"
            animate={{ opacity: 1, y: 0, scale: 1 }}
            aria-label={labels.heading}
            className="pointer-events-auto max-h-[calc(100dvh-10rem)] w-full origin-bottom-right overflow-y-auto rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.16),0_2px_8px_rgba(0,0,0,0.08)] md:w-[320px] rtl:origin-bottom-left"
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            id={panel_id}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            role="region"
            transition={transition}
          >
            <div className="px-2 pb-2 pt-1.5">
              <div className="flex min-h-7 items-center gap-3">
                <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-5 text-txt-primary">
                  {all_done ? labels.complete : labels.heading}
                </span>
                {all_done && on_complete_click ? (
                  <button
                    className="-me-1.5 flex flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[13px] font-medium leading-5 text-[var(--accent-color)] outline-none transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                    type="button"
                    onClick={on_complete_click}
                  >
                    {labels.complete_action}
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="h-3.5 w-3.5 flex-shrink-0 rtl:rotate-180"
                      strokeWidth={2.5}
                    />
                  </button>
                ) : (
                  <span className="flex-shrink-0 text-xs tabular-nums leading-4 text-txt-muted">
                    {labels.progress}
                  </span>
                )}
              </div>
              <div
                aria-hidden="true"
                className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--bg-hover)]"
              >
                <div
                  className={`h-full rounded-full bg-[var(--accent-color)] ${
                    reduce_motion ? "" : "transition-[width] duration-300"
                  }`}
                  data-testid="tutorial-list-progress"
                  style={{ width: `${progress_percent}%` }}
                />
              </div>
            </div>

            <ul className="flex flex-col">
              {tasks.map((task) => (
                <li key={task.key}>
                  <button
                    className={ROW_CLASS}
                    data-done={task.done ? "true" : "false"}
                    type="button"
                    onClick={task.on_click}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        task.done
                          ? "border-[var(--accent-color)] bg-[var(--accent-color)]"
                          : "border-[var(--checkbox-border,var(--text-muted))] group-hover:border-[var(--accent-color)]"
                      }`}
                    >
                      {task.done && (
                        <CheckIcon
                          className="h-3 w-3 text-[var(--accent-fg,#ffffff)]"
                          strokeWidth={3.5}
                        />
                      )}
                    </span>
                    <span
                      className={`min-w-0 flex-1 break-words ${
                        task.done ? "text-txt-muted" : ""
                      }`}
                    >
                      {task.label}
                    </span>
                    {task.done && (
                      <span className="sr-only">{labels.task_done}</span>
                    )}
                    <ChevronRightIcon
                      aria-hidden="true"
                      className={CHEVRON_CLASS}
                      strokeWidth={2.5}
                    />
                  </button>
                </li>
              ))}
            </ul>

            {domain_links.length > 0 && (
              <>
                <div aria-hidden="true" className={DIVIDER_CLASS} />
                <div className="flex min-h-8 items-center gap-3 px-2">
                  <span className="min-w-0 flex-1 break-words text-[13px] font-semibold leading-5 text-txt-primary">
                    {labels.domain_heading}
                  </span>
                  <span className="flex-shrink-0 rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] font-medium leading-4 text-txt-muted">
                    {labels.domain_badge}
                  </span>
                </div>
                <ul className="flex flex-col">
                  {domain_links.map((link) => (
                    <li key={link.key}>
                      <button
                        className={ROW_CLASS}
                        type="button"
                        onClick={link.on_click}
                      >
                        <span className="min-w-0 flex-1 break-words">
                          {link.label}
                        </span>
                        <ChevronRightIcon
                          aria-hidden="true"
                          className={CHEVRON_CLASS}
                          strokeWidth={2.5}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div aria-hidden="true" className={DIVIDER_CLASS} />
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              {on_shortcuts && (
                <button
                  className={FOOTER_CLASS}
                  type="button"
                  onClick={on_shortcuts}
                >
                  {labels.shortcuts}
                </button>
              )}
              <button
                className={FOOTER_CLASS}
                type="button"
                onClick={on_hide_forever}
              >
                {labels.hide_forever}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
