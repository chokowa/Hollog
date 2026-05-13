"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import type { ImageOriginRect } from "@/types/navigation";

type ImageViewerProps = {
  images: string[];
  initialIndex?: number;
  originRect?: ImageOriginRect | null;
  getOriginRect?: (index: number) => ImageOriginRect | null;
  onCopyCurrentImage?: (index: number) => void | Promise<void>;
  onClose: () => void;
};

type TouchPoint = {
  clientX: number;
  clientY: number;
};

const MIN_ZOOM_SCALE = 1;
const MAX_ZOOM_SCALE = 4;
const ZOOM_GESTURE_EPSILON = 0.01;

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getTouchDistance(first: TouchPoint, second: TouchPoint) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function getTouchCenter(first: TouchPoint, second: TouchPoint) {
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
  };
}

export function ImageViewer({ images, initialIndex = 0, originRect, getOriginRect, onCopyCurrentImage, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isHorizontalDragging, setIsHorizontalDragging] = useState(false);
  const [isClosingToOrigin, setIsClosingToOrigin] = useState(false);
  const [closingRect, setClosingRect] = useState<ImageOriginRect | null>(null);
  const [imageMenuPosition, setImageMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [zoomScale, setZoomScale] = useState(MIN_ZOOM_SCALE);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const imageRefs = useRef(new Map<number, HTMLImageElement>());
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragOffsetRef = useRef(0);
  const slideFrameRef = useRef<number | null>(null);
  const pendingDragOffsetXRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number } | null>(null);
  const zoomScaleRef = useRef(MIN_ZOOM_SCALE);
  const imageOffsetRef = useRef({ x: 0, y: 0 });
  const panStateRef = useRef<{
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const pinchStateRef = useRef<{
    distance: number;
    scale: number;
    centerX: number;
    centerY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const imageLongPressTimerRef = useRef<number | null>(null);
  const imageLongPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const imageLongPressTriggeredRef = useRef(false);
  const portalRoot = typeof document === "undefined" ? null : document.body;

  // 最小スワイプ距離(px)
  const minSwipeDistance = 50;

  const applyZoomState = useCallback((nextScale: number, nextOffset: { x: number; y: number }) => {
    zoomScaleRef.current = nextScale;
    imageOffsetRef.current = nextOffset;
    setZoomScale(nextScale);
    setImageOffset(nextOffset);
  }, []);

  const resetZoom = useCallback(() => {
    panStateRef.current = null;
    pinchStateRef.current = null;
    applyZoomState(MIN_ZOOM_SCALE, { x: 0, y: 0 });
  }, [applyZoomState]);

  const clampImageOffset = useCallback((nextOffsetX: number, nextOffsetY: number, scale: number) => {
    if (scale <= MIN_ZOOM_SCALE + ZOOM_GESTURE_EPSILON) {
      return { x: 0, y: 0 };
    }

    const imageNode = imageRefs.current.get(currentIndex);
    const viewerNode = viewerRef.current;
    if (!imageNode || !viewerNode) {
      return { x: nextOffsetX, y: nextOffsetY };
    }

    const maxOffsetX = Math.max(0, ((imageNode.clientWidth * scale) - viewerNode.clientWidth) / 2);
    const maxOffsetY = Math.max(0, ((imageNode.clientHeight * scale) - viewerNode.clientHeight) / 2);

    return {
      x: clampValue(nextOffsetX, -maxOffsetX, maxOffsetX),
      y: clampValue(nextOffsetY, -maxOffsetY, maxOffsetY),
    };
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    resetZoom();
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length, resetZoom]);

  const handlePrev = useCallback(() => {
    resetZoom();
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length, resetZoom]);

  const requestClose = useCallback(() => {
    setImageMenuPosition(null);
    onClose();
  }, [onClose]);

  const clearImageLongPress = useCallback(() => {
    if (imageLongPressTimerRef.current !== null) {
      window.clearTimeout(imageLongPressTimerRef.current);
      imageLongPressTimerRef.current = null;
    }
    imageLongPressStartRef.current = null;
  }, []);

  const openImageMenu = useCallback((left: number, top: number) => {
    const menuWidth = 184;
    const menuHeight = 52;
    const gap = 8;
    const fingerOffset = 56;
    const preferredLeft = left - (menuWidth / 2);
    const preferredTop = top - fingerOffset - menuHeight;
    setImageMenuPosition({
      left: Math.max(gap, Math.min(preferredLeft, window.innerWidth - menuWidth - gap)),
      top: Math.max(gap, Math.min(preferredTop, window.innerHeight - menuHeight - gap)),
    });
  }, []);

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
    if (e.touches.length === 2) {
      const center = getTouchCenter(e.touches[0], e.touches[1]);
      pinchStateRef.current = {
        distance: getTouchDistance(e.touches[0], e.touches[1]),
        scale: zoomScaleRef.current,
        centerX: center.x,
        centerY: center.y,
        offsetX: imageOffsetRef.current.x,
        offsetY: imageOffsetRef.current.y,
      };
      panStateRef.current = null;
      touchStartRef.current = null;
      touchEndRef.current = null;
      setIsHorizontalDragging(false);
      scheduleDragOffsetX(0);
      scheduleDragOffset(0);
      return;
    }

    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    if (zoomScaleRef.current > MIN_ZOOM_SCALE + ZOOM_GESTURE_EPSILON) {
      panStateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        offsetX: imageOffsetRef.current.x,
        offsetY: imageOffsetRef.current.y,
      };
      touchStartRef.current = null;
      touchEndRef.current = null;
      return;
    }

    touchEndRef.current = null;
    setIsHorizontalDragging(false);
    scheduleDragOffsetX(0);
    scheduleDragOffset(0);
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      const pinchState = pinchStateRef.current;
      if (!pinchState) return;

      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      const center = getTouchCenter(e.touches[0], e.touches[1]);
      const nextScale = clampValue(
        pinchState.scale * (distance / Math.max(pinchState.distance, 1)),
        MIN_ZOOM_SCALE,
        MAX_ZOOM_SCALE,
      );
      const nextOffset = clampImageOffset(
        pinchState.offsetX + (center.x - pinchState.centerX),
        pinchState.offsetY + (center.y - pinchState.centerY),
        nextScale,
      );
      applyZoomState(nextScale, nextOffset);
      return;
    }

    if (e.touches.length !== 1) return;

    if (zoomScaleRef.current > MIN_ZOOM_SCALE + ZOOM_GESTURE_EPSILON) {
      const panState = panStateRef.current;
      if (!panState) return;

      const touch = e.touches[0];
      const nextOffset = clampImageOffset(
        panState.offsetX + (touch.clientX - panState.startX),
        panState.offsetY + (touch.clientY - panState.startY),
        zoomScaleRef.current,
      );
      applyZoomState(zoomScaleRef.current, nextOffset);
      return;
    }

    const touchStart = touchStartRef.current;
    if (!touchStart) return;

    const nextTouch = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    const deltaX = nextTouch.x - touchStart.x;
    const deltaY = nextTouch.y - touchStart.y;

    touchEndRef.current = nextTouch;
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
    if (pinchStateRef.current) {
      pinchStateRef.current = null;
      if (e.touches.length === 1 && zoomScaleRef.current > MIN_ZOOM_SCALE + ZOOM_GESTURE_EPSILON) {
        const touch = e.touches[0];
        panStateRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          offsetX: imageOffsetRef.current.x,
          offsetY: imageOffsetRef.current.y,
        };
        return;
      }
      if (zoomScaleRef.current <= MIN_ZOOM_SCALE + ZOOM_GESTURE_EPSILON) {
        resetZoom();
      }
      return;
    }

    if (zoomScaleRef.current > MIN_ZOOM_SCALE + ZOOM_GESTURE_EPSILON) {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        panStateRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          offsetX: imageOffsetRef.current.x,
          offsetY: imageOffsetRef.current.y,
        };
      } else {
        panStateRef.current = null;
      }
      return;
    }

    const touchStart = touchStartRef.current;
    const touchEnd = touchEndRef.current;
    touchStartRef.current = null;
    touchEndRef.current = null;

    if (!touchStart || !touchEnd) {
      scheduleDragOffset(0);
      scheduleDragOffsetX(0);
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

  const onTouchCancel = (e: React.TouchEvent) => {
    e.stopPropagation();
    clearImageLongPress();
    pinchStateRef.current = null;
    panStateRef.current = null;
    touchStartRef.current = null;
    touchEndRef.current = null;
    setIsHorizontalDragging(false);
    scheduleDragOffsetX(0);
    scheduleDragOffset(0);
  };

  const onImagePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!onCopyCurrentImage) return;
    if (e.pointerType === "mouse" && e.button !== 2) return;
    if (e.pointerType !== "mouse" && !e.isPrimary) return;

    imageLongPressTriggeredRef.current = false;
    clearImageLongPress();
    imageLongPressStartRef.current = { x: e.clientX, y: e.clientY };

    if (e.pointerType === "mouse" && e.button === 2) {
      openImageMenu(e.clientX, e.clientY);
      imageLongPressTriggeredRef.current = true;
      return;
    }

    imageLongPressTimerRef.current = window.setTimeout(() => {
      imageLongPressTriggeredRef.current = true;
      openImageMenu(e.clientX, e.clientY);
      imageLongPressTimerRef.current = null;
      imageLongPressStartRef.current = null;
    }, 420);
  };

  const onImagePointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    const start = imageLongPressStartRef.current;
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
      clearImageLongPress();
    }
  };

  const onImagePointerUp = () => {
    clearImageLongPress();
  };

  const onImageContextMenu = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!onCopyCurrentImage) return;
    e.preventDefault();
    e.stopPropagation();
    imageLongPressTriggeredRef.current = true;
    clearImageLongPress();
    openImageMenu(e.clientX, e.clientY);
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
    if (!imageMenuPosition) return;
    const closeMenu = () => setImageMenuPosition(null);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [imageMenuPosition]);

  useEffect(() => {
    return () => {
      clearImageLongPress();
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
      if (slideFrameRef.current !== null) {
        window.cancelAnimationFrame(slideFrameRef.current);
      }
    };
  }, [clearImageLongPress]);

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
      onClick={() => {
        if (imageMenuPosition) {
          setImageMenuPosition(null);
        }
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
          onClick={requestClose}
          className="rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
          aria-label="画像ビューアを閉じる"
        >
          <X size={24} />
        </button>
      </div>

      {/* メインビュー */}
      <div
        ref={viewerRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        style={{ touchAction: "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        onClick={() => {
          if (imageLongPressTriggeredRef.current) {
            imageLongPressTriggeredRef.current = false;
            return;
          }
          requestClose();
        }}
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
              onPointerDown={onImagePointerDown}
              onPointerMove={onImagePointerMove}
              onPointerUp={onImagePointerUp}
              onPointerCancel={onImagePointerUp}
              onContextMenu={onImageContextMenu}
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
                    style={index === currentIndex ? {
                      transform: `translate3d(${imageOffset.x}px, ${imageOffset.y}px, 0) scale(${zoomScale})`,
                      transformOrigin: "center center",
                    } : undefined}
                    draggable={false}
                    onPointerDown={index === currentIndex ? onImagePointerDown : undefined}
                    onPointerMove={index === currentIndex ? onImagePointerMove : undefined}
                    onPointerUp={index === currentIndex ? onImagePointerUp : undefined}
                    onPointerCancel={index === currentIndex ? onImagePointerUp : undefined}
                    onContextMenu={index === currentIndex ? onImageContextMenu : undefined}
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
      {imageMenuPosition && onCopyCurrentImage && (
        <>
          <button
            type="button"
            aria-label="コピー menu を閉じる"
            className="fixed inset-0 z-[109] cursor-default bg-transparent"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setImageMenuPosition(null);
            }}
          />
          <div
            style={{ left: imageMenuPosition.left, top: imageMenuPosition.top }}
            className="image-viewer-copy-menu fixed z-[110] w-[184px] overflow-hidden rounded-2xl border border-border bg-card p-1 text-sm shadow-2xl select-none"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setImageMenuPosition(null);
                void onCopyCurrentImage(currentIndex);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-card-foreground transition hover:bg-muted select-none"
              style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <Copy size={15} />
              <span>画像をコピー</span>
            </button>
          </div>
        </>
      )}
    </div>,
    portalRoot,
  );
}
