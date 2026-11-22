package app.duroodibrahimi.online.testing;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.graphics.Color;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.widget.TextView;
import android.widget.FrameLayout;
import android.view.ViewGroup;
import android.view.View;
import android.view.Gravity;

public final class MainActivity extends Activity {
    // Use the published and verified HTTPS website; Firebase Auth/Firestore still run online.
    private static final String WEB_URL = "https://durood-e-ibrahimi-global-c74e0.web.app/";
    private static final String WEB_HOST = "durood-e-ibrahimi-global-c74e0.web.app";
    private static final int PICK_IMAGE = 42;
    private android.webkit.ValueCallback<Uri[]> pendingImage;
    private WebView web;
    private FrameLayout root;
    private TextView retryView;
    private boolean pageFailed=false;

    private void showRetry() {
        pageFailed=true;
        if(retryView!=null)retryView.setVisibility(View.VISIBLE);
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(9,72,56));
        getWindow().setNavigationBarColor(Color.BLACK);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        // Android 15/16 force edge-to-edge for target SDK 35. Without explicit
        // window insets, the WebView header is drawn under the clock/status
        // icons and the bottom tabs under system navigation gestures.
        // Earlier Android versions already fit the content within both bars.
        if (android.os.Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(
                        android.view.WindowInsets.Type.systemBars()
                        | android.view.WindowInsets.Type.displayCutout());
                root.setPadding(0, Math.max(0, bars.top), 0, Math.max(0, bars.bottom));
                return insets;
            });
        }
        setContentView(root);
        try {
            web = new WebView(this);
            WebSettings settings = web.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            // Honor the HTML mobile viewport and never auto-zoom a wide
            // intermediate document to fit the screen during dashboard load.
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(false);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            settings.setSupportMultipleWindows(false);
            web.setWebChromeClient(new WebChromeClient() {
                @Override public boolean onShowFileChooser(WebView view,
                        android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) {
                    if (pendingImage != null) pendingImage.onReceiveValue(null);
                    pendingImage = callback;
                    Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    pick.addCategory(Intent.CATEGORY_OPENABLE);
                    pick.setType("image/*");
                    try { startActivityForResult(pick, PICK_IMAGE); }
                    catch (ActivityNotFoundException e) { finishImage(null); }
                    return true;
                }
            });
            web.setWebViewClient(new WebViewClient() {
                @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                    pageFailed=false;
                    if(retryView!=null)retryView.setVisibility(View.GONE);
                }
                @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if(request.isForMainFrame())showRetry();
                }
                @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                    if(request.isForMainFrame() && response.getStatusCode()>=400)showRetry();
                }
                @Override public void onPageFinished(WebView view, String url) {
                    if(!pageFailed && retryView!=null)retryView.setVisibility(View.GONE);
                }
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (!request.isForMainFrame()) return false;
                    Uri target = request.getUrl();
                    if (WEB_HOST.equals(target.getHost()) && "https".equals(target.getScheme())) {
                        return false;
                    }
                    String scheme = target.getScheme();
                    if (!"https".equals(scheme) && !"tel".equals(scheme) && !"mailto".equals(scheme)) {
                        return true;
                    }
                    if (request.hasGesture()) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, target));
                        } catch (ActivityNotFoundException ignored) { }
                    }
                    return true;
                }
            });
            root.addView(web,new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
            retryView=new TextView(this);
            retryView.setText("Page could not load. Check your internet.\\nTap here to retry.");
            retryView.setTextSize(17);
            retryView.setTextColor(Color.rgb(9,72,56));
            retryView.setBackgroundColor(Color.WHITE);
            retryView.setGravity(Gravity.CENTER);
            retryView.setPadding(24,40,24,40);
            retryView.setOnClickListener(v -> {
                retryView.setVisibility(View.GONE);
                if(web!=null)web.loadUrl(WEB_URL);
            });
            root.addView(retryView,new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
            retryView.setVisibility(View.GONE);
            web.loadUrl(WEB_URL);
        } catch (Exception error) {
            // A missing / broken Android System WebView should not close the app immediately.
            TextView message = new TextView(this);
            message.setText("Unable to start the web app. Check Android System WebView and your internet connection.");
            message.setTextSize(17);
            message.setPadding(32,50,32,24);
            root.addView(message,new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT));
        }
    }
    private void finishImage(Uri selected) {
        android.webkit.ValueCallback<Uri[]> callback = pendingImage;
        pendingImage = null;
        if (callback != null) callback.onReceiveValue(selected == null ? null : new Uri[]{selected});
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PICK_IMAGE) return;
        Uri selected = result == RESULT_OK && data != null ? data.getData() : null;
        if (selected != null && "content".equals(selected.getScheme())) {
            try {
                String mime = getContentResolver().getType(selected);
                if (mime != null && mime.startsWith("image/")) { finishImage(selected); return; }
            } catch (SecurityException ignored) { }
        }
        finishImage(null);
    }
    @Override public void onBackPressed() {
        if(web!=null && web.canGoBack())web.goBack();
        else super.onBackPressed();
    }
    @Override protected void onPause(){
        if(web!=null)web.onPause();
        super.onPause();
    }
    @Override protected void onResume(){
        super.onResume();
        if(web!=null)web.onResume();
    }
    @Override protected void onDestroy(){
        finishImage(null);
        if(web!=null){
            root.removeView(web);
            web.destroy();
            web=null;
        }
        super.onDestroy();
    }
}
