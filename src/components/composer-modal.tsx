"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PostComposer, type PostFormValue } from "@/components/ui/post-composer";

type ComposerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  title: string;
  submitLabel?: string;
  value: PostFormValue;
  onChange: (value: PostFormValue) => void;
  onImagesSelect: (files: File[]) => void;
  onNativeImagesSelect?: () => void;
  onNativeClipboardImagesSelect?: () => void;
  imagePreviewUrls?: string[];
  mediaPreviewUrls?: string[];
  imageError?: string;
  isBusy?: boolean;
  autoTagUrls?: boolean;
};

export function ComposerModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  submitLabel = "保存する",
  value,
  onChange,
  onImagesSelect,
  onNativeImagesSelect,
  onNativeClipboardImagesSelect,
  imagePreviewUrls,
  mediaPreviewUrls,
  imageError,
  isBusy,
  autoTagUrls,
}: ComposerModalProps) {
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const requestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setIsClosing(false);
      onClose();
    }, 160);
  }, [isClosing, onClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    const originalStyles = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.position = originalStyles.position;
      document.body.style.top = originalStyles.top;
      document.body.style.width = originalStyles.width;
      document.body.style.overflow = originalStyles.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  if (!isOpen && !isClosing) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-2 backdrop-blur-[3px] ${isClosing ? "composer-backdrop-out" : "composer-backdrop-in"}`}>
      <div
        className="absolute inset-0"
        onClick={requestClose}
      />

      <div className={`relative mt-2 w-full max-w-md overflow-hidden rounded-[28px] bg-card shadow-2xl ${isClosing ? "composer-sheet-out" : "composer-sheet-in"}`}>
        <div className="max-h-[calc(100vh-1rem)] overflow-y-auto screen-scroll">
          <PostComposer
            title={title}
            submitLabel={submitLabel}
            value={value}
            imagePreviewUrls={imagePreviewUrls}
            mediaPreviewUrls={mediaPreviewUrls}
            imageError={imageError}
            pending={isBusy}
            onCancel={requestClose}
            onChange={onChange}
            onImagesSelect={onImagesSelect}
            onNativeImagesSelect={onNativeImagesSelect}
            onNativeClipboardImagesSelect={onNativeClipboardImagesSelect}
            onSubmit={onSubmit}
            autoTagUrls={autoTagUrls}
          />
        </div>
      </div>
    </div>
  );
}
