export const MAX_INLINE_IMAGE_SIZE_MB = 5;
export const MAX_INLINE_IMAGE_SIZE_BYTES = MAX_INLINE_IMAGE_SIZE_MB * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function validateImageFile(file?: File) {
  if (!file) {
    return "";
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "画像は PNG / JPEG / WEBP / GIF のみ選択できます。";
  }

  return "";
}
