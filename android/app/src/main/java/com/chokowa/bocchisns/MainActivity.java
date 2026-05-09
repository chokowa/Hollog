package com.chokowa.bocchisns;

import android.content.Intent;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.BridgeActivity;

import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        dispatchShareIntent(intent);
    }

    private void dispatchShareIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction()) || !"text/plain".equals(intent.getType())) {
            return;
        }

        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        String title = intent.getStringExtra(Intent.EXTRA_TITLE);
        if (isBlank(text) && isBlank(subject) && isBlank(title)) {
            return;
        }

        JSONObject payload = new JSONObject();
        try {
            payload.put("text", text == null ? "" : text);
            payload.put("subject", subject == null ? "" : subject);
            payload.put("title", title == null ? "" : title);
        } catch (JSONException ignored) {
            return;
        }

        Handler handler = new Handler(Looper.getMainLooper());
        String data = payload.toString();
        handler.postDelayed(() -> triggerShareEvent(data), 150);
        handler.postDelayed(() -> triggerShareEvent(data), 750);
        handler.postDelayed(() -> triggerShareEvent(data), 1600);
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
}
