package com.dayloop.app;

import android.content.Intent;
import android.speech.RecognitionService;
import android.speech.SpeechRecognizer;

/** Required by the assistant framework; speech is recognized inside the app (Groq), so this only reports "unavailable". */
public class DayloopRecognitionService extends RecognitionService {
    @Override protected void onStartListening(Intent i, Callback c) {
        try { c.error(SpeechRecognizer.ERROR_CLIENT); } catch (Exception ignored) {}
    }
    @Override protected void onCancel(Callback c) {}
    @Override protected void onStopListening(Callback c) {}
}
