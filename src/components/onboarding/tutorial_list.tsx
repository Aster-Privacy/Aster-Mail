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
  "group flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-[13px] leading-5 text-white/[0.58] outline-none transition-colors hover:bg-white/[0.06] hover:text-white/90 focus-visible:bg-white/[0.08] focus-visible:text-white";

const FOOTER_CLASS =
  "flex min-h-9 w-full items-center rounded-md px-2.5 py-2 text-start text-[13px] leading-5 text-white/[0.46] outline-none transition-colors hover:text-white/80 focus-visible:bg-white/[0.08] focus-visible:text-white";

const GROUP_CLASS =
  "overflow-hidden rounded-md border border-white/[0.05] bg-white/[0.035]";

const CHEVRON_CLASS =
  "h-3 w-3 flex-shrink-0 text-white/30 transition-colors group-hover:text-white/60 rtl:rotate-180";

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
  const launcher_ref = useRef<HTMLButtonElement>(null);
  const all_done = tasks.length > 0 && tasks.every((task) => task.done);
  const transition = { duration: reduce_motion ? 0 : 0.16 };

  const handle_key_down = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    on_toggle();
    launcher_ref.current?.focus();
  };

  return (
    <div
      className="pointer-events-none fixed bottom-24 start-4 end-4 z-30 flex flex-col items-end gap-2 md:bottom-5 md:start-auto md:end-5"
      data-testid="tutorial-list"
    >
      <AnimatePresence initial={false}>
        {is_open && (
          <motion.div
            key="panel"
            animate={{ opacity: 1, y: 0, scale: 1 }}
            aria-label={labels.heading}
            className="pointer-events-auto max-h-[calc(100dvh-10rem)] w-full origin-bottom-right overflow-y-auto rounded-lg border border-white/[0.07] bg-[#1f1f1f] p-2 shadow-[0_12px_32px_rgba(0,0,0,0.28),0_2px_6px_rgba(0,0,0,0.18)] md:w-[320px] rtl:origin-bottom-left"
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            id={panel_id}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            role="region"
            transition={transition}
            onKeyDown={handle_key_down}
          >
            <div className={GROUP_CLASS}>
              {all_done ? (
                on_complete_click ? (
                  <button
                    className="group flex min-h-9 w-full items-center gap-2 px-2.5 py-2 text-start text-[13px] font-semibold leading-5 text-white outline-none transition-[filter] hover:brightness-110 focus-visible:brightness-125"
                    style={{ backgroundColor: "var(--accent-blue)" }}
                    type="button"
                    onClick={on_complete_click}
                  >
                    <span className="min-w-0 flex-1 break-words">
                      {labels.complete}
                    </span>
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="h-3 w-3 flex-shrink-0 text-white rtl:rotate-180"
                      strokeWidth={2.5}
                    />
                  </button>
                ) : (
                  <div
                    className="flex min-h-9 items-center px-2.5 py-2 text-[13px] font-semibold leading-5 text-white"
                    style={{ backgroundColor: "var(--accent-blue)" }}
                  >
                    <span className="min-w-0 flex-1 break-words">
                      {labels.complete}
                    </span>
                  </div>
                )
              ) : (
                <div className="flex min-h-9 items-center bg-white/[0.05] px-2.5 py-2 text-[13px] font-semibold leading-5 text-white">
                  <span className="min-w-0 flex-1 break-words">
                    {labels.heading}
                  </span>
                </div>
              )}
              <ul className="flex flex-col p-0.5">
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
                        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors"
                        style={{
                          borderColor: task.done
                            ? "var(--accent-blue)"
                            : "rgba(255, 255, 255, 0.34)",
                          backgroundColor: task.done
                            ? "var(--accent-blue)"
                            : "transparent",
                        }}
                      >
                        {task.done && (
                          <CheckIcon
                            className="h-2.5 w-2.5 text-white"
                            strokeWidth={3.5}
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 break-words">
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
            </div>

            {domain_links.length > 0 && (
              <div className={`${GROUP_CLASS} mt-2`}>
                <div className="flex min-h-9 items-center gap-3 bg-white/[0.05] px-2.5 py-2">
                  <span className="min-w-0 flex-1 break-words text-[13px] font-semibold leading-5 text-white">
                    {labels.domain_heading}
                  </span>
                  <span className="flex-shrink-0 text-[11px] font-medium uppercase leading-4 tracking-[0.06em] text-[#f0885a]">
                    {labels.domain_badge}
                  </span>
                </div>
                <ul className="flex flex-col p-0.5">
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
              </div>
            )}

            <button
              className={`${FOOTER_CLASS} mt-1`}
              type="button"
              onClick={on_hide_forever}
            >
              {labels.hide_forever}
            </button>

            {on_shortcuts && (
              <>
                <div
                  aria-hidden="true"
                  className="-mx-2 my-1 h-px bg-white/[0.07]"
                />
                <button
                  className={FOOTER_CLASS}
                  type="button"
                  onClick={on_shortcuts}
                >
                  {labels.shortcuts}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        ref={launcher_ref}
        aria-controls={is_open ? panel_id : undefined}
        aria-expanded={is_open}
        aria-label={is_open ? labels.close : labels.open}
        className="pointer-events-auto flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[#1f1f1f] text-white shadow-[0_6px_16px_rgba(0,0,0,0.28)] outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] active:scale-95"
        type="button"
        onClick={on_toggle}
      >
        {is_open ? (
          <XMarkIcon aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
        ) : (
          <BookOpenIcon
            aria-hidden="true"
            className="h-4 w-4"
            strokeWidth={2}
          />
        )}
      </button>
    </div>
  );
}
