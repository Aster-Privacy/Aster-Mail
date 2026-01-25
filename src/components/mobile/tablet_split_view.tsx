import { useState, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/lib/utils";
import { use_show_tablet_split_view } from "@/hooks/use_platform";

interface TabletSplitViewProps {
  list_content: ReactNode;
  detail_content: ReactNode | null;
  has_selection: boolean;
  list_width_percent?: number;
  min_list_width?: number;
  max_list_width?: number;
}

export function TabletSplitView({
  list_content,
  detail_content,
  has_selection,
  list_width_percent = 40,
  min_list_width = 320,
  max_list_width = 480,
}: TabletSplitViewProps) {
  const is_tablet = use_show_tablet_split_view();
  const [is_dragging, set_is_dragging] = useState(false);
  const [list_width, set_list_width] = useState(list_width_percent);

  const handle_resize_start = useCallback(() => {
    set_is_dragging(true);
  }, []);

  const handle_resize = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!is_dragging) return;

      const container_width = window.innerWidth;
      const client_x = "touches" in e ? e.touches[0].clientX : e.clientX;
      const new_width_percent = (client_x / container_width) * 100;

      const clamped_width = Math.max(
        (min_list_width / container_width) * 100,
        Math.min((max_list_width / container_width) * 100, new_width_percent),
      );

      set_list_width(clamped_width);
    },
    [is_dragging, min_list_width, max_list_width],
  );

  const handle_resize_end = useCallback(() => {
    set_is_dragging(false);
  }, []);

  if (!is_tablet) {
    return (
      <div className="flex h-full flex-col">
        <AnimatePresence mode="wait">
          {has_selection && detail_content ? (
            <motion.div
              key="detail"
              animate={{ x: 0 }}
              className="flex h-full flex-col"
              exit={{ x: "100%" }}
              initial={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {detail_content}
            </motion.div>
          ) : (
            <motion.div
              key="list"
              animate={{ opacity: 1 }}
              className="flex h-full flex-col"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
            >
              {list_content}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div
      className="flex h-full"
      onMouseLeave={handle_resize_end}
      onMouseMove={handle_resize}
      onMouseUp={handle_resize_end}
      onTouchEnd={handle_resize_end}
      onTouchMove={handle_resize}
    >
      <div
        className="flex h-full flex-shrink-0 flex-col border-r border-border"
        style={{ width: `${list_width}%` }}
      >
        {list_content}
      </div>

      <div
        className={cn(
          "flex h-full w-1 cursor-col-resize items-center justify-center",
          "bg-border transition-colors hover:bg-primary/50",
          is_dragging && "bg-primary",
        )}
        onMouseDown={handle_resize_start}
        onTouchStart={handle_resize_start}
      >
        <div className="h-8 w-1 rounded-full bg-muted-foreground/30" />
      </div>

      <div className="flex h-full flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {has_selection && detail_content ? (
            <motion.div
              key="detail"
              animate={{ opacity: 1 }}
              className="flex h-full flex-col"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {detail_content}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center text-muted-foreground"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
            >
              <p>Select an email to read</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface ResponsiveLayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
  show_sidebar?: boolean;
}

export function ResponsiveLayout({
  children,
  sidebar,
  show_sidebar = true,
}: ResponsiveLayoutProps) {
  const is_tablet = use_show_tablet_split_view();

  if (!is_tablet) {
    return <div className="flex h-full flex-col">{children}</div>;
  }

  return (
    <div className="flex h-full">
      {sidebar && show_sidebar && (
        <div className="h-full w-64 flex-shrink-0 border-r border-border">
          {sidebar}
        </div>
      )}
      <div className="flex h-full flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
