package com.chokowa.bocchisns;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.OpenableColumns;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "BocchiMedia")
public class BocchiMediaPlugin extends Plugin {
    @PluginMethod
    public void pickImages(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "pickImagesResult");
    }

    @ActivityCallback
    private void pickImagesResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject empty = new JSObject();
            empty.put("items", new JSArray());
            call.resolve(empty);
            return;
        }

        Intent data = result.getData();
        JSArray items = new JSArray();
        int limit = Math.max(1, Math.min(call.getInt("limit", 4), 4));

        if (data.getClipData() != null) {
            int count = Math.min(data.getClipData().getItemCount(), limit);
            for (int index = 0; index < count; index++) {
                Uri uri = data.getClipData().getItemAt(index).getUri();
                addPickedImage(items, uri, index);
            }
        } else if (data.getData() != null) {
            addPickedImage(items, data.getData(), 0);
        }

        JSObject response = new JSObject();
        response.put("items", items);
        call.resolve(response);
    }

    @PluginMethod
    public void saveImages(PluginCall call) {
        JSArray inputItems = call.getArray("items", new JSArray());
        int savedCount = 0;

        for (int index = 0; index < inputItems.length(); index++) {
            try {
                JSONObject item = inputItems.getJSONObject(index);
                if (saveImageItem(item, index + 1)) {
                    savedCount++;
                }
            } catch (Exception ignored) {
            }
        }

        JSObject response = new JSObject();
        response.put("savedCount", savedCount);
        call.resolve(response);
    }

    @PluginMethod
    public void readClipboardImages(PluginCall call) {
        int limit = Math.max(1, Math.min(call.getInt("limit", 4), 4));
        JSArray items = new JSArray();

        try {
            ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clipData = clipboard == null ? null : clipboard.getPrimaryClip();
            if (clipData != null) {
                int count = Math.min(clipData.getItemCount(), limit);
                for (int index = 0; index < count; index++) {
                    ClipData.Item clipItem = clipData.getItemAt(index);
                    Uri uri = clipItem.getUri();
                    if (uri == null && clipItem.getIntent() != null) {
                        uri = clipItem.getIntent().getData();
                    }
                    addClipboardImage(items, uri, index);
                }
            }
        } catch (Exception ignored) {
        }

        JSObject response = new JSObject();
        response.put("items", items);
        call.resolve(response);
    }

    @PluginMethod
    public void readClipboardText(PluginCall call) {
        JSObject response = new JSObject();
        response.put("text", readClipboardTextValue());
        call.resolve(response);
    }

    private void addPickedImage(JSArray items, Uri uri, int index) {
        if (uri == null) return;
        try {
            try {
                getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception ignored) {
            }

            String mimeType = getContext().getContentResolver().getType(uri);
            if (mimeType == null || !mimeType.startsWith("image/")) {
                mimeType = "image/jpeg";
            }

            JSObject item = new JSObject();
            item.put("id", "picked-media-" + System.currentTimeMillis() + "-" + (index + 1));
            item.put("kind", "image");
            item.put("storage", "device-reference");
            item.put("uri", uri.toString());
            item.put("name", getDisplayName(uri, index + 1, mimeType));
            item.put("mimeType", mimeType);
            String previewDataUrl = createPreviewDataUrl(uri);
            if (previewDataUrl != null) {
                item.put("previewDataUrl", previewDataUrl);
            }
            items.put(item);
        } catch (Exception ignored) {
        }
    }

    private void addClipboardImage(JSArray items, Uri uri, int index) {
        if (uri == null) return;
        try {
            String mimeType = getContext().getContentResolver().getType(uri);
            if (mimeType == null || !mimeType.startsWith("image/")) {
                return;
            }

            File imageFile = copyImageToAppStorage(uri, mimeType, index + 1);
            JSObject item = new JSObject();
            item.put("id", "clipboard-media-" + System.currentTimeMillis() + "-" + (index + 1));
            item.put("kind", "image");
            item.put("storage", "app-local-copy");
            item.put("uri", Uri.fromFile(imageFile).toString());
            item.put("name", imageFile.getName());
            item.put("mimeType", mimeType);
            String previewDataUrl = createPreviewDataUrl(Uri.fromFile(imageFile));
            if (previewDataUrl != null) {
                item.put("previewDataUrl", previewDataUrl);
            }
            items.put(item);
        } catch (Exception ignored) {
        }
    }

    private String readClipboardTextValue() {
        try {
            ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clipData = clipboard == null ? null : clipboard.getPrimaryClip();
            if (clipData == null) return "";

            StringBuilder builder = new StringBuilder();
            int count = Math.min(clipData.getItemCount(), 8);
            for (int index = 0; index < count; index++) {
                CharSequence text = clipData.getItemAt(index).coerceToText(getContext());
                if (text != null) {
                    String value = text.toString().trim();
                    if (!value.isEmpty()) {
                        if (builder.length() > 0) builder.append("\n");
                        builder.append(value);
                    }
                }
            }
            return builder.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    private File copyImageToAppStorage(Uri uri, String mimeType, int imageNumber) throws Exception {
        File shareDir = new File(getContext().getFilesDir(), "clipboard-media");
        if (!shareDir.exists() && !shareDir.mkdirs()) {
            throw new Exception("Unable to create clipboard media storage");
        }

        File imageFile = new File(shareDir, "clipboard-image-" + System.currentTimeMillis() + "-" + imageNumber + getImageExtension(mimeType));
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             OutputStream output = new java.io.FileOutputStream(imageFile)) {
            if (input == null) throw new Exception("Unable to open clipboard image");
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        }

        return imageFile;
    }

    private String getDisplayName(Uri uri, int imageNumber, String mimeType) {
        try (android.database.Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIndex >= 0) {
                    String name = cursor.getString(nameIndex);
                    if (name != null && !name.trim().isEmpty()) {
                        return name;
                    }
                }
            }
        } catch (Exception ignored) {
        }

        return "picked-image-" + imageNumber + getImageExtension(mimeType);
    }

    private String createPreviewDataUrl(Uri uri) {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) return null;
            Bitmap decoded = BitmapFactory.decodeStream(input);
            if (decoded == null) return null;

            int maxSize = 640;
            int width = decoded.getWidth();
            int height = decoded.getHeight();
            Bitmap thumbnail = decoded;
            if (width > maxSize || height > maxSize) {
                float scale = Math.min((float) maxSize / width, (float) maxSize / height);
                int nextWidth = Math.max(1, Math.round(width * scale));
                int nextHeight = Math.max(1, Math.round(height * scale));
                thumbnail = Bitmap.createScaledBitmap(decoded, nextWidth, nextHeight, true);
            }

            ByteArrayOutputStream output = new ByteArrayOutputStream();
            thumbnail.compress(Bitmap.CompressFormat.JPEG, 82, output);
            if (thumbnail != decoded) {
                thumbnail.recycle();
            }
            decoded.recycle();
            return "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean saveImageItem(JSONObject item, int imageNumber) {
        String mimeType = item.optString("mimeType", "image/jpeg");
        if (mimeType == null || !mimeType.startsWith("image/")) {
            mimeType = "image/jpeg";
        }

        String name = item.optString("name", "bocchi-image-" + imageNumber + getImageExtension(mimeType));
        Uri outputUri = createGalleryImageUri(name, mimeType);
        if (outputUri == null) return false;

        try (OutputStream output = getContext().getContentResolver().openOutputStream(outputUri)) {
            if (output == null) return false;

            String dataUrl = item.optString("dataUrl", "");
            String uriValue = item.optString("uri", "");
            if (dataUrl != null && dataUrl.startsWith("data:")) {
                int commaIndex = dataUrl.indexOf(',');
                if (commaIndex < 0) return false;
                byte[] bytes = Base64.decode(dataUrl.substring(commaIndex + 1), Base64.DEFAULT);
                output.write(bytes);
            } else if (uriValue != null && !uriValue.isEmpty()) {
                copyUriToOutput(Uri.parse(uriValue), output);
            } else {
                return false;
            }

            markGalleryImageReady(outputUri);
            return true;
        } catch (Exception ignored) {
            getContext().getContentResolver().delete(outputUri, null, null);
            return false;
        }
    }

    private void copyUriToOutput(Uri sourceUri, OutputStream output) throws Exception {
        InputStream input = null;
        try {
            if ("file".equals(sourceUri.getScheme())) {
                input = new FileInputStream(new File(sourceUri.getPath()));
            } else {
                input = getContext().getContentResolver().openInputStream(sourceUri);
            }

            if (input == null) throw new Exception("Unable to open image");
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        } finally {
            if (input != null) input.close();
        }
    }

    private Uri createGalleryImageUri(String name, String mimeType) {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, sanitizeFileName(name, mimeType));
        values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/BocchiSNS");
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
        }

        return resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
    }

    private void markGalleryImageReady(Uri uri) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;

        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        getContext().getContentResolver().update(uri, values, null, null);
    }

    private String sanitizeFileName(String name, String mimeType) {
        String safeName = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (safeName.isEmpty()) {
            safeName = "bocchi-image-" + System.currentTimeMillis();
        }
        String lower = safeName.toLowerCase();
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp") || lower.endsWith(".gif")) {
            return safeName;
        }
        return safeName + getImageExtension(mimeType);
    }

    private String getImageExtension(String mimeType) {
        if ("image/png".equals(mimeType)) return ".png";
        if ("image/webp".equals(mimeType)) return ".webp";
        if ("image/gif".equals(mimeType)) return ".gif";
        return ".jpg";
    }
}
