package app.duroodibrahimi.online.testing;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.graphics.Color;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.widget.TextView;
import android.widget.FrameLayout;
import android.view.ViewGroup;

public final class MainActivity extends Activity {
    // Use the published and verified HTTPS website; Firebase Auth/Firestore still run online.
    private static final String WEB_URL = "https://durood-ibrahimi.pages.dev/";
    private static final String WEB_HOST = "durood-ibrahimi.pages.dev";
    private WebView web;
    private FrameLayout root;

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
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            settings.setSupportMultipleWindows(false);
            web.setWebChromeClient(new WebChromeClient());
            web.setWebViewClient(new WebViewClient() {
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
        if(web!=null){
            root.removeView(web);
            web.destroy();
            web=null;
        }
        super.onDestroy();
    }
}
