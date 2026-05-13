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
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    private boolean initialShareIntentPending = false;
    private final Handler shareHandler = new Handler(Looper.getMainLooper());
    private final ArrayList<Runnable> pendingShareDispatches = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BocchiMediaPlugin.class);
        Intent launchIntent = getIntent();
        initialShareIntentPending = isShareIntent(launchIntent);
        super.onCreate(savedInstanceState);
        if (initialShareIntentPending) {
            dispatchShareIntent(launchIntent);
        }
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
        String sourceUrl = firstNonBlank(
            readStringExtra(intent, "url"),
            readStringExtra(intent, "sourceUrl"),
            readStringExtra(intent, "shareUrl")
        );
        String previewImageUrl = firstNonBlank(
            readStringExtra(intent, "imgUrl"),
            readStringExtra(intent, "imageUrl"),
            readStringExtra(intent, "thumbnailUrl")
        );
        String clipText = readTextFromClipData(intent);
        if (isBlank(text)) {
            text = firstNonBlank(htmlText, clipText);
        }
        String shareKey = buildShareKey(intent, action, type, text, subject, title, htmlText, sourceUrl, previewImageUrl, clipText);
        JSONArray images = readSharedImages(intent, action, type);
        if (isBlank(text) && isBlank(subject) && isBlank(title) && isBlank(sourceUrl) && isBlank(previewImageUrl) && images.length() == 0) {
            consumeShareIntent(intent);
            initialShareIntentPending = false;
            return;
        }

        JSONObject payload = new JSONObject();
        try {
            payload.put("shareKey", shareKey);
            payload.put("text", text == null ? "" : text);
            payload.put("subject", subject == null ? "" : subject);
            payload.put("title", title == null ? "" : title);
            payload.put("htmlText", htmlText == null ? "" : htmlText);
            payload.put("sourceUrl", sourceUrl == null ? "" : sourceUrl);
            payload.put("previewImageUrl", previewImageUrl == null ? "" : previewImageUrl);
            payload.put("clipText", clipText == null ? "" : clipText);
            payload.put("images", images);
        } catch (JSONException ignored) {
            return;
        }

        String data = payload.toString();
        cancelPendingShareDispatches();
        scheduleShareEvent(data, 150);
        scheduleShareEvent(data, 750);
        scheduleShareEvent(data, 1600);
        scheduleShareEvent(data, 3200);
        consumeShareIntent(intent);
        initialShareIntentPending = false;
    }

    private void consumeShareIntent(Intent intent) {
        if (intent != null) {
            intent.setAction(Intent.ACTION_MAIN);
            intent.setType(null);
            intent.setData(null);
            intent.replaceExtras((Bundle) null);
        }
        Intent mainIntent = new Intent(Intent.ACTION_MAIN);
        mainIntent.setPackage(getPackageName());
        mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        setIntent(mainIntent);
    }

    private void scheduleShareEvent(String data, long delayMs) {
        Runnable runnable = new Runnable() {
            @Override
            public void run() {
                pendingShareDispatches.remove(this);
                triggerShareEvent(data);
            }
        };
        pendingShareDispatches.add(runnable);
        shareHandler.postDelayed(runnable, delayMs);
    }

    private void cancelPendingShareDispatches() {
        for (Runnable runnable : pendingShareDispatches) {
            shareHandler.removeCallbacks(runnable);
        }
        pendingShareDispatches.clear();
    }

    @Override
    public void onDestroy() {
        cancelPendingShareDispatches();
        super.onDestroy();
    }

    private boolean isShareIntent(Intent intent) {
        if (intent == null) {
            return false;
        }

        String action = intent.getAction();
        return Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action);
    }

    private String buildShareKey(
        Intent intent,
        String action,
        String type,
        String text,
        String subject,
        String title,
        String htmlText,
        String sourceUrl,
        String previewImageUrl,
        String clipText
    ) {
        StringBuilder builder = new StringBuilder();
        appendKeyPart(builder, action);
        appendKeyPart(builder, type);
        appendKeyPart(builder, text);
        appendKeyPart(builder, subject);
        appendKeyPart(builder, title);
        appendKeyPart(builder, htmlText);
        appendKeyPart(builder, sourceUrl);
        appendKeyPart(builder, previewImageUrl);
        appendKeyPart(builder, clipText);

        if (intent != null && intent.getClipData() != null) {
            int count = Math.min(intent.getClipData().getItemCount(), 8);
            for (int index = 0; index < count; index++) {
                Uri uri = intent.getClipData().getItemAt(index).getUri();
                appendKeyPart(builder, uri == null ? "" : uri.toString());
            }
        }

        if (intent != null) {
            ArrayList<Uri> streamUris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streamUris != null) {
                for (int index = 0; index < Math.min(streamUris.size(), 8); index++) {
                    Uri uri = streamUris.get(index);
                    appendKeyPart(builder, uri == null ? "" : uri.toString());
                }
            } else {
                Uri streamUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                appendKeyPart(builder, streamUri == null ? "" : streamUri.toString());
            }
        }

        return sha256(builder.toString());
    }

    private void appendKeyPart(StringBuilder builder, String value) {
        builder.append(value == null ? "" : value);
        builder.append('\u001f');
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte item : hash) {
                String part = Integer.toHexString(0xff & item);
                if (part.length() == 1) {
                    hex.append('0');
                }
                hex.append(part);
            }
            return hex.toString();
        } catch (Exception ignored) {
            return String.valueOf(value.hashCode());
        }
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
            if (images.length() > 0) {
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
                if (fallbackType == null || !fallbackType.startsWith("image/")) {
                    return;
                }
                mimeType = fallbackType;
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

    private String readStringExtra(Intent intent, String key) {
        try {
            String value = intent.getStringExtra(key);
            return value == null ? "" : value;
        } catch (Exception ignored) {
            return "";
        }
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
