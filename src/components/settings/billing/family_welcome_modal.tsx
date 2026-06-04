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
import {
  UserGroupIcon,
  ShieldCheckIcon,
  CircleStackIcon,
  Cog6ToothIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";
import { format_bytes } from "@/lib/utils";

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
    icon_color: "text-accent-blue",
    icon_bg: "bg-accent-blue/10",
    title: "Welcome to your family plan",
    description: "You now have a shared plan for the whole family - everyone gets their own private inbox.",
    points: [
      { icon: CheckCircleIcon, text: "Each member gets their own account and address" },
      { icon: CheckCircleIcon, text: "Complete privacy - members can't see each other's emails" },
      { icon: CheckCircleIcon, text: "You manage the plan, everyone else just uses it" },
    ],
  },
  {
    icon: CircleStackIcon,
    icon_color: "text-violet-500",
    icon_bg: "bg-violet-500/10",
    title: "Shared storage pool",
    description: "Your plan includes a storage pool you control. Allocate however much each member needs.",
    points: [
      { icon: CheckCircleIcon, text: "You decide how much storage each member gets" },
      { icon: CheckCircleIcon, text: "Move storage between members any time" },
      { icon: CheckCircleIcon, text: "Members see only their own usage" },
    ],
  },
  {
    icon: ShieldCheckIcon,
    icon_color: "text-green-500",
    icon_bg: "bg-green-500/10",
    title: "Built for privacy and security",
    description: "Set security policies for the whole family, track who's logged in, and keep everyone safe.",
    points: [
      { icon: CheckCircleIcon, text: "Require 2FA for all members" },
      { icon: CheckCircleIcon, text: "Set session timeouts and device limits" },
      { icon: CheckCircleIcon, text: "Full quantum-safe encryption on every account" },
    ],
  },
  {
    icon: Cog6ToothIcon,
    icon_color: "text-amber-500",
    icon_bg: "bg-amber-500/10",
    title: "Invite your first member",
    description: "Head to Family settings to invite members, allocate storage, and set up your plan.",
    points: [
      { icon: CheckCircleIcon, text: "Send email invites directly from Family settings" },
      { icon: CheckCircleIcon, text: "Or share a private invite link" },
      { icon: CheckCircleIcon, text: "Members join in seconds - no credit card needed" },
    ],
  },
];

export function FamilyWelcomeModal({
  is_open,
  on_close,
  plan_name,
  max_members,
  storage_pool_bytes,
  on_go_to_family,
}: FamilyWelcomeModalProps) {
  const [step, set_step] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  const is_last = step === STEPS.length - 1;

  const handle_close = () => {
    set_step(0);
    on_close();
  };

  const handle_next = () => {
    if (is_last) {
      handle_close();
      on_go_to_family();
    } else {
      set_step(s => s + 1);
    }
  };

  return (
    <Modal is_open={is_open} on_close={handle_close} size="md" close_on_overlay={false}>
      <ModalHeader>
        <div className="flex flex-col items-center text-center gap-3 pt-2">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${current.icon_bg}`}>
            <Icon className={`w-7 h-7 ${current.icon_color}`} />
          </div>
          <div>
            <div className="flex items-center justify-center gap-1.5 mb-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent-blue/10 text-accent-blue">
                {plan_name}
              </span>
              <span className="text-xs text-txt-muted">
                {max_members} members - {format_bytes(storage_pool_bytes)} storage
              </span>
            </div>
            <ModalTitle className="text-xl">{current.title}</ModalTitle>
          </div>
          <ModalDescription>{current.description}</ModalDescription>
        </div>
      </ModalHeader>

      <div className="px-6 pb-2">
        <ul className="space-y-2.5">
          {current.points.map((p, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <p.icon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-txt-primary">{p.text}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-center gap-1.5 mt-6">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => set_step(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? "w-6 bg-accent-blue"
                  : i < step
                  ? "w-1.5 bg-accent-blue/40"
                  : "w-1.5 bg-edge-secondary"
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>
      </div>

      <ModalFooter>
        <Button variant="ghost" onClick={handle_close}>
          Skip intro
        </Button>
        <Button variant="depth" onClick={handle_next}>
          {is_last ? (
            <>
              Go to Family settings
              <ArrowRightIcon className="w-4 h-4 ml-1" />
            </>
          ) : (
            "Next"
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
