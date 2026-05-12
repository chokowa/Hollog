import { MAX_INLINE_IMAGE_SIZE_BYTES } from "@/lib/image-validation";

const TARGET_MIME_TYPE = "image/jpeg";
const COMPRESSION_STEPS = [
  { maxEdge: 2048, quality: 0.82 },
  { maxEdge: 1800, quality: 0.78 },
  { maxEdge: 1600, quality: 0.74 },
  { maxEdge: 1280, quality: 0.7 },
];

export type ImageCompressionResult = {
  file: File;
  changed: boolean;
  originalSize: number;
  finalSize: number;
};

function loadImage(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);

  return new Promise<{ image: HTMLImageElement; revoke: () => void }>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve({ image, revoke: () => URL.revokeObjectURL(objectUrl) });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode image"));
    };
    image.src = objectUrl;
  });
}

function getResizedSize(width: number, height: number, maxEdge: number) {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) {
    return { width, height };
  }

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function getCompressedName(name: string) {
  const baseName = name.replace(/\.[^.]+$/, "") || "image";
  return `${baseName}.jpg`;
}

export function formatImageSize(size: number) {
  const mb = size / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)}MB`;
}

export async function compressLargeInlineImage(file: File): Promise<ImageCompressionResult> {
  if (file.size <= MAX_INLINE_IMAGE_SIZE_BYTES || file.type === "image/gif") {
    return {
      file,
      changed: false,
      originalSize: file.size,
      finalSize: file.size,
    };
  }

  try {
    const { image, revoke } = await loadImage(file);

    try {
      let bestFile: File | null = null;

      for (const step of COMPRESSION_STEPS) {
        const { width, height } = getResizedSize(image.naturalWidth, image.naturalHeight, step.maxEdge);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          continue;
        }

        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        const blob = await canvasToBlob(canvas, TARGET_MIME_TYPE, step.quality);
        if (!blob) {
          continue;
        }

        const compressedFile = new File([blob], getCompressedName(file.name), {
          type: TARGET_MIME_TYPE,
          lastModified: file.lastModified,
        });

        if (compressedFile.size < file.size && (!bestFile || compressedFile.size < bestFile.size)) {
          bestFile = compressedFile;
        }

        if (compressedFile.size <= MAX_INLINE_IMAGE_SIZE_BYTES) {
          break;
        }
      }

      if (bestFile) {
        return {
          file: bestFile,
          changed: true,
          originalSize: file.size,
          finalSize: bestFile.size,
        };
      }
    } finally {
      revoke();
    }
  } catch {
    // If decoding fails, keep the original image and let the post flow continue.
  }

  return {
    file,
    changed: false,
    originalSize: file.size,
    finalSize: file.size,
  };
}
