"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";

type SwipeConfirmSheetProps = {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

const MAX_SWIPE = 180;
const CONFIRM_THRESHOLD = 140;

export function SwipeConfirmSheet({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: SwipeConfirmSheetProps) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const offsetRef = useRef(0);

  const resetDrag = () => {
    draggingRef.current = false;
    pointerIdRef.current = null;
    setIsDragging(false);
    offsetRef.current = 0;
    setOffset(0);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerCancel = (event: PointerEvent) => {
      if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return;
      resetDrag();
    };

    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [isDragging]);

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 px-4 pb-6 pt-12 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            resetDrag();
            onCancel();
          }
        }}
      />
      <div className="relative w-full max-w-sm rounded-[28px] border border-border bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-red-500/12 p-2 text-red-500">
            <AlertTriangle size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="mb-4 rounded-2xl bg-secondary p-2">
          <div className="relative h-14 touch-none overflow-hidden rounded-2xl bg-muted/50">
            <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-medium text-muted-foreground">
              右へスワイプして確認
            </div>
            <div
              className={`absolute left-1 top-1 flex h-12 touch-none items-center gap-2 rounded-2xl bg-red-500 px-4 text-sm font-medium text-white shadow-lg select-none ${isDragging ? "" : "transition-transform"}`}
              style={{ transform: `translateX(${offset}px)` }}
              onPointerDown={(event) => {
                event.preventDefault();
                draggingRef.current = true;
                pointerIdRef.current = event.pointerId;
                startXRef.current = event.clientX - offset;
                offsetRef.current = offset;
                setIsDragging(true);
                (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return;
                event.preventDefault();
                const nextOffset = Math.max(0, Math.min(MAX_SWIPE, event.clientX - startXRef.current));
                offsetRef.current = nextOffset;
                setOffset(nextOffset);
              }}
              onPointerUp={(event) => {
                if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return;
                draggingRef.current = false;
                pointerIdRef.current = null;
                setIsDragging(false);
                if (offsetRef.current >= CONFIRM_THRESHOLD) {
                  onConfirm();
                  return;
                }
                offsetRef.current = 0;
                setOffset(0);
              }}
              onPointerCancel={() => {
                if (!draggingRef.current) return;
                resetDrag();
              }}
            >
              <ChevronRight size={18} />
              <span>{confirmLabel}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            resetDrag();
            onCancel();
          }}
          className="w-full rounded-2xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
