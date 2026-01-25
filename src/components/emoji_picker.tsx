import { useState } from "react";
import { motion } from "framer-motion";

import { emoji_categories, get_all_emojis } from "@/config/emoji";

function EmojiPicker({ on_select }: { on_select: (emoji: string) => void }) {
  const [active_category, set_active_category] = useState<string>("smileys");
  const [search_query, set_search_query] = useState("");

  const current_category = emoji_categories[active_category];
  const current_emojis = search_query
    ? get_all_emojis().filter((emoji: string) => emoji.includes(search_query))
    : current_category.emojis;

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="absolute bottom-full right-0 mb-2 border rounded-2xl shadow-xl w-80 z-50"
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      style={{
        backgroundColor: "var(--dropdown-bg)",
        borderColor: "var(--border-secondary)",
      }}
      transition={{
        duration: 0.2,
        type: "spring",
        stiffness: 300,
        damping: 30,
      }}
    >
      <div
        className="p-4 border-b"
        style={{ borderColor: "var(--border-secondary)" }}
      >
        <input
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          placeholder="Search emojis..."
          style={{
            backgroundColor: "var(--input-bg)",
            borderColor: "var(--input-border)",
            color: "var(--text-primary)",
          }}
          type="text"
          value={search_query}
          onChange={(e) => set_search_query(e.target.value)}
        />
      </div>

      <div
        className="flex gap-1 p-3 border-b"
        style={{
          borderColor: "var(--border-secondary)",
          backgroundColor: "var(--bg-tertiary)",
        }}
      >
        {Object.entries(emoji_categories).map(
          ([category_key, category_data]) => (
            <motion.button
              key={category_key}
              className="text-xl p-2 rounded-lg transition-colors"
              style={{
                backgroundColor:
                  active_category === category_key ? "#3b82f6" : "transparent",
                color:
                  active_category === category_key
                    ? "#ffffff"
                    : "var(--text-secondary)",
              }}
              title={category_data.label}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                set_active_category(category_key);
                set_search_query("");
              }}
            >
              {category_data.icon}
            </motion.button>
          ),
        )}
      </div>

      <div className="grid grid-cols-8 gap-1 p-3 max-h-64 overflow-y-auto">
        {current_emojis.map((emoji: string, index: number) => (
          <motion.button
            key={`${active_category}-${index}`}
            className="text-2xl p-1 rounded transition-colors"
            whileHover={{ scale: 1.3 }}
            whileTap={{ scale: 0.8 }}
            onClick={() => on_select(emoji)}
          >
            {emoji}
          </motion.button>
        ))}
      </div>

      {current_emojis.length === 0 && (
        <div
          className="text-center py-8"
          style={{ color: "var(--text-muted)" }}
        >
          <p className="text-sm">No emojis found</p>
        </div>
      )}
    </motion.div>
  );
}

export default EmojiPicker;
