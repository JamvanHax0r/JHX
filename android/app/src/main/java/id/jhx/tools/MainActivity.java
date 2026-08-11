package id.jhx.tools;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private WebView wv;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        wv = new WebView(this);
        setContentView(wv);
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString() + " JHTools/1.0");

        wv.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest r) {
                String h = r.getUrl().getHost();
                if (h != null && (h.endsWith("jhx.my.id") || h.endsWith("jhax0r.my.id"))) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (Exception e) {}
                return true;
            }
        });

        wv.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try { startActivityForResult(p.createIntent(), 1); } catch (Exception e) { fileCallback = null; return false; }
                return true;
            }
        });

        wv.setDownloadListener((url, ua, cd, mime, len) -> {
            try {
                DownloadManager.Request rq = new DownloadManager.Request(Uri.parse(url));
                rq.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                rq.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, cd, mime));
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(rq);
                Toast.makeText(this, "Download dimulai", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e2) {}
            }
        });

        wv.loadUrl("https://jhx.my.id/");
    }

    @Override
    protected void onActivityResult(int rc, int res, Intent d) {
        super.onActivityResult(rc, res, d);
        if (rc == 1 && fileCallback != null) {
            fileCallback.onReceiveValue(d == null ? null : WebChromeClient.FileChooserParams.parseResult(res, d));
            fileCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (wv.canGoBack()) wv.goBack(); else super.onBackPressed();
    }
}
