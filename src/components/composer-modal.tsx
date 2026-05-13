"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PostComposer, type InlineImageSource, type PostFormValue } from "@/components/ui/post-composer";

const COMPOSER_CLOSE_REQUEST_EVENT = "bocchi:composer-close-request";

type ComposerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (pendingTag?: string) => void;
  title: string;
  submitLabel?: string;
  value: PostFormValue;
  onChange: (value: PostFormValue) => void;
  onImagesSelect: (files: File[], source?: InlineImageSource) => void;
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
      onClose();
    }, 160);
  }, [isClosing, onClose]);

  useEffect(() => {
    if (isOpen || !isClosing) return;

    const unmountTimer = window.setTimeout(() => {
      setIsClosing(false);
    }, 40);
    return () => window.clearTimeout(unmountTimer);
  }, [isClosing, isOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleCloseRequest = () => requestClose();
    window.addEventListener(COMPOSER_CLOSE_REQUEST_EVENT, handleCloseRequest);
    return () => window.removeEventListener(COMPOSER_CLOSE_REQUEST_EVENT, handleCloseRequest);
  }, [isOpen, requestClose]);

  if (!isOpen && !isClosing) return null;

  return (
    <div className={`composer-modal-layer fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-2 ${isClosing ? "composer-backdrop-out" : "composer-backdrop-in"}`}>
      <div
        className="absolute inset-0"
        onClick={requestClose}
      />

      <div className={`relative mt-2 w-full max-w-md overflow-hidden rounded-[28px] bg-card shadow-2xl ${isClosing ? "composer-sheet-out" : "composer-sheet-in"}`}>
        <div className="max-h-[calc(100vh-1rem)] overflow-y-auto overscroll-contain screen-scroll">
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
