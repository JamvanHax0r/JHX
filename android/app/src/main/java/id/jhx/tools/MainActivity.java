package id.jhx.tools;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
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
    private static final String TAG = "JHX";
    private static final String LIVE_URL = "https://jhx.my.id/";

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_main);

        // AUTO-CLEAR CACHE on first install (fix WebView ke-cache JS lama)
        if (b == null) {
            try {
                new WebView(this).clearCache(true);
                Log.d(TAG, "Cache cleared on first install");
            } catch (Exception e) {
                Log.e(TAG, "Cache clear failed", e);
            }
        }

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
        s.setUserAgentString(s.getUserAgentString() + " JHTools/2.0");

        wv.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest r) {
                String h = r.getUrl().getHost();
                if (h != null && (h.endsWith("jhx.my.id") || h.endsWith("jhax0r.my.id") || h.endsWith("api.jhx.my.id"))) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl()));
                } catch (Exception e) {
                    Log.e(TAG, "External link failed", e);
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                pageFailed = false;
                Log.d(TAG, "page-start: " + url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                swipe.setRefreshing(false);
                Log.d(TAG, "page-done: " + url);
                if (!pageFailed && url.startsWith("file:///android_asset/offline.html")) {
                    wv.loadUrl(LIVE_URL);
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
                try {
                    boolean isImg = false;
                    for (String t : p.getAcceptTypes()) { if (t != null && t.contains("image")) { isImg = true; break; } }
                    android.content.Intent pick;
                    if (isImg && android.os.Build.VERSION.SDK_INT >= 33) {
                        pick = new android.content.Intent(android.provider.MediaStore.ACTION_PICK_IMAGES);
                        pick.putExtra(android.provider.MediaStore.EXTRA_PICK_IMAGES_MAX, 3);
                    } else {
                        pick = new android.content.Intent(Intent.ACTION_GET_CONTENT);
                        pick.addCategory(Intent.CATEGORY_OPENABLE);
                        pick.setType(isImg ? "image/*" : "*/*");
                        pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    }
                    pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        startActivityForResult(pick, 1);
                    } catch (Exception e) {
                        android.content.Intent fb = new android.content.Intent(Intent.ACTION_GET_CONTENT);
                        fb.addCategory(Intent.CATEGORY_OPENABLE);
                        fb.setType(isImg ? "image/*" : "*/*");
                        fb.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                        startActivityForResult(android.content.Intent.createChooser(fb, "Pilih file"), 1);
                    }
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        wv.setDownloadListener((url, ua, cd, mime, len) -> {
            // FIX .BIN: kalau Content-Disposition kosong atau filename .bin, fallback pakai URL path
            String filename = URLUtil.guessFileName(url, cd, mime);
            if (filename == null || filename.endsWith(".bin") || filename.equals("downloadfile")) {
                try {
                    String path = Uri.parse(url).getPath();
                    if (path != null && path.contains(".")) {
                        filename = path.substring(path.lastIndexOf('/') + 1);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "filename-fallback", e);
                }
            }
            Log.d(TAG, "download: mime=" + mime + " cd=" + cd + " fn=" + filename);

            try {
                DownloadManager.Request rq = new DownloadManager.Request(Uri.parse(url));
                rq.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                rq.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(rq);
                Toast.makeText(this, "Download: " + filename, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Log.e(TAG, "download-fail", e);
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception e2) {
                    Toast.makeText(this, "Download failed", Toast.LENGTH_SHORT).show();
                }
            }
        });

        swipe.setOnRefreshListener(() -> {
            if (isOnline()) {
                if (wv.getUrl() != null && wv.getUrl().startsWith("file:")) {
                    wv.loadUrl(LIVE_URL);
                } else {
                    // Cache-bust: clear cache + reload biar dapet web terbaru
                    wv.clearCache(true);
                    wv.reload();
                }
            } else {
                wv.loadUrl("file:///android_asset/offline.html");
                swipe.setRefreshing(false);
            }
        });

        wv.loadUrl(LIVE_URL);
    }

    private boolean isOnline() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            NetworkInfo n = cm.getActiveNetworkInfo();
            return n != null && n.isConnected();
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    protected void onActivityResult(int rc, int res, Intent d) {
        super.onActivityResult(rc, res, d);
        if (rc == 1 && fileCallback != null) {
            android.net.Uri[] picked = d == null ? null : WebChromeClient.FileChooserParams.parseResult(res, d);
            android.widget.Toast.makeText(this, "DBG result=" + res + " picked=" + (picked == null ? "null" : String.valueOf(picked.length)), android.widget.Toast.LENGTH_LONG).show();
            if (picked != null) for (android.net.Uri u : picked) { try { getContentResolver().takePersistableUriPermission(u, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) {} }
            fileCallback.onReceiveValue(picked);
            fileCallback = null;
        }
    }

    @Override
    public boolean onKeyDown(int kc, KeyEvent ev) {
        if (kc == KeyEvent.KEYCODE_BACK && wv.canGoBack()) {
            wv.goBack();
            return true;
        }
        return super.onKeyDown(kc, ev);
    }
}
