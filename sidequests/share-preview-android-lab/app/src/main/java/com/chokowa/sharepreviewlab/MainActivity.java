package com.chokowa.sharepreviewlab;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.method.ScrollingMovementMethod;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final Pattern URL_PATTERN = Pattern.compile("https?://[^\\s<>\"']+");
    private static final String LAB_API_URL = "http://127.0.0.1:4177/api/run";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private TextView statusView;
    private TextView intentView;
    private TextView resultView;
    private JSONObject currentPayload = new JSONObject();
    private String currentUrl = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void buildUi() {
        ScrollView scrollView = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(16);
        root.setPadding(padding, padding, padding, padding);
        scrollView.addView(root);

        TextView title = new TextView(this);
        title.setText("Share Preview Android Lab");
        title.setTextSize(24);
        title.setTextColor(0xff211b14);
        root.addView(title);

        statusView = sectionText("共有待ちです。Chromeなどからこのアプリへ共有してください。");
        root.addView(statusView);

        Button runButton = new Button(this);
        runButton.setText("PCラボAPIで比較する");
        runButton.setOnClickListener(view -> runPcComparison());
        root.addView(runButton);

        Button copyButton = new Button(this);
        copyButton.setText("raw JSONを共有");
        copyButton.setOnClickListener(view -> shareRawJson());
        root.addView(copyButton);

        TextView intentTitle = label("Intent raw");
        root.addView(intentTitle);
        intentView = sectionText("");
        intentView.setMovementMethod(new ScrollingMovementMethod());
        root.addView(intentView);

        TextView resultTitle = label("PC lab result");
        root.addView(resultTitle);
        resultView = sectionText("");
        resultView.setMovementMethod(new ScrollingMovementMethod());
        root.addView(resultView);

        setContentView(scrollView);
    }

    private TextView label(String value) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(16);
        view.setTextColor(0xff1f6f5b);
        view.setPadding(0, dp(18), 0, dp(6));
        return view;
    }

    private TextView sectionText(String value) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(14);
        view.setTextColor(0xff211b14);
        view.setPadding(dp(12), dp(12), dp(12), dp(12));
        view.setBackgroundColor(0xfffffaf1);
        return view;
    }

    private void handleIntent(Intent intent) {
        try {
            currentPayload = describeIntent(intent);
            currentUrl = extractUrl(currentPayload);
            writeFile("last-intent.json", currentPayload.toString(2));
            statusView.setText(currentUrl.isEmpty()
                ? "共有を受信しました。URLは見つかりませんでした。"
                : "共有を受信しました。抽出URL: " + currentUrl);
            intentView.setText(currentPayload.toString(2));
            resultView.setText("");
        } catch (Exception error) {
            statusView.setText("Intent解析でエラー: " + error.getMessage());
        }
    }

    private JSONObject describeIntent(Intent intent) throws Exception {
        JSONObject root = new JSONObject();
        if (intent == null) {
            root.put("empty", true);
            return root;
        }

        root.put("receivedAt", System.currentTimeMillis());
        root.put("action", intent.getAction());
        root.put("type", intent.getType());
        root.put("data", intent.getDataString());

        JSONArray categories = new JSONArray();
        if (intent.getCategories() != null) {
            for (String category : intent.getCategories()) categories.put(category);
        }
        root.put("categories", categories);

        JSONObject extras = new JSONObject();
        Bundle bundle = intent.getExtras();
        if (bundle != null) {
            for (String key : bundle.keySet()) {
                Object value = bundle.get(key);
                extras.put(key, stringifyValue(value));
            }
        }
        root.put("extras", extras);

        JSONArray clipItems = new JSONArray();
        ClipData clipData = intent.getClipData();
        if (clipData != null) {
            for (int index = 0; index < clipData.getItemCount(); index++) {
                ClipData.Item item = clipData.getItemAt(index);
                JSONObject clip = new JSONObject();
                clip.put("text", stringifyValue(item.getText()));
                clip.put("htmlText", stringifyValue(item.getHtmlText()));
                clip.put("uri", stringifyValue(item.getUri()));
                clip.put("intent", stringifyValue(item.getIntent()));
                clipItems.put(clip);
            }
        }
        root.put("clipData", clipItems);

        return root;
    }

    private String stringifyValue(Object value) {
        if (value == null) return "";
        if (value instanceof Uri) return value.toString();
        if (value instanceof ArrayList<?>) return value.toString();
        return String.valueOf(value);
    }

    private String extractUrl(JSONObject payload) {
        ArrayList<String> values = new ArrayList<>();
        collectJsonStrings(payload, values);
        for (String value : values) {
            Matcher matcher = URL_PATTERN.matcher(value);
            if (matcher.find()) {
                return matcher.group().replaceAll("[)、。,\\].!?]+$", "");
            }
        }
        return "";
    }

    private void collectJsonStrings(Object value, ArrayList<String> out) {
        if (value == null) return;
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            Iterator<String> keys = object.keys();
            while (keys.hasNext()) {
                collectJsonStrings(object.opt(keys.next()), out);
            }
            return;
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            for (int index = 0; index < array.length(); index++) {
                collectJsonStrings(array.opt(index), out);
            }
            return;
        }
        String stringValue = String.valueOf(value);
        if (!stringValue.trim().isEmpty()) out.add(stringValue);
    }

    private void runPcComparison() {
        if (currentUrl.isEmpty()) {
            resultView.setText("URLがないため比較できません。");
            return;
        }

        resultView.setText("PCラボAPIへ問い合わせ中...");
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("url", currentUrl);
                body.put("mode", "sequential");
                body.put("timeoutMs", 10000);
                body.put("runnerIds", new JSONArray()
                    .put("intent-only")
                    .put("current-style-baseline")
                    .put("link-preview-js")
                    .put("openlink"));

                JSONObject intent = new JSONObject();
                JSONObject extras = currentPayload.optJSONObject("extras");
                if (extras != null) {
                    intent.put("title", extras.optString("android.intent.extra.TITLE"));
                    intent.put("text", extras.optString("android.intent.extra.TEXT"));
                }
                body.put("intent", intent);

                String response = postJson(LAB_API_URL, body.toString());
                writeFile("last-result.json", response);
                mainHandler.post(() -> resultView.setText(response));
            } catch (Exception error) {
                writeFile("last-result.json", "ERROR: " + error.getClass().getSimpleName() + ": " + error.getMessage());
                mainHandler.post(() -> resultView.setText(
                    "PCラボAPIに接続できませんでした。\n\n" +
                    "PC側で npm start を起動し、adb reverse tcp:4177 tcp:4177 を実行してください。\n\n" +
                    error.getClass().getSimpleName() + ": " + error.getMessage()
                ));
            }
        }).start();
    }

    private String postJson(String urlValue, String jsonBody) throws Exception {
        URL url = new URL(urlValue);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(30000);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setDoOutput(true);

        try (OutputStream output = connection.getOutputStream()) {
            output.write(jsonBody.getBytes(StandardCharsets.UTF_8));
        }

        int status = connection.getResponseCode();
        BufferedReader reader = new BufferedReader(new InputStreamReader(
            status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream(),
            StandardCharsets.UTF_8
        ));
        StringBuilder builder = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            builder.append(line).append('\n');
        }
        reader.close();
        return builder.toString();
    }

    private void shareRawJson() {
        Intent sendIntent = new Intent(Intent.ACTION_SEND);
        sendIntent.setType("text/plain");
        sendIntent.putExtra(Intent.EXTRA_TEXT, currentPayload.toString());
        startActivity(Intent.createChooser(sendIntent, "Share raw intent JSON"));
    }

    private void writeFile(String name, String value) {
        try {
            File file = new File(getFilesDir(), name);
            try (FileOutputStream output = new FileOutputStream(file, false)) {
                output.write(value.getBytes(StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
