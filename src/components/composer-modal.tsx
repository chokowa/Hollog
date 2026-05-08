import { useEffect } from "react";

import { PostComposer, type PostFormValue } from "@/components/ui/post-composer";

type ComposerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  value: PostFormValue;
  onChange: (value: PostFormValue) => void;
  onImagesSelect: (files: File[]) => void;
  imagePreviewUrls?: string[];
  imageError?: string;
  isBusy?: boolean;
};

export function ComposerModal({
  isOpen,
  onClose,
  onSubmit,
  value,
  onChange,
  onImagesSelect,
  imagePreviewUrls,
  imageError,
  isBusy,
}: ComposerModalProps) {
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-2 backdrop-blur-[3px]">
      <div
        className="absolute inset-0"
        onClick={onClose}
      />

      <div className="relative mt-2 w-full max-w-md animate-[composer-sheet-in_180ms_cubic-bezier(0.2,0.8,0.2,1)] overflow-hidden rounded-[28px] bg-card shadow-2xl">
        <div className="max-h-[calc(100vh-1rem)] overflow-y-auto screen-scroll">
          <PostComposer
            submitLabel="保存する"
            value={value}
            imagePreviewUrls={imagePreviewUrls}
            imageError={imageError}
            pending={isBusy}
            onCancel={onClose}
            onChange={onChange}
            onImagesSelect={onImagesSelect}
            onSubmit={onSubmit}
          />
        </div>
      </div>
    </div>
  );
}
