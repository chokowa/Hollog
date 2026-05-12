"use client";

import { createPortal } from "react-dom";
import { CalendarDays, Copy, Eye, EyeOff, ImageIcon, Settings2, Trash2 } from "lucide-react";

export type TagContextAction = "media" | "calendar" | "copy" | "visibility" | "manage" | "delete";

type TagContextMenuProps = {
  tag: string;
  isOpen: boolean;
  position: { left: number; top: number } | null;
  hasMedia: boolean;
  hidden: boolean;
  onClose: () => void;
  onAction: (action: TagContextAction, tag: string) => void;
};

export function TagContextMenu({
  tag,
  isOpen,
  position,
  hasMedia,
  hidden,
  onClose,
  onAction,
}: TagContextMenuProps) {
  if (!isOpen || !position || typeof document === "undefined") return null;

  const items = [
    { action: "media" as const, label: "メディア", icon: ImageIcon, disabled: !hasMedia },
    { action: "calendar" as const, label: "カレンダー", icon: CalendarDays },
    { action: "copy" as const, label: "タグ名をコピー", icon: Copy },
    { action: "visibility" as const, label: hidden ? "再表示" : "非表示", icon: hidden ? Eye : EyeOff },
    { action: "manage" as const, label: "タグ管理", icon: Settings2 },
    { action: "delete" as const, label: "投稿削除", icon: Trash2, destructive: true },
  ];

  return createPortal(
    <>
      <button type="button" className="fixed inset-0 z-[109] cursor-default" onClick={onClose} aria-label="閉じる" />
      <div
        style={{ left: position.left, top: position.top }}
        className="fixed z-[110] w-48 overflow-hidden rounded-2xl border border-border bg-card p-1 text-sm shadow-2xl"
      >
        {items.map(({ action, label, icon: Icon, disabled, destructive }) => (
          <button
            key={action}
            type="button"
            disabled={disabled}
            onClick={() => {
              onAction(action, tag);
              onClose();
            }}
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition disabled:opacity-35 ${
              destructive
                ? "text-red-500 hover:bg-red-50"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
