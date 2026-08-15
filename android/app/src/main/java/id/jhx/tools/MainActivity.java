package id.jhx.tools;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.widget.Toast;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private WebView wv;
    private ValueCallback<Uri[]> fileCallback;
    private static final int FC_REQ = 1;
    private static final int PERM_REQ = 100;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_main);
        wv = findViewById(R.id.webview);

        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setDatabaseEnabled(true);

        wv.setWebViewClient(new WebViewClient());

        wv.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    if (!hasMediaPermission()) {
                        requestMediaPermission();
                        return true;
                    }
                    // Gunakan intent manual yang lebih universal (bukan createIntent yang ketat)
                    Intent pickIntent = new Intent(Intent.ACTION_GET_CONTENT);
                    pickIntent.addCategory(Intent.CATEGORY_OPENABLE);
                    pickIntent.setType("image/*");
                    pickIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    pickIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    pickIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);

                    Intent chooser = Intent.createChooser(pickIntent, "Pilih gambar");
                    startActivityForResult(chooser, FC_REQ);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        wv.setDownloadListener((url, ua, cd, mime, len) -> {
            String filename = URLUtil.guessFileName(url, cd, mime);
            if (filename == null || filename.endsWith(".bin") || filename.equals("downloadfile")) {
                try {
                    String path = Uri.parse(url).getPath();
                    if (path != null && path.contains(".")) {
                        filename = path.substring(path.lastIndexOf('/') + 1);
                    }
                } catch (Exception ignored) {}
            }
            android.app.DownloadManager.Request req = new android.app.DownloadManager.Request(Uri.parse(url));
            req.setMimeType(mime);
            req.addRequestHeader("User-Agent", ua);
            req.setDescription("Downloading...");
            req.setTitle(filename);
            req.allowScanningByMediaScanner();
            req.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, filename);
            android.app.DownloadManager dm = (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            dm.enqueue(req);
            Toast.makeText(this, "⬇ " + filename, Toast.LENGTH_SHORT).show();
        });

        wv.loadUrl("https://jhx.my.id/");
    }

    private boolean hasMediaPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED;
        }
        return ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestMediaPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.READ_MEDIA_IMAGES}, PERM_REQ);
        } else {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, PERM_REQ);
        }
    }

    @Override
    public void onRequestPermissionsResult(int rc, String[] perms, int[] res) {
        super.onRequestPermissionsResult(rc, perms, res);
        if (rc == PERM_REQ) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "✓ Izin akses gambar diberikan", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "✗ Izin ditolak — upload tidak bisa", Toast.LENGTH_LONG).show();
                if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
            }
        }
    }

    @Override
    protected void onActivityResult(int rc, int res, Intent d) {
        super.onActivityResult(rc, res, d);
        if (rc == FC_REQ && fileCallback != null) {
            Uri[] results = null;
            if (res == Activity.RESULT_OK && d != null) {
                // Handle multiple selection
                String dataString = d.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                } else if (d.getClipData() != null) {
                    int count = d.getClipData().getItemCount();
                    List<Uri> list = new ArrayList<>();
                    for (int i = 0; i < count; i++) {
                        list.add(d.getClipData().getItemAt(i).getUri());
                    }
                    results = list.toArray(new Uri[0]);
                }
            }
            // Grant URI read permission ke WebView
            if (results != null) {
                for (Uri u : results) {
                    try {
                        getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    } catch (Exception ignored) {}
                }
            }
            fileCallback.onReceiveValue(results);
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
