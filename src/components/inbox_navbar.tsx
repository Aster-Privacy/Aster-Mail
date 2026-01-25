import { useState } from "react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { SearchIcon } from "@/components/icons";

interface InboxNavbarProps {
  total_emails: number;
  unread_count: number;
  on_search: (query: string) => void;
}

export function InboxNavbar({
  total_emails,
  unread_count,
  on_search,
}: InboxNavbarProps) {
  const [search_query, set_search_query] = useState("");
  const [sort_by, set_sort_by] = useState("newest");

  const handle_search = (value: string) => {
    set_search_query(value);
    on_search(value);
  };

  const handle_clear = () => {
    set_search_query("");
    on_search("");
  };

  return (
    <motion.div
      animate={{ y: 0, opacity: 1 }}
      className="px-6 py-4 border-b"
      initial={{ y: -10, opacity: 0 }}
      style={{
        borderColor: "var(--border-secondary)",
        backgroundColor: "var(--bg-card)",
      }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <motion.div
            animate={{ opacity: 1 }}
            className="flex items-center gap-4 flex-1"
            initial={{ opacity: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center gap-2">
              <h1
                className="text-2xl font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Inbox
              </h1>
              <span
                className="text-sm"
                style={{ color: "var(--text-tertiary)" }}
              >
                {total_emails} {total_emails === 1 ? "message" : "messages"}
              </span>
              {unread_count > 0 && (
                <motion.span
                  animate={{ scale: 1 }}
                  className="px-3 py-1 text-xs font-semibold rounded-full"
                  initial={{ scale: 0 }}
                  style={{
                    backgroundColor: "rgba(59, 130, 246, 0.2)",
                    color: "#3b82f6",
                  }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  {unread_count} new
                </motion.span>
              )}
            </div>

            <div className="relative max-w-md">
              <SearchIcon
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-tertiary)" }}
              />
              <input
                className="pl-9 pr-8 py-2 text-sm rounded-md w-full border focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Search emails..."
                style={{
                  backgroundColor: "var(--input-bg)",
                  borderColor: "var(--input-border)",
                  color: "var(--text-primary)",
                }}
                type="text"
                value={search_query}
                onChange={(e) => handle_search(e.target.value)}
              />
              {search_query && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={handle_clear}
                >
                  x
                </button>
              )}
            </div>
          </motion.div>

          <motion.div
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
            initial={{ opacity: 0 }}
            transition={{ delay: 0.15 }}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost">
                  <span className="text-lg">...</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Inbox actions</DropdownMenuLabel>
                <DropdownMenuItem>Mark all as read</DropdownMenuItem>
                <DropdownMenuItem>Refresh</DropdownMenuItem>
                <DropdownMenuItem>Settings</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </motion.div>
        </div>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-3 items-center"
          initial={{ opacity: 0, y: 10 }}
          transition={{ delay: 0.2 }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="text-sm font-medium" variant="outline">
                Sort: {sort_by === "newest" ? "Newest" : "Oldest"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => set_sort_by("newest")}>
                Newest first
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => set_sort_by("oldest")}>
                Oldest first
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="text-sm font-medium" variant="outline">
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Filter emails</DropdownMenuLabel>
              <DropdownMenuItem>All emails</DropdownMenuItem>
              <DropdownMenuItem>Unread</DropdownMenuItem>
              <DropdownMenuItem>Starred</DropdownMenuItem>
              <DropdownMenuItem>With attachments</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </motion.div>
      </div>
    </motion.div>
  );
}
