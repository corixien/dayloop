package com.dayloop.app;

import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.service.voice.VoiceInteractionSessionService;

public class DayloopSessionService extends VoiceInteractionSessionService {
    @Override
    public VoiceInteractionSession onNewSession(Bundle args) {
        return new VoiceInteractionSession(this) {
            @Override
            public void onShow(Bundle showArgs, int showFlags) {
                super.onShow(showArgs, showFlags);
                // the assistant UI is the translucent overlay activity: a sheet over the current app, already listening
                startAssistantActivity(DayloopWidget.overlayIntent(DayloopSessionService.this, "assistant"));
                hide();
            }
        };
    }
}
