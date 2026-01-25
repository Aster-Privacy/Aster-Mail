import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/solid";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme_context";
import { use_onboarding } from "@/hooks/use_onboarding";
import { cn } from "@/lib/utils";

const pulse_style = `
  @keyframes tour-breathe {
    0%, 100% {
      box-shadow: 0 0 0 3px var(--tour-color-fade);
    }
    50% {
      box-shadow: 0 0 0 6px var(--tour-color-fade);
    }
  }
  .tour-highlight-box {
    border: 2px solid var(--tour-color);
    animation: tour-breathe 2.5s ease-in-out infinite;
    border-radius: 8px;
    pointer-events: none;
  }
  .tour-arrow {
    position: absolute;
    width: 12px;
    height: 12px;
    background: var(--bg-card);
    border: 1px solid var(--border-primary);
    transform: rotate(45deg);
  }
  .tour-arrow-left {
    left: -7px;
    top: 50%;
    margin-top: -6px;
    border-right: none;
    border-top: none;
  }
  .tour-arrow-right {
    right: -7px;
    top: 50%;
    margin-top: -6px;
    border-left: none;
    border-bottom: none;
  }
  .tour-arrow-top {
    top: -7px;
    left: 50%;
    margin-left: -6px;
    border-bottom: none;
    border-right: none;
  }
  .tour-arrow-bottom {
    bottom: -7px;
    left: 50%;
    margin-left: -6px;
    border-top: none;
    border-left: none;
  }
`;

interface OnboardingStep {
  title: string;
  description: string;
  target_selector?: string;
  position?: "top" | "bottom" | "left" | "right" | "center";
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Welcome to Aster Mail",
    description:
      "Let's take a quick tour to help you get started with your secure, private email platform.",
    position: "center",
  },
  {
    title: "Compose New Emails",
    description:
      "Click the compose button to write a new email. Every message is automatically encrypted end-to-end before sending.",
    target_selector: "[data-onboarding='compose-button']",
    position: "right",
  },
  {
    title: "Search Your Emails",
    description:
      "Use the search bar to quickly find any email. Press Cmd+K (Mac) or Ctrl+K (Windows) for fast access.",
    target_selector: "[data-onboarding='search-bar']",
    position: "bottom",
  },
  {
    title: "Organize with Folders",
    description:
      "Create custom folders to organize your emails. Click the + button next to Folders to create your first one.",
    target_selector: "[data-onboarding='folders-section']",
    position: "right",
  },
  {
    title: "Access Your Settings",
    description:
      "Customize your experience, manage security settings, and configure your account preferences.",
    target_selector: "[data-onboarding='settings-button']",
    position: "left",
  },
  {
    title: "You're Ready to Go",
    description:
      "That's it! You're all set to start using Aster Mail. Your emails are end-to-end encrypted and completely private.",
    position: "center",
  },
];

