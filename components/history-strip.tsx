"use client";

import { CheckHistoryEntry } from "@/lib/types";

interface HistoryStripProps {
  history: CheckHistoryEntry[];
}

export function HistoryStrip({ history }: HistoryStripProps) {
  const recent = history.slice(-24);

  if (recent.length === 0) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Henüz yeterli geçmiş veri yok.
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      {recent.map((entry) => {
        const baseClass =
          entry.status === "up"
            ? entry.slow
              ? "bg-accent-yellow/60"
              : "bg-accent-green/70"
            : entry.status === "down"
              ? "bg-accent-red/70"
              : "bg-gray-500/40";

        return (
          <div
            key={`${entry.checkedAt}-${entry.location}`}
            className={`h-8 flex-1 rounded-sm ${baseClass}`}
            title={`${new Date(entry.checkedAt).toLocaleString("tr-TR")} · ${entry.status}`}
          />
        );
      })}
    </div>
  );
}
