package id.jhx.tools;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.KeyEvent;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

public class MainActivity extends Activity {
    private WebView wv;
    private SwipeRefreshLayout swipe;
    private ValueCallback<Uri[]> fileCallback;
    private boolean pageFailed = false;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_main);
        wv = findViewById(R.id.wv);
        swipe = findViewById(R.id.swipe);
        swipe.setColorSchemeColors(0xFFF59E0B, 0xFF22D3EE, 0xFF8B5CF6);

        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " JHTools/1.1");

        wv.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest r) {
                String h = r.getUrl().getHost();
                if (h != null && (h.endsWith("jhx.my.id") || h.endsWith("jhax0r.my.id") || h.endsWith("api.jhx.my.id"))) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (Exception e) {}
                return true;
            }
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                pageFailed = false;
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                swipe.setRefreshing(false);
                if (!pageFailed && url.startsWith("file:///android_asset/offline.html")) {
                    wv.loadUrl("https://jhx.my.id/");
                }
            }
            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) {
                    pageFailed = true;
                    wv.loadUrl("file:///android_asset/offline.html");
                }
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

        swipe.setOnRefreshListener(() -> {
            if (isOnline()) {
                if (wv.getUrl() != null && wv.getUrl().startsWith("file:")) {
                    wv.loadUrl("https://jhx.my.id/");
                } else {
                    wv.reload();
                }
            } else {
                wv.loadUrl("file:///android_asset/offline.html");
                swipe.setRefreshing(false);
            }
        });

        wv.loadUrl("https://jhx.my.id/");
    }

    private boolean isOnline() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            NetworkInfo n = cm.getActiveNetworkInfo();
            return n != null && n.isConnected();
        } catch (Exception e) { return false; }
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
    public boolean onKeyDown(int kc, KeyEvent ev) {
        if (kc == KeyEvent.KEYCODE_BACK && wv.canGoBack()) { wv.goBack(); return true; }
        return super.onKeyDown(kc, ev);
    }
}
