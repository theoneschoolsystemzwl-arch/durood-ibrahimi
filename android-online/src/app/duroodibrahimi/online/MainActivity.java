package app.duroodibrahimi.online.testing;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.webkit.JavascriptInterface;
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
    private boolean nativeImmersive=false;
    private volatile boolean mainPageTrusted=false;

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
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsetsIgnoringVisibility(
                        android.view.WindowInsets.Type.systemBars()
                        | android.view.WindowInsets.Type.displayCutout());
                int keyboard = insets.getInsets(android.view.WindowInsets.Type.ime()).bottom;
                if(nativeImmersive)root.setPadding(0,0,0,keyboard);
                else root.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,keyboard));
                return android.view.WindowInsets.CONSUMED;
            });
        }
        setContentView(root);
        root.post(root::requestApplyInsets);
        try {
            web = new WebView(this);
            web.addJavascriptInterface(new ReaderControls(),"DuroodAndroid");
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
                    Uri uri=Uri.parse(url==null?"":url);
                    mainPageTrusted="https".equals(uri.getScheme())&&WEB_HOST.equals(uri.getHost());
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
    private boolean trustedPage() {
        // JavaScriptInterface runs off the UI thread; do not call WebView.getUrl().
        return mainPageTrusted;
    }
    private void updateImmersive(boolean enabled) {
        nativeImmersive=enabled;
        final int flags=enabled?
            View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_LAYOUT_STABLE:0;
        if(Build.VERSION.SDK_INT>=30){
            android.view.WindowInsetsController controller=getWindow().getInsetsController();
            if(controller!=null){
                if(enabled){
                    controller.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    controller.hide(android.view.WindowInsets.Type.statusBars()|android.view.WindowInsets.Type.navigationBars());
                }else{
                    controller.show(android.view.WindowInsets.Type.statusBars()|android.view.WindowInsets.Type.navigationBars());
                }
            }
        }else{
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
        if(root!=null)root.requestApplyInsets();
    }
    private final class ReaderControls {
        // Independent motor engine: a non-repeating high-amplitude envelope on every tap.
        // Android 16 frequency control; reflection retains compatibility with SDK 35 builds.
    private android.os.VibrationEffect frequencyPulse(android.os.Vibrator motor,int level){
      if(Build.VERSION.SDK_INT<36)return null;
      final float requestedFrequency=1000f;
      try{
        Class<?> vibrator=android.os.Vibrator.class;
        if(!Boolean.TRUE.equals(vibrator.getMethod("areEnvelopeEffectsSupported").invoke(motor)))return null;
        Object profile=vibrator.getMethod("getFrequencyProfile").invoke(motor);
        Object info=vibrator.getMethod("getEnvelopeEffectInfo").invoke(motor);
        if(profile==null||info==null)return null;
        float min=((Number)profile.getClass().getMethod("getMinFrequencyHz").invoke(profile)).floatValue();
        float max=((Number)profile.getClass().getMethod("getMaxFrequencyHz").invoke(profile)).floatValue();
        if(!Float.isFinite(min)||!Float.isFinite(max)||min<=0||max<min)return null;
        // Prefer the fastest frequency that still produces a strong physical response.
        float peakGs=((Number)profile.getClass().getMethod("getMaxOutputAccelerationGs").invoke(profile)).floatValue();
        Object strongRange=profile.getClass().getMethod("getFrequencyRange",float.class).invoke(profile,peakGs*0.75f);
        float low=min,high=max;
        if(strongRange instanceof android.util.Range){
          android.util.Range<?> range=(android.util.Range<?>)strongRange;
          low=Math.max(min,((Number)range.getLower()).floatValue());
          high=Math.min(max,((Number)range.getUpper()).floatValue());
        }
        if(high<low)return null;
        final float frequency=Math.max(low,Math.min(high,requestedFrequency));
        long minTime=((Number)info.getClass().getMethod("getMinControlPointDurationMillis").invoke(info)).longValue();
        long maxTime=((Number)info.getClass().getMethod("getMaxControlPointDurationMillis").invoke(info)).longValue();
        long maxTotal=((Number)info.getClass().getMethod("getMaxDurationMillis").invoke(info)).longValue();
        long edge=Math.max(8L,minTime),hold=Math.max(150L,minTime);
        if(minTime<=0||edge>maxTime||hold>maxTime||2*edge+hold>maxTotal)return null;
        Class<?> builderType=Class.forName("android.os.VibrationEffect$WaveformEnvelopeBuilder");
        Object builder=builderType.getConstructor().newInstance();
        builderType.getMethod("setInitialFrequencyHz",float.class).invoke(builder,frequency);
        java.lang.reflect.Method point=builderType.getMethod("addControlPoint",float.class,float.class,long.class);
        float strength=level/10f;
        point.invoke(builder,strength,frequency,edge);
        point.invoke(builder,strength,frequency,hold);
        point.invoke(builder,0f,frequency,edge);
        android.os.VibrationEffect built=(android.os.VibrationEffect)builderType.getMethod("build").invoke(builder);
        motorReport="requested-hz:"+Math.round(frequency);
        return built;
      }catch(Exception | LinkageError unavailable){return null;}
    }
    private volatile String motorReport="ready";
    private android.os.Vibrator getTapMotor(){
      if(Build.VERSION.SDK_INT>=31){
        android.os.VibratorManager manager=getSystemService(android.os.VibratorManager.class);
        return manager==null?null:manager.getDefaultVibrator();
      }
      return getSystemService(android.os.Vibrator.class);
    }
    private String motorAvailability(){
      if(!trustedPage())return "untrusted";
      if(checkSelfPermission(android.Manifest.permission.VIBRATE)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return "permission";
      android.os.Vibrator motor=getTapMotor();
      if(motor==null||!motor.hasVibrator())return "no-motor";
      if(android.provider.Settings.System.getInt(getContentResolver(),android.provider.Settings.System.HAPTIC_FEEDBACK_ENABLED,1)==0)return "system-off";
      return "ready";
    }
    @JavascriptInterface public String tapMotorDiagnostic(){
      try{
        String availability=motorAvailability();
        return "v6|"+(availability.equals("ready")?motorReport:availability);
      }catch(RuntimeException ex){return "v6|error";}
    }
    private void sendTapEffect(android.os.Vibrator motor,android.os.VibrationEffect effect){
      if(Build.VERSION.SDK_INT>=33){
        motor.vibrate(effect,new android.os.VibrationAttributes.Builder().setUsage(android.os.VibrationAttributes.USAGE_TOUCH).build());
      }else{
        motor.vibrate(effect,new android.media.AudioAttributes.Builder()
          .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
          .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
      }
    }
    @JavascriptInterface public boolean pulseTasbihMotor(int strength) {
      if(strength<=0)return false;
      final int level=Math.min(10,strength);
      try {
        motorReport=motorAvailability();
        if(!"ready".equals(motorReport))return false;
        android.os.Vibrator motor=getTapMotor();
        if(motor==null)return false;
        final long length=60L+level*12L;
        if(Build.VERSION.SDK_INT>=26){
          android.os.VibrationEffect effect=frequencyPulse(motor,level);
          if(effect!=null){
            try{sendTapEffect(motor,effect);return true;}
            catch(RuntimeException unsupported){android.util.Log.w("TasbihMotor","Frequency effect rejected; using full amplitude",unsupported);}
          }
          int amplitude=motor.hasAmplitudeControl()?Math.max(1,level*255/10):android.os.VibrationEffect.DEFAULT_AMPLITUDE;
          // A single uninterrupted full-amplitude pulse is easier to feel than a short envelope.
          final long[] timings={0,length};
          final int[] amplitudes={0,amplitude};
          sendTapEffect(motor,android.os.VibrationEffect.createWaveform(timings,amplitudes,-1));
          motorReport="requested-pulse:"+length+"ms";
        }else{
          motor.vibrate(length);
          motorReport="requested-pulse:"+length+"ms";
        }
        return true;
      }catch(RuntimeException error){
        motorReport="error:"+error.getClass().getSimpleName();
        android.util.Log.w("TasbihMotor","Motor request failed",error);
        return false;
      }
    }
    @JavascriptInterface public void setImmersive(boolean enabled) {
            if(!trustedPage())return;
            runOnUiThread(()->updateImmersive(enabled));
        }
    }
    @Override public void onBackPressed() {
        if(nativeImmersive){
            updateImmersive(false);
            web.evaluateJavascript("window.dispatchEvent(new Event('durood-exit-immersive'))",null);
            return;
        }
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
