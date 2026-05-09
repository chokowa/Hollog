"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { ImageOriginRect } from "@/types/navigation";

type ImageViewerProps = {
  images: string[];
  initialIndex?: number;
  originRect?: ImageOriginRect | null;
  getOriginRect?: (index: number) => ImageOriginRect | null;
  onClose: () => void;
};

export function ImageViewer({ images, initialIndex = 0, originRect, getOriginRect, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isHorizontalDragging, setIsHorizontalDragging] = useState(false);
  const [isClosingToOrigin, setIsClosingToOrigin] = useState(false);
  const [closingRect, setClosingRect] = useState<ImageOriginRect | null>(null);
  const imageRefs = useRef(new Map<number, HTMLImageElement>());
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragOffsetRef = useRef(0);
  const slideFrameRef = useRef<number | null>(null);
  const pendingDragOffsetXRef = useRef(0);
  const portalRoot = typeof document === "undefined" ? null : document.body;

  // 最小スワイプ距離(px)
  const minSwipeDistance = 50;

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const requestClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const scheduleDragOffset = useCallback((nextOffset: number) => {
    pendingDragOffsetRef.current = nextOffset;
    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      setDragOffsetY(pendingDragOffsetRef.current);
    });
  }, []);

  const scheduleDragOffsetX = useCallback((nextOffset: number) => {
    pendingDragOffsetXRef.current = nextOffset;
    if (slideFrameRef.current !== null) return;

    slideFrameRef.current = window.requestAnimationFrame(() => {
      slideFrameRef.current = null;
      setDragOffsetX(pendingDragOffsetXRef.current);
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

    window.setTimeout(() => {
      onClose();
    }, delay);

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

    const imageRect = imageRefs.current.get(currentIndex)?.getBoundingClientRect();
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
    e.stopPropagation();
    setTouchEnd(null);
    setIsHorizontalDragging(false);
    scheduleDragOffsetX(0);
    scheduleDragOffset(0);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!touchStart) return;

    const nextTouch = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    };
    const deltaX = nextTouch.x - touchStart.x;
    const deltaY = nextTouch.y - touchStart.y;

    setTouchEnd(nextTouch);
    if (Math.abs(deltaX) > Math.abs(deltaY) && images.length > 1) {
      setIsHorizontalDragging(true);
      scheduleDragOffset(0);
      scheduleDragOffsetX(Math.max(-window.innerWidth, Math.min(deltaX, window.innerWidth)));
      return;
    }

    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
      setIsHorizontalDragging(false);
      scheduleDragOffsetX(0);
      scheduleDragOffset(Math.max(-160, Math.min(deltaY, 160)));
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!touchStart || !touchEnd) {
      scheduleDragOffset(0);
      return;
    }

    const deltaX = touchEnd.x - touchStart.x;
    const deltaY = touchEnd.y - touchStart.y;
    const isVerticalClose = Math.abs(deltaY) > 72 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2;
    const isLeftSwipe = deltaX < -minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY);
    const isRightSwipe = deltaX > minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY);

    setIsHorizontalDragging(false);

    if (isVerticalClose) {
      scheduleDragOffsetX(0);
      closeToOrigin();
      return;
    }

    if (isLeftSwipe) {
      handleNext();
    }
    if (isRightSwipe) {
      handlePrev();
    }
    scheduleDragOffsetX(0);
    scheduleDragOffset(0);
  };

  useEffect(() => {
    if (!portalRoot) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    const originalOverflow = document.body.style.overflow;
    const originalImageViewerState = document.documentElement.dataset.imageViewer;

    window.addEventListener("keydown", handleKeyDown);
    document.documentElement.dataset.imageViewer = "open";
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (originalImageViewerState === undefined) {
        delete document.documentElement.dataset.imageViewer;
      } else {
        document.documentElement.dataset.imageViewer = originalImageViewerState;
      }
      document.body.style.overflow = originalOverflow;
    };
  }, [handleNext, handlePrev, portalRoot, requestClose]);

  useEffect(() => {
    return () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
      if (slideFrameRef.current !== null) {
        window.cancelAnimationFrame(slideFrameRef.current);
      }
    };
  }, []);

  if (!images || images.length === 0 || !portalRoot) return null;

  return createPortal(
    <div
      data-image-viewer="true"
      className="fixed inset-0 z-[100] flex flex-col transition-[background-color,backdrop-filter] duration-[230ms] ease-out"
      style={{
        backgroundColor: isClosingToOrigin ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.95)",
        backdropFilter: isClosingToOrigin ? "blur(0px)" : "blur(4px)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerCancel={(e) => e.stopPropagation()}
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
          onClick={requestClose}
          className="rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
          aria-label="画像ビューアを閉じる"
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
        onClick={requestClose}
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
                  height: "100%",
                  maxHeight: "100%",
                  maxWidth: "100%",
                  width: "100%",
                }),
            transform: closingRect ? "none" : `translateY(${dragOffsetY}px)`,
            opacity: Math.max(0.72, 1 - Math.abs(dragOffsetY) / 420),
            transitionDuration: isClosingToOrigin ? "180ms" : dragOffsetY === 0 ? "150ms" : "0ms",
            transitionProperty: closingRect ? "top, left, width, height, opacity" : "transform, opacity",
            transitionTimingFunction: isClosingToOrigin ? "cubic-bezier(0.2, 0.8, 0.2, 1)" : undefined,
          }}
        >
          {closingRect ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              ref={(node) => {
                if (node) {
                  imageRefs.current.set(currentIndex, node);
                } else {
                  imageRefs.current.delete(currentIndex);
                }
              }}
              src={images[currentIndex]}
              alt={`View ${currentIndex + 1}`}
              className="h-full w-full select-none object-cover"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="flex h-full w-screen will-change-transform"
              style={{
                transform: `translateX(calc(${-currentIndex * 100}% + ${dragOffsetX}px))`,
                transition: isHorizontalDragging
                  ? "none"
                  : "transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
            >
              {images.map((image, index) => (
                <div key={`${image}-${index}`} className="flex h-full w-screen shrink-0 items-center justify-center px-3">
                  {/* User-selected blob URLs need native img behavior for the gesture viewer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={(node) => {
                      if (node) {
                        imageRefs.current.set(index, node);
                      } else {
                        imageRefs.current.delete(index);
                      }
                    }}
                    src={image}
                    alt={`View ${index + 1}`}
                    className="max-h-full max-w-full select-none object-contain"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 左右ナビゲーション (PC向け) */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="image-viewer-nav-button absolute left-2 top-1/2 h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/80 hover:text-white sm:left-4 sm:h-14 sm:w-14"
              aria-label="前の画像"
            >
              <ChevronLeft size={28} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="image-viewer-nav-button absolute right-2 top-1/2 h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/80 hover:text-white sm:right-4 sm:h-14 sm:w-14"
              aria-label="次の画像"
            >
              <ChevronRight size={28} />
            </button>
          </>
        )}
      </div>
    </div>,
    portalRoot,
  );
}
