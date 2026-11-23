package com.theoneschoolsystemzw.duroodlive;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
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

  @Override public void onCreate(Bundle saved) {
    super.onCreate(saved);
    getWindow().setStatusBarColor(Color.rgb(0,77,59));
    getWindow().setNavigationBarColor(Color.rgb(0,55,43));
    web=new WebView(this);
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
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
    else web.restoreState(saved);
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
  @Override public void onBackPressed(){
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
