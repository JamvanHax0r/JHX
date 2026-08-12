package id.jhx.tools;

import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.view.View;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.widget.ImageView;

public class SplashActivity extends Activity {
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_splash);

        ImageView logo = findViewById(R.id.logo);
        View loader = findViewById(R.id.loader);

        // Animasi fade-in logo (0.3s → 1.0 alpha, 800ms duration)
        logo.setAlpha(0.3f);
        ObjectAnimator fadeLogo = ObjectAnimator.ofFloat(logo, "alpha", 0.3f, 1f);
        fadeLogo.setDuration(800);
        fadeLogo.setInterpolator(new DecelerateInterpolator());

        // Animasi scale logo (0.8x → 1.0x, bounce effect)
        ObjectAnimator scaleLogoX = ObjectAnimator.ofFloat(logo, "scaleX", 0.8f, 1f);
        ObjectAnimator scaleLogoY = ObjectAnimator.ofFloat(logo, "scaleY", 0.8f, 1f);
        scaleLogoX.setDuration(800);
        scaleLogoY.setDuration(800);
        scaleLogoX.setInterpolator(new AccelerateDecelerateInterpolator());
        scaleLogoY.setInterpolator(new AccelerateDecelerateInterpolator());

        // Animasi loader bar (width dari 0dp → 180dp, 1500ms duration)
        loader.getLayoutParams().width = 0;
        loader.requestLayout();
        ValueAnimator loaderAnim = ValueAnimator.ofInt(0, 600); // 600px = ~180dp
        loaderAnim.setDuration(1500);
        loaderAnim.setInterpolator(new AccelerateDecelerateInterpolator());
        loaderAnim.addUpdateListener(animation -> {
            int width = (int) animation.getAnimatedValue();
            loader.getLayoutParams().width = width;
            loader.requestLayout();
        });

        // Jalankan semua animasi paralel
        AnimatorSet animatorSet = new AnimatorSet();
        animatorSet.playTogether(fadeLogo, scaleLogoX, scaleLogoY, loaderAnim);
        animatorSet.start();

        // Setelah 2 detik, pindah ke MainActivity dengan fade transition
        new Handler().postDelayed(() -> {
            Intent intent = new Intent(SplashActivity.this, MainActivity.class);
            startActivity(intent);
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
            finish();
        }, 2000);
    }
}
