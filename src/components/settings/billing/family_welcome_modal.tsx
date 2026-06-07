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
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserGroupIcon,
  ShieldCheckIcon,
  CircleStackIcon,
  ArrowRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { Modal } from "@/components/ui/modal";
import { format_bytes } from "@/lib/utils";
import { use_should_reduce_motion } from "@/provider";

interface FamilyWelcomeModalProps {
  is_open: boolean;
  on_close: () => void;
  plan_name: string;
  max_members: number;
  storage_pool_bytes: number;
  on_go_to_family: () => void;
}

const STEPS = [
  {
    icon: UserGroupIcon,
    title: "Welcome to your family plan",
    description: "Everyone in your family gets their own private, encrypted inbox - completely separate from yours.",
    points: [
      "Each member gets their own @astermail.org address",
      "Complete privacy - members can't see each other's emails",
      "Quantum-safe encryption on every account",
    ],
  },
  {
    icon: CircleStackIcon,
    title: "One storage pool, you control it",
    description: "Your plan comes with a shared pool of storage. Decide how much each member gets and adjust any time.",
    points: [
      "Allocate storage to each member when you invite them",
      "Move storage between members with a slider",
      "Members only see their own usage - nothing else",
    ],
  },
  {
    icon: ShieldCheckIcon,
    title: "Security for the whole family",
    description: "Set policies that apply to every member - enforce 2FA, limit sessions, control access.",
    points: [
      "Require 2-factor authentication for all members",
      "Set session timeouts and device limits org-wide",
      "View activity logs and member compliance at a glance",
    ],
  },
] as const;

export function FamilyWelcomeModal({
  is_open,
  on_close,
  plan_name,
  max_members,
  storage_pool_bytes,
  on_go_to_family,
}: FamilyWelcomeModalProps) {
  const [step, set_step] = useState(0);
  const [dir, set_dir] = useState(1);
  const reduce_motion = use_should_reduce_motion();
  const current = STEPS[step];
  const Icon = current.icon;
  const is_last = step === STEPS.length - 1;

  const handle_close = () => { set_step(0); on_close(); };

  const go = (next: number) => {
    set_dir(next > step ? 1 : -1);
    set_step(next);
  };

  const handle_next = () => {
    if (is_last) { handle_close(); on_go_to_family(); }
    else go(step + 1);
  };

  const variants = {
    enter: (d: number) => ({ opacity: 0, x: reduce_motion ? 0 : d * 20 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: reduce_motion ? 0 : d * -20 }),
  };

  return (
    <Modal is_open={is_open} on_close={handle_close} size="lg" show_close_button={false} close_on_overlay={false}>
      <div className="relative flex flex-col overflow-hidden">
        {/* Close */}
        <button
          onClick={handle_close}
          className="absolute right-4 top-4 z-20 w-7 h-7 flex items-center justify-center rounded-[14px] transition-colors hover:bg-black/5 dark:hover:bg-white/10 text-txt-secondary"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce_motion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="px-8 pt-8 pb-6"
          >
            {/* Plan pill (stacked: plan on top, details below) */}
            <div className="flex flex-col items-center gap-1 mb-6 w-full">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                {plan_name}
              </span>
              <span className="text-xs text-txt-muted">{max_members} members · {format_bytes(storage_pool_bytes)}</span>
            </div>

            {/* Icon (no background, blue) */}
            <div className="flex justify-center mb-5 w-full">
              <Icon className="w-12 h-12 text-accent-blue" strokeWidth={1.5} />
            </div>

            {/* Text */}
            <div className="text-center mb-6">
              <h2 className="text-lg font-semibold text-txt-primary mb-2">{current.title}</h2>
              <p className="text-sm text-txt-muted leading-relaxed max-w-xs mx-auto">{current.description}</p>
            </div>

            {/* Points */}
            <ul className="space-y-3 bg-surf-secondary rounded-xl p-4 border border-edge-secondary">
              {current.points.map((point, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-500" />
                  <span className="text-sm text-txt-primary">{point}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pb-2">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              className={`rounded-full transition-all duration-300 ${
                i === step
                  ? "w-6 h-2 bg-accent-blue"
                  : i < step
                  ? "w-1.5 h-2 bg-accent-blue opacity-40"
                  : "w-1.5 h-2 bg-edge-secondary"
              }`}
              aria-label={`Step ${i + 1}: ${s.title}`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 flex items-center justify-between border-t border-edge-secondary mt-2">
          <button
            onClick={handle_close}
            className="aster_btn aster_btn_ghost aster_btn_sm"
          >
            Skip
          </button>
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => go(step - 1)}
                className="aster_btn aster_btn_depth aster_btn_sm"
              >
                Back
              </button>
            )}
            <button
              onClick={handle_next}
              className="aster_btn aster_btn_depth aster_btn_sm flex items-center gap-1.5"
            >
              {is_last ? (
                <>
                  Set up family
                  <ArrowRightIcon className="w-4 h-4" />
                </>
              ) : (
                "Next"
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