export function OnboardingTour() {
  const { theme } = useTheme();
  const {
    should_show_onboarding,
    state,
    skip_onboarding,
    complete_onboarding,
    advance_to_step,
  } = use_onboarding();

  const is_dark = theme === "dark";
  const [current_step, set_current_step] = useState(0);
  const [target_rect, set_target_rect] = useState<DOMRect | null>(null);
  const [is_transitioning, set_is_transitioning] = useState(false);
  const update_timer_ref = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (state?.current_step !== undefined) {
      set_current_step(state.current_step);
    }
  }, [state]);

  useEffect(() => {
    if (should_show_onboarding) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [should_show_onboarding]);

  const scroll_to_element = useCallback((element: Element) => {
    const rect = element.getBoundingClientRect();
    const is_visible =
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth;

    if (!is_visible) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }
  }, []);

  const update_target_rect = useCallback(() => {
    const current = ONBOARDING_STEPS[current_step];

    if (current.target_selector) {
      const element = document.querySelector(current.target_selector);

      if (element) {
        const rect = element.getBoundingClientRect();

        set_target_rect(rect);
        scroll_to_element(element);
      } else {
        set_target_rect(null);
      }
    } else {
      set_target_rect(null);
    }
  }, [current_step, scroll_to_element]);

  useEffect(() => {
    const timeout = setTimeout(update_target_rect, 100);

    const handle_resize = () => {
      if (update_timer_ref.current) {
        clearTimeout(update_timer_ref.current);
      }
      update_timer_ref.current = setTimeout(update_target_rect, 100);
    };

    window.addEventListener("resize", handle_resize);
    window.addEventListener("scroll", handle_resize, true);

    const interval = setInterval(update_target_rect, 500);

    return () => {
      clearTimeout(timeout);
      if (update_timer_ref.current) {
        clearTimeout(update_timer_ref.current);
      }
      window.removeEventListener("resize", handle_resize);
      window.removeEventListener("scroll", handle_resize, true);
      clearInterval(interval);
    };
  }, [update_target_rect]);

  const handle_next = useCallback(async () => {
    if (is_transitioning) return;

    set_is_transitioning(true);

    try {
      if (current_step === ONBOARDING_STEPS.length - 1) {
        await complete_onboarding();
      } else {
        const next_step = current_step + 1;

        set_current_step(next_step);
        await advance_to_step(next_step);
      }
    } finally {
      setTimeout(() => set_is_transitioning(false), 80);
    }
  }, [current_step, is_transitioning, advance_to_step, complete_onboarding]);

  const handle_previous = useCallback(async () => {
    if (is_transitioning || current_step === 0) return;

    set_is_transitioning(true);

    try {
      const prev_step = current_step - 1;

      set_current_step(prev_step);
      await advance_to_step(prev_step);
    } finally {
      setTimeout(() => set_is_transitioning(false), 80);
    }
  }, [current_step, is_transitioning, advance_to_step]);

  const handle_skip = useCallback(async () => {
    if (is_transitioning) return;

    set_is_transitioning(true);

    try {
      await skip_onboarding();
    } finally {
      set_is_transitioning(false);
    }
  }, [is_transitioning, skip_onboarding]);

  useEffect(() => {
    const handle_keydown = (e: KeyboardEvent) => {
      if (!should_show_onboarding) return;

      if (e.key === "Escape") {
        handle_skip();
      } else if (e.key === "ArrowRight") {
        handle_next();
      } else if (e.key === "ArrowLeft") {
        handle_previous();
      }
    };

    window.addEventListener("keydown", handle_keydown);

    return () => window.removeEventListener("keydown", handle_keydown);
  }, [should_show_onboarding, handle_skip, handle_next, handle_previous]);

  if (!should_show_onboarding) {
    return null;
  }

  const current = ONBOARDING_STEPS[current_step];
  const progress = ((current_step + 1) / ONBOARDING_STEPS.length) * 100;
  const is_final_step = current_step === ONBOARDING_STEPS.length - 1;

  const get_tooltip_style = (): React.CSSProperties => {
    if (!target_rect || current.position === "center") {
      return {};
    }

    const tooltip_width = 400;
    const tooltip_height = 280;
    const gap = 20;

    let top = 0;
    let left = 0;

    switch (current.position) {
      case "right":
        top = target_rect.top + target_rect.height / 2 - tooltip_height / 2;
        left = target_rect.right + gap;
        break;
      case "left":
        top = target_rect.top + target_rect.height / 2 - tooltip_height / 2;
        left = target_rect.left - tooltip_width - gap;
        break;
      case "bottom":
        top = target_rect.bottom + gap;
        left = target_rect.left + target_rect.width / 2 - tooltip_width / 2;
        break;
      case "top":
        top = target_rect.top - tooltip_height - gap;
        left = target_rect.left + target_rect.width / 2 - tooltip_width / 2;
        break;
    }

    top = Math.max(16, Math.min(top, window.innerHeight - tooltip_height - 16));
    left = Math.max(16, Math.min(left, window.innerWidth - tooltip_width - 16));

    return {
      position: "absolute",
      top,
      left,
      width: tooltip_width,
    };
  };

  const get_arrow_class = (): string => {
    if (!target_rect || current.position === "center") return "";
    switch (current.position) {
      case "right":
        return "tour-arrow tour-arrow-left";
      case "left":
        return "tour-arrow tour-arrow-right";
      case "bottom":
        return "tour-arrow tour-arrow-top";
      case "top":
        return "tour-arrow tour-arrow-bottom";
      default:
        return "";
    }
  };

  const is_positioned = target_rect && current.position !== "center";

  return (
    <AnimatePresence>
      {should_show_onboarding && (
        <>
          <style>{pulse_style}</style>
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[9999] select-none"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={`step-${current_step}`}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {target_rect && (
                  <>
                    <svg
                      className="absolute inset-0 cursor-pointer"
                      style={{ width: "100%", height: "100%" }}
                      onClick={handle_skip}
                    >
                      <defs>
                        <mask id={`spotlight-mask-${current_step}`}>
                          <rect
                            fill="white"
                            height="100%"
                            width="100%"
                            x="0"
                            y="0"
                          />
                          <rect
                            fill="black"
                            height={target_rect.height + 16}
                            rx="8"
                            width={target_rect.width + 16}
                            x={target_rect.left - 8}
                            y={target_rect.top - 8}
                          />
                        </mask>
                      </defs>
                      <rect
                        fill={
                          is_dark
                            ? "rgba(0, 0, 0, 0.85)"
                            : "rgba(0, 0, 0, 0.75)"
                        }
                        height="100%"
                        mask={`url(#spotlight-mask-${current_step})`}
                        width="100%"
                        x="0"
                        y="0"
                      />
                    </svg>
                    <div
                      className="tour-highlight-box absolute"
                      style={
                        {
                          top: target_rect.top - 8,
                          left: target_rect.left - 8,
                          width: target_rect.width + 16,
                          height: target_rect.height + 16,
                          "--tour-color": is_dark ? "#60a5fa" : "#3b82f6",
                          "--tour-color-fade": is_dark
                            ? "rgba(96, 165, 250, 0.25)"
                            : "rgba(59, 130, 246, 0.2)",
                        } as React.CSSProperties
                      }
                    />
                  </>
                )}

                {!target_rect && (
                  <div
                    className="absolute inset-0 cursor-pointer"
                    role="button"
                    style={{
                      backgroundColor: is_dark
                        ? "rgba(0, 0, 0, 0.85)"
                        : "rgba(0, 0, 0, 0.75)",
                    }}
                    tabIndex={0}
                    onClick={handle_skip}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handle_skip();
                      }
                    }}
                  />
                )}

                <div
                  className={cn(
                    "absolute inset-0 pointer-events-none",
                    !is_positioned && "flex items-center justify-center p-4",
                  )}
                >
                  <motion.div
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(
                      "relative rounded-2xl border shadow-2xl pointer-events-auto",
                      !is_positioned && "w-[560px] max-w-full",
                    )}
                    initial={{ opacity: 0, scale: 0.95 }}
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-primary)",
                      ...get_tooltip_style(),
                    }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    {is_positioned && <div className={get_arrow_class()} />}
                    <button
                      className="absolute top-4 right-4 z-10 p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
                      disabled={is_transitioning}
                      style={{ color: "var(--text-muted)" }}
                      onClick={handle_skip}
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>

                    <div className="px-8 pt-8 pb-6">
                      <div className="flex items-start gap-1 mb-3">
                        <div
                          className="text-sm font-medium px-2.5 py-1 rounded-md"
                          style={{
                            backgroundColor: is_dark
                              ? "rgba(96, 165, 250, 0.15)"
                              : "rgba(59, 130, 246, 0.1)",
                            color: is_dark ? "#60a5fa" : "#3b82f6",
                          }}
                        >
                          Step {current_step + 1} of {ONBOARDING_STEPS.length}
                        </div>
                      </div>

                      <h2
                        className="text-2xl font-bold mb-3"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {current.title}
                      </h2>

                      <p
                        className="text-base leading-relaxed"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {current.description}
                      </p>
                    </div>

                    <div
                      className="px-8 pb-8"
                      style={{
                        borderTop: `1px solid ${is_dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                      }}
                    >
                      <div className="pt-6">
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-6 overflow-hidden">
                          <motion.div
                            animate={{ width: `${progress}%` }}
                            className="h-full rounded-full"
                            initial={false}
                            style={{
                              backgroundColor: is_dark ? "#60a5fa" : "#3b82f6",
                            }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                          <Button
                            disabled={current_step === 0 || is_transitioning}
                            size="default"
                            variant="outline"
                            onClick={handle_previous}
                          >
                            Previous
                          </Button>

                          {!is_final_step && (
                            <Button
                              disabled={is_transitioning}
                              size="default"
                              variant="ghost"
                              onClick={handle_skip}
                            >
                              Skip tour
                            </Button>
                          )}

                          <Button
                            disabled={is_transitioning}
                            size="default"
                            onClick={handle_next}
                          >
                            {is_final_step ? "Get Started" : "Next"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
