package com.theoneschoolsystemzw.duroodlive;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.content.Context;
import android.webkit.JavascriptInterface;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
  private static final String HOME="https://durood-e-ibrahimi-global-c74e0.web.app/";
  private static final String HOST="durood-e-ibrahimi-global-c74e0.web.app";
  private static final int FILE_PICK=4201;
  private WebView web;
  private ValueCallback<Uri[]> filePicker;
  private boolean nativeImmersive=false;
  private volatile boolean mainPageTrusted=false;

  @Override public void onCreate(Bundle saved) {
    super.onCreate(saved);
    getWindow().setStatusBarColor(Color.rgb(0,77,59));
    getWindow().setNavigationBarColor(Color.rgb(0,55,43));
    web=new WebView(this);
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    web.addJavascriptInterface(new ReaderHaptics(),"DuroodAndroid");
    setContentView(web);
    WebSettings settings=web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setCacheMode(WebSettings.LOAD_DEFAULT);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(true);
    settings.setSupportMultipleWindows(false);
    settings.setJavaScriptCanOpenWindowsAutomatically(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setMediaPlaybackRequiresUserGesture(true);
    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web,true);
    web.setWebViewClient(new WebViewClient(){
      @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon){
        Uri uri=Uri.parse(url==null?"":url);
        mainPageTrusted="https".equals(uri.getScheme())&&HOST.equals(uri.getHost());
      }
      @Override public void onPageFinished(WebView view,String url){
        Uri uri=Uri.parse(url==null?"":url);
        mainPageTrusted="https".equals(uri.getScheme())&&HOST.equals(uri.getHost());
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
        Uri url=req.getUrl();
        if("https".equals(url.getScheme())&&HOST.equals(url.getHost()))return false;
        try{startActivity(new Intent(Intent.ACTION_VIEW,url));}
        catch(ActivityNotFoundException error){
          Toast.makeText(MainActivity.this,"لنک نہیں کھل سکا",Toast.LENGTH_SHORT).show();
        }
        return true;
      }
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> cb,FileChooserParams params){
        if(filePicker!=null)filePicker.onReceiveValue(null);
        filePicker=cb;
        try{startActivityForResult(params.createIntent(),FILE_PICK);}
        catch(ActivityNotFoundException error){filePicker=null;cb.onReceiveValue(null);return false;}
        return true;
      }
    });
    // Network-first Firebase web content. Do not reload while counting tasbih.
    if(saved==null)web.loadUrl(HOME);
    else if(web.restoreState(saved)==null)web.loadUrl(HOME);
    else {
      Uri restored=Uri.parse(web.getUrl()==null?"":web.getUrl());
      mainPageTrusted="https".equals(restored.getScheme())&&HOST.equals(restored.getHost());
    }
  }
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(request==FILE_PICK&&filePicker!=null){
      filePicker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));
      filePicker=null;
    }
  }
  @Override public boolean onCreateOptionsMenu(Menu menu){
    menu.add(0,1,0,"تازہ اپ ڈیٹ / Refresh");
    menu.add(0,2,1,"اصل ویب سائٹ");
    return true;
  }
  @Override public boolean onOptionsItemSelected(MenuItem item){
    if(item.getItemId()==1){web.reload();return true;}
    if(item.getItemId()==2){startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(HOME)));return true;}
    return super.onOptionsItemSelected(item);
  }
  private boolean trustedPage(){
    // JavaScriptInterface callbacks are on a background thread; never call
    // WebView.getUrl() here (it must be read on the WebView UI thread).
    return mainPageTrusted;
  }
  private void updateImmersive(boolean enabled){
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
  }
  private final class ReaderHaptics{
    // Short, distinct touch pulses use Android's touch-feedback category.
    @JavascriptInterface public String hapticStatus() {
        if(!trustedPage())return "untrusted";
        try {
            Vibrator motor;
            if(Build.VERSION.SDK_INT>=31){
                android.os.VibratorManager manager=(android.os.VibratorManager)getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                motor=manager==null?null:manager.getDefaultVibrator();
            }else motor=(Vibrator)getSystemService(Context.VIBRATOR_SERVICE);
            if(motor==null||!motor.hasVibrator())return "no-motor";
            if(android.provider.Settings.System.getInt(getContentResolver(),android.provider.Settings.System.HAPTIC_FEEDBACK_ENABLED,1)==0)return "system-off";
            return "ready";
        }catch(RuntimeException error){return "unknown";}
    }
    @JavascriptInterface public boolean vibrateTap(int level) {
        if(!trustedPage()||level<=0)return false;
        final int safe=Math.min(10,level);
        try {
            Vibrator motor;
            if(Build.VERSION.SDK_INT>=31){
                android.os.VibratorManager manager=(android.os.VibratorManager)getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                motor=manager==null?null:manager.getDefaultVibrator();
            }else motor=(Vibrator)getSystemService(Context.VIBRATOR_SERVICE);
            if(motor==null||!motor.hasVibrator())return false;
            long duration=100L;
            if(Build.VERSION.SDK_INT>=26){
                int amplitude=motor.hasAmplitudeControl()?Math.min(255,safe*25+5):VibrationEffect.DEFAULT_AMPLITUDE;
                VibrationEffect effect=VibrationEffect.createOneShot(duration,amplitude);
                if(Build.VERSION.SDK_INT>=33){
                    motor.vibrate(effect,new android.os.VibrationAttributes.Builder().setUsage(android.os.VibrationAttributes.USAGE_TOUCH).build());
                }else{
                    motor.vibrate(effect,new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                }
            }else motor.vibrate(duration);
            return true;
        }catch(RuntimeException error){
            android.util.Log.w("DuroodHaptics","Touch pulse failed",error);
            return false;
        }
    }
    @JavascriptInterface public boolean vibrate(int level) {
        if(!trustedPage()||level<=0)return false;
        final int safe=Math.min(10,level);
        try {
            Vibrator motor;
            if(Build.VERSION.SDK_INT>=31){
                android.os.VibratorManager manager=(android.os.VibratorManager)getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                motor=manager==null?null:manager.getDefaultVibrator();
            }else motor=(Vibrator)getSystemService(Context.VIBRATOR_SERVICE);
            if(motor==null||!motor.hasVibrator())return false;
            long duration=100L;
            if(Build.VERSION.SDK_INT>=26){
                int amplitude=motor.hasAmplitudeControl()?Math.max(1,safe*25):VibrationEffect.DEFAULT_AMPLITUDE;
                motor.vibrate(VibrationEffect.createOneShot(duration,amplitude));
            }else motor.vibrate(duration);
            return true;
        }catch(RuntimeException error){
            android.util.Log.w("DuroodHaptics","Native vibration failed",error);
            return false;
        }
    }
    @JavascriptInterface public void setImmersive(boolean enabled){
      if(!trustedPage())return;
      runOnUiThread(()->updateImmersive(enabled));
    }
  }
  @Override public void onBackPressed(){
    if(nativeImmersive){updateImmersive(false);web.evaluateJavascript("window.dispatchEvent(new Event('durood-exit-immersive'))",null);return;}
    if(web!=null&&web.canGoBack())web.goBack();
    else super.onBackPressed();
  }
  @Override protected void onPause(){
    if(web!=null){web.onPause();CookieManager.getInstance().flush();}
    super.onPause();
  }
  @Override protected void onResume(){
    super.onResume();if(web!=null)web.onResume();
  }
  @Override protected void onSaveInstanceState(Bundle state){
    if(web!=null)web.saveState(state);super.onSaveInstanceState(state);
  }
  @Override protected void onDestroy(){
    if(filePicker!=null){filePicker.onReceiveValue(null);filePicker=null;}
    if(web!=null){web.destroy();web=null;}super.onDestroy();
  }
}
