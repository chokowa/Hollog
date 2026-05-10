package com.chokowa.bocchisns;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    private boolean initialShareIntentPending = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BocchiMediaPlugin.class);
        initialShareIntentPending = isShareIntent(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        dispatchShareIntent(intent);
    }

    private void dispatchShareIntent(Intent intent) {
        if (intent == null) {
            return;
        }

        String action = intent.getAction();
        String type = intent.getType();
        if (!isShareIntent(intent)) {
            return;
        }

        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        String title = intent.getStringExtra(Intent.EXTRA_TITLE);
        String htmlText = intent.getStringExtra(Intent.EXTRA_HTML_TEXT);
        String clipText = readTextFromClipData(intent);
        if (isBlank(text)) {
            text = firstNonBlank(htmlText, clipText);
        }
        JSONArray images = readSharedImages(intent, action, type);
        if (isBlank(text) && isBlank(subject) && isBlank(title) && images.length() == 0) {
            consumeShareIntent(intent);
            initialShareIntentPending = false;
            return;
        }

        JSONObject payload = new JSONObject();
        try {
            payload.put("text", text == null ? "" : text);
            payload.put("subject", subject == null ? "" : subject);
            payload.put("title", title == null ? "" : title);
            payload.put("htmlText", htmlText == null ? "" : htmlText);
            payload.put("clipText", clipText == null ? "" : clipText);
            payload.put("images", images);
        } catch (JSONException ignored) {
            return;
        }

        Handler handler = new Handler(Looper.getMainLooper());
        String data = payload.toString();
        handler.postDelayed(() -> triggerShareEvent(data), 150);
        handler.postDelayed(() -> triggerShareEvent(data), 750);
        handler.postDelayed(() -> triggerShareEvent(data), 1600);
        handler.postDelayed(() -> triggerShareEvent(data), 3200);
        consumeShareIntent(intent);
        initialShareIntentPending = false;
    }

    private void consumeShareIntent(Intent intent) {
        Intent mainIntent = new Intent(Intent.ACTION_MAIN);
        mainIntent.setPackage(getPackageName());
        mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        setIntent(mainIntent);
    }

    private boolean isShareIntent(Intent intent) {
        if (intent == null) {
            return false;
        }

        String action = intent.getAction();
        return Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action);
    }

    private JSONArray readSharedImages(Intent intent, String action, String type) {
        JSONArray images = new JSONArray();
        if (type == null || !type.startsWith("image/")) {
            return images;
        }

        if (intent.getClipData() != null) {
            int count = Math.min(intent.getClipData().getItemCount(), 4);
            for (int index = 0; index < count; index++) {
                Uri uri = intent.getClipData().getItemAt(index).getUri();
                addImageData(images, uri, type);
            }
            if (images.length() > 0 || Intent.ACTION_SEND.equals(action)) {
                return images;
            }
        }

        ArrayList<Uri> streamUris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
        if (streamUris != null) {
            for (int index = 0; index < Math.min(streamUris.size(), 4); index++) {
                addImageData(images, streamUris.get(index), type);
            }
            return images;
        }

        Uri streamUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        addImageData(images, streamUri, type);
        return images;
    }

    private void addImageData(JSONArray images, Uri uri, String fallbackType) {
        if (uri == null) return;
        try {
            String mimeType = getContentResolver().getType(uri);
            if (mimeType == null || !mimeType.startsWith("image/")) {
                mimeType = fallbackType != null && fallbackType.startsWith("image/") ? fallbackType : "image/jpeg";
            }
            JSONObject image = new JSONObject();
            String storage = isDeviceMediaUri(uri) ? "device-reference" : "app-local-copy";
            Uri storedUri = uri;
            String name = getDisplayName(uri, images.length() + 1, mimeType);
            if ("app-local-copy".equals(storage)) {
                File imageFile = copyImageToAppStorage(uri, mimeType, images.length() + 1);
                storedUri = Uri.fromFile(imageFile);
                name = imageFile.getName();
            }

            image.put("id", "shared-media-" + System.currentTimeMillis() + "-" + (images.length() + 1));
            image.put("kind", "image");
            image.put("storage", storage);
            image.put("uri", storedUri.toString());
            image.put("name", name);
            image.put("type", mimeType);
            if ("device-reference".equals(storage)) {
                String previewDataUrl = createPreviewDataUrl(uri);
                if (previewDataUrl != null) {
                    image.put("previewDataUrl", previewDataUrl);
                }
            }
            images.put(image);
        } catch (IOException | JSONException ignored) {
        }
    }

    private File copyImageToAppStorage(Uri uri, String mimeType, int imageNumber) throws IOException {
        File shareDir = new File(getFilesDir(), "shared-media");
        if (!shareDir.exists() && !shareDir.mkdirs()) {
            throw new IOException("Unable to create shared media storage");
        }

        String extension = getImageExtension(mimeType);
        File imageFile = new File(shareDir, "shared-image-" + System.currentTimeMillis() + "-" + imageNumber + extension);
        try (InputStream input = getContentResolver().openInputStream(uri);
             FileOutputStream output = new FileOutputStream(imageFile)) {
            if (input == null) throw new IOException("Unable to open shared image");
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        }
        return imageFile;
    }

    private boolean isDeviceMediaUri(Uri uri) {
        String scheme = uri.getScheme();
        if ("file".equals(scheme)) return true;
        if (!"content".equals(scheme)) return false;

        String authority = uri.getAuthority();
        if (authority == null) return false;

        String lowerAuthority = authority.toLowerCase();
        if (lowerAuthority.contains("chrome")
            || lowerAuthority.contains("browser")
            || lowerAuthority.contains("firefox")
            || lowerAuthority.contains("edge")) {
            return false;
        }

        return "media".equals(authority)
            || "com.android.providers.media.documents".equals(authority)
            || "com.android.externalstorage.documents".equals(authority)
            || "com.android.providers.downloads.documents".equals(authority)
            || lowerAuthority.contains("media")
            || lowerAuthority.contains("gallery")
            || lowerAuthority.contains("photos")
            || lowerAuthority.contains("album");
    }

    private String getDisplayName(Uri uri, int imageNumber, String mimeType) {
        String lastSegment = uri.getLastPathSegment();
        if (lastSegment != null && !lastSegment.trim().isEmpty()) {
            return lastSegment;
        }

        return "shared-image-" + imageNumber + getImageExtension(mimeType);
    }

    private String createPreviewDataUrl(Uri uri) {
        try (InputStream input = getContentResolver().openInputStream(uri)) {
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

    private String getImageExtension(String mimeType) {
        if ("image/png".equals(mimeType)) return ".png";
        if ("image/webp".equals(mimeType)) return ".webp";
        if ("image/gif".equals(mimeType)) return ".gif";
        return ".jpg";
    }

    private void triggerShareEvent(String data) {
        if (bridge == null) return;
        bridge.eval(
            "window.dispatchEvent(new CustomEvent('bocchiShareIntent', { detail: " + data + " }));",
            ignored -> {}
        );
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (!isBlank(value)) {
                return value;
            }
        }
        return "";
    }

    private String readTextFromClipData(Intent intent) {
        if (intent.getClipData() == null) return "";

        StringBuilder builder = new StringBuilder();
        int count = Math.min(intent.getClipData().getItemCount(), 8);
        for (int index = 0; index < count; index++) {
            CharSequence text = intent.getClipData().getItemAt(index).coerceToText(this);
            if (text != null && !isBlank(text.toString())) {
                if (builder.length() > 0) builder.append("\n");
                builder.append(text);
            }
        }
        return builder.toString();
    }
}
