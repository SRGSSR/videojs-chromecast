(function(window, vjs) {
    'use strict';

    vjs.registerPlugin('chromecast', function(options) {
        var Chromecast = vjs.getTech('Chromecast'),
            constructor = this,
            context,
            castSession,
            remotePlayer,
            localPlayer,
            playerController,
            metadata,
            chromecastOptions = options;

        this.canCastCurrentSrc_ = function() {
            var canPlaySource = Chromecast.canPlaySource(this.currentSource());
            return (canPlaySource === 'maybe' || canPlaySource === 'probably');
        };

        this.getCastDeviceName = function() {
            return this.castName_;
        };

        this.initCastConnection_ = function() {
            if (window.cast == null) {
                return;
            }
            localPlayer = this;
            context = window.cast.framework.CastContext.getInstance();
            context.addEventListener(
                window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
                function(event) {
                    switch (event.sessionState) {
                        case window.cast.framework.SessionState.SESSION_STARTED:
                            this.onLaunchSuccess_();
                            break;
                        case window.cast.framework.SessionState.SESSION_RESUMED:
                            break;
                        case window.cast.framework.SessionState.SESSION_ENDED:
                            this.onCastStopped_();

                            break;
                    }
                }.bind(this));

            context.setOptions({
                receiverApplicationId: chromecastOptions.appID ? chromecastOptions.appID : window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID
            });
            localPlayer.trigger('chromecast-initialized');
        };

        this.isCastReady = function() {
            return !!(context);
        };

        this.isCasting = function() {
            return !!(castSession);
        };

        this.launchCasting = function() {

        };

        this.onCastStopped_ = function(evt, data) {
            if (castSession){
                castSession.endSession(true);
                castSession = undefined;
            }
            if (!metadata.isLive) {
                var src = localPlayer.currentSrc();
                var  currentTime = remotePlayer.currentTime;
                localPlayer.trigger('chromecast-stopped');
                localPlayer.loadTech_('html5');
                localPlayer.src({ src: src });
                localPlayer.currentTime(currentTime);
                localPlayer.play();
            }else{
                localPlayer.trigger('chromecast-stopped');
                this.reset();
                this.trigger('chromecast-force-to-live');
            }
        };

        this.onLaunchSuccess_ = function(session) {
            castSession = window.cast.framework.CastContext.getInstance().getCurrentSession();

            var mediaInfo = new window.chrome.cast.media.MediaInfo(chromecastOptions.urn);
            mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
            mediaInfo.metadata.title = chromecastOptions.title;
            mediaInfo.metadata.subtitle = chromecastOptions.subtitle;

            var request = new window.chrome.cast.media.LoadRequest(mediaInfo);
            request.currentTime = localPlayer.currentTime();
            request.customData = {server: chromecastOptions.server};

            this.castName_ = castSession.getCastDevice().friendlyName;
            metadata = chromecastOptions.metadata;
            localPlayer.trigger('loading');

            castSession.loadMedia(request).then(
                function() {
                    remotePlayer = new window.cast.framework.RemotePlayer();
                    playerController = new window.cast.framework.RemotePlayerController(remotePlayer);

                    this.options_['chromecast'] = {
                        cast: window.chrome.cast,
                        apiSession: castSession,
                        localPlayer:localPlayer,
                        remotePlayer:remotePlayer,
                        remotePlayerController:playerController
                    };
                    localPlayer.trigger('chromecast-media-loaded');
                    localPlayer.loadTech_('Chromecast');
                }.bind(this),
                function(errorCode) {
                    window.console.log('Error code: ' + errorCode);
                });

        };

        this.one('ready', function() {
            this.initCastConnection_();
        });
    });

})(window, window.videojs);
