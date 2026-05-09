const THUMBNAIL_MAX_EDGE = 640;
const THUMBNAIL_QUALITY = 0.78;

function getThumbnailSize(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return { width: THUMBNAIL_MAX_EDGE, height: THUMBNAIL_MAX_EDGE };
  }

  const longestEdge = Math.max(width, height);
  if (longestEdge <= THUMBNAIL_MAX_EDGE) {
    return { width, height };
  }

  const scale = THUMBNAIL_MAX_EDGE / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function loadImage(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.decoding = "async";

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to decode image"));
      image.src = objectUrl;
    });

    return {
      image,
      revoke: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function exportCanvas(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function createThumbnailBlob(blob: Blob) {
  const { image, revoke } = await loadImage(blob);

  try {
    const { width, height } = getThumbnailSize(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Failed to create 2D canvas context");
    }

    context.drawImage(image, 0, 0, width, height);

    const webpBlob = await exportCanvas(canvas, "image/webp", THUMBNAIL_QUALITY);
    if (webpBlob?.type === "image/webp") {
      return webpBlob;
    }

    const jpegBlob = await exportCanvas(canvas, "image/jpeg", THUMBNAIL_QUALITY);
    if (jpegBlob?.type === "image/jpeg") {
      return jpegBlob;
    }

    return blob;
  } finally {
    revoke();
  }
}

export async function createThumbnailBlobs(blobs: Blob[]) {
  return Promise.all(blobs.map((blob) => createThumbnailBlob(blob)));
}
