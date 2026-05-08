"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

type ImageViewerProps = {
  images: string[];
  initialIndex?: number;
  originRect?: {
    top: number;
    left: number;
    width: number;
    height: number;
  } | null;
  getOriginRect?: (index: number) => Rect | null;
  onClose: () => void;
};

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function ImageViewer({ images, initialIndex = 0, originRect, getOriginRect, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isClosingToOrigin, setIsClosingToOrigin] = useState(false);
  const [closingRect, setClosingRect] = useState<Rect | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragOffsetRef = useRef(0);
  const portalRoot = typeof document === "undefined" ? null : document.body;

  // 最小スワイプ距離(px)
  const minSwipeDistance = 50;

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const scheduleDragOffset = useCallback((nextOffset: number) => {
    pendingDragOffsetRef.current = nextOffset;
    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      setDragOffsetY(pendingDragOffsetRef.current);
    });
  }, []);

  const closeAfterKillingScroll = useCallback((delay = 0) => {
    const scrollY = window.scrollY;
    let releaseTimer: number | undefined;

    const preventScroll = (event: Event) => {
      event.preventDefault();
    };

    window.addEventListener("touchmove", preventScroll, { passive: false });
    window.addEventListener("wheel", preventScroll, { passive: false });

    window.setTimeout(onClose, delay);

    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
      releaseTimer = window.setTimeout(() => {
        window.removeEventListener("touchmove", preventScroll);
        window.removeEventListener("wheel", preventScroll);
        window.scrollTo(0, scrollY);
      }, 160);
    });

    window.setTimeout(() => {
      if (releaseTimer !== undefined) return;
      window.removeEventListener("touchmove", preventScroll);
      window.removeEventListener("wheel", preventScroll);
    }, 250);
  }, [onClose]);

  const closeToOrigin = useCallback(() => {
    const closeOriginRect = getOriginRect?.(currentIndex) ?? originRect;

    if (!closeOriginRect) {
      closeAfterKillingScroll();
      return;
    }

    const imageRect = imageRef.current?.getBoundingClientRect();
    setClosingRect(imageRect ? {
      top: imageRect.top,
      left: imageRect.left,
      width: imageRect.width,
      height: imageRect.height,
    } : {
      top: window.innerHeight / 2,
      left: window.innerWidth / 2,
      width: 1,
      height: 1,
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsClosingToOrigin(true);
        setClosingRect(closeOriginRect);
        closeAfterKillingScroll(180);
      });
    });
  }, [closeAfterKillingScroll, currentIndex, getOriginRect, originRect]);

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    scheduleDragOffset(0);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;

    const nextTouch = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    };
    const deltaX = nextTouch.x - touchStart.x;
    const deltaY = nextTouch.y - touchStart.y;

    setTouchEnd(nextTouch);
    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
      scheduleDragOffset(Math.max(-160, Math.min(deltaY, 160)));
    }
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) {
      scheduleDragOffset(0);
      return;
    }

    const deltaX = touchEnd.x - touchStart.x;
    const deltaY = touchEnd.y - touchStart.y;
    const isVerticalClose = Math.abs(deltaY) > 72 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2;
    const isLeftSwipe = deltaX < -minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY);
    const isRightSwipe = deltaX > minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY);

    if (isVerticalClose) {
      closeToOrigin();
      return;
    }

    if (isLeftSwipe) {
      handleNext();
    }
    if (isRightSwipe) {
      handlePrev();
    }
    scheduleDragOffset(0);
  };

  useEffect(() => {
    if (!portalRoot) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    const originalOverflow = document.body.style.overflow;

    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [handleNext, handlePrev, onClose, portalRoot]);

  useEffect(() => {
    return () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
    };
  }, []);

  if (!images || images.length === 0 || !portalRoot) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col transition-[background-color,backdrop-filter] duration-[230ms] ease-out"
      style={{
        backgroundColor: isClosingToOrigin ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.95)",
        backdropFilter: isClosingToOrigin ? "blur(0px)" : "blur(4px)",
      }}
    >
      {/* ヘッダー */}
      <div
        className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between p-4 text-white transition-opacity duration-150"
        style={{ opacity: isClosingToOrigin ? 0 : 1 }}
      >
        <div className="text-sm font-medium">
          {currentIndex + 1} / {images.length}
        </div>
        <button
          onClick={onClose}
          className="rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
        >
          <X size={24} />
        </button>
      </div>

      {/* メインビュー */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        style={{ touchAction: "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={onClose}
      >
        <div
          className="flex items-center justify-center ease-out will-change-transform"
          style={{
            ...(closingRect
              ? {
                  position: "fixed",
                  top: `${closingRect.top}px`,
                  left: `${closingRect.left}px`,
                  width: `${closingRect.width}px`,
                  height: `${closingRect.height}px`,
                  zIndex: 1,
                }
              : {
                  maxHeight: "100%",
                  maxWidth: "100%",
                }),
            transform: closingRect ? "none" : `translateY(${dragOffsetY}px)`,
            opacity: Math.max(0.72, 1 - Math.abs(dragOffsetY) / 420),
            transitionDuration: isClosingToOrigin ? "180ms" : dragOffsetY === 0 ? "150ms" : "0ms",
            transitionProperty: closingRect ? "top, left, width, height, opacity" : "transform, opacity",
            transitionTimingFunction: isClosingToOrigin ? "cubic-bezier(0.2, 0.8, 0.2, 1)" : undefined,
          }}
        >
          {/* User-selected blob URLs need native img behavior for the gesture viewer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={images[currentIndex]}
            alt={`View ${currentIndex + 1}`}
            className={`select-none ${closingRect ? "h-full w-full object-cover" : "max-h-full max-w-full object-contain"}`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* 左右ナビゲーション (PC向け) */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white/80 hidden sm:block hover:bg-black/80 hover:text-white transition-colors"
            >
              <ChevronLeft size={32} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white/80 hidden sm:block hover:bg-black/80 hover:text-white transition-colors"
            >
              <ChevronRight size={32} />
            </button>
          </>
        )}
      </div>
    </div>,
    portalRoot,
  );
}
