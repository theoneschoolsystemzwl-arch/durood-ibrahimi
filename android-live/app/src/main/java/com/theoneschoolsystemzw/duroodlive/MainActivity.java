package com.theoneschoolsystemzw.duroodlive;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
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
    web.addJavascriptInterface(new ReaderControls(),"DuroodAndroid");
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
    if(request==SAVE_WAZIFA_PDF){finishWazifaPdfSave(result,data);return;}
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
  private static final int SAVE_WAZIFA_PDF=4202;
  private byte[] pendingWazifaPdf;
  private void openWazifaPdfSave(byte[] pdf){
    if(!trustedPage()||pendingWazifaPdf!=null)return;
    pendingWazifaPdf=pdf;
    Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);
    save.addCategory(Intent.CATEGORY_OPENABLE);save.setType("application/pdf");save.putExtra(Intent.EXTRA_TITLE,"wazifa-arabic.pdf");
    try{startActivityForResult(save,SAVE_WAZIFA_PDF);}
    catch(ActivityNotFoundException e){pendingWazifaPdf=null;android.widget.Toast.makeText(this,"PDF save unavailable",android.widget.Toast.LENGTH_SHORT).show();}
  }
  private void finishWazifaPdfSave(int result,Intent data){
    final byte[] pdf=pendingWazifaPdf;pendingWazifaPdf=null;
    if(result!=RESULT_OK||data==null||data.getData()==null||pdf==null)return;
    final Uri uri=data.getData();if(!"content".equals(uri.getScheme()))return;
    new Thread(()->{
      boolean ok=false;
      try(java.io.OutputStream out=getContentResolver().openOutputStream(uri,"w")){if(out!=null){out.write(pdf);out.flush();ok=true;}}
      catch(Exception ignored){}
      final boolean saved=ok;
      runOnUiThread(()->android.widget.Toast.makeText(this,saved?"PDF محفوظ ہو گئی":"PDF محفوظ نہیں ہو سکی",android.widget.Toast.LENGTH_LONG).show());
    }).start();
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
  private final class ReaderControls{
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
    @JavascriptInterface public boolean saveWazifaPdf(String encoded){
      if(!trustedPage()||encoded==null||encoded.length()>45000000)return false;
      try{
        byte[] pdf=android.util.Base64.decode(encoded,android.util.Base64.NO_WRAP);
        if(pdf.length<5||pdf.length>32*1024*1024||pdf[0]!='%'||pdf[1]!='P'||pdf[2]!='D'||pdf[3]!='F'||pdf[4]!='-')return false;
        runOnUiThread(()->openWazifaPdfSave(pdf));return true;
      }catch(IllegalArgumentException e){return false;}
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
