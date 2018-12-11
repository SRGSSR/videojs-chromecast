/*! videojs-chromecast - v0.2.1 - 2018-12-11*/
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
                localPlayer.src({ src: this.currentSource().rawSrc_});
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

(function (vjs) {
    'use strict';

    var Component = vjs.getComponent('Component'),
        Tech = vjs.getTech('Tech'),
        chrome = window.chrome;

    var Chromecast = vjs.extend(Tech, {

        constructor: function(options, ready) {
            Tech.prototype.constructor.apply(this, arguments);

            this.apiSession_ = this.options_.apiSession;
            this.localPlayer_ = this.options_.localPlayer;
            this.remotePlayer_ = this.options_.remotePlayer;
            this.remotePlayerController_ = this.options_.remotePlayerController;

            this.currentTime_ = this.localPlayer_.currentTime();
            this.urn_ = this.options_.urn;

            this.remotePlayer_.paused_ = false;
            this.remotePlayer_.muted_ = false;

            this.startProgressTimer_();
            this.triggerReady();

            if (this.remotePlayer_.isMuted) {
                this.remotePlayerController_.muteOrUnmute();
            }

            this.localPlayer_.trigger("play");
        },

        _playOrPause: function(){
            if (this.remotePlayer_.isPaused) {
                this.localPlayer_.trigger("pause");
            }else{
                this.localPlayer_.trigger("play");
            }
            this.remotePlayerController_.playOrPause();
        },

        buffered: function() {
            return undefined;
        },

        controls: function() {
            return false;
        },

        currentTime: function() {
            return this.remotePlayer_.currentTime;
        },

        dispose: function() { },

        duration: function() {
            return this.remotePlayer_.duration;
        },

        ended: function() {
            return this.remotePlayer_.duration <= this.remotePlayer_.currentTime;
        },

        incrementCurrentTime_: function() {
            if (!this.remotePlayer_) {
                return;
            }
            if (this.remotePlayer_.playerState === "PLAYING") {
                if (this.remotePlayer_.currentTime < this.remotePlayer_.duration) {
                    this.currentTime_ = this.remotePlayer_.currentTime;
                    this.trigger('timeupdate');
                } else {
                    clearInterval(this.progressTime_);
                }
            }
        },

        muted: function() {
            return this.muted_;
        },

        onSeekSuccess: function(position) { },

        play: function() {
            this._playOrPause();
        },

        pause: function() {
            this._playOrPause();
        },

        paused: function() {
            return this.remotePlayer_.isPaused;
        },

        resetSrc_: function(callback) {
            callback();
        },

        seekable: function() {
            return undefined;
        },

        seek: function(position){
            this.setCurrentTime(position);
        },

        setCurrentTime: function(position) {
            var duration = this._remotePlayer.duration;
            this._remotePlayer.currentTime = Math.min(duration - 1, position);
            this.remotePlayerController_.seek();
        },

        setMuted: function(muted) {},

        setVolume: function(level) {},

        startProgressTimer_: function() {
            if (this.progressTimer_) {
                clearInterval(this.progressTimer_);
            }
            this.progressTimer_ = setInterval(this.incrementCurrentTime_.bind(this), 1000);
        },

        stopCasting: function(){
            if (this.apiSession_) {
                this.apiSession_.endSession(true);
                this.apiSession_ = undefined;
            }
        },

        supportsFullScreen: function() {},

        supportsStarttime: function() {
            return false;
        },

        volume: function() {},

    });

    Chromecast.prototype.options_ = {};

    Chromecast.prototype.featuresVolumeControl = true;
    Chromecast.prototype.featuresPlaybackRate = false;
    Chromecast.prototype.movingMediaElementInDOM = false;
    Chromecast.prototype.featuresFullscreenResize = false;
    Chromecast.prototype.featuresTimeupdateEvents = false;
    Chromecast.prototype.featuresProgressEvents = false;
    Chromecast.prototype.featuresNativeTextTracks = true;
    Chromecast.prototype.featuresNativeAudioTracks = true;
    Chromecast.prototype.featuresNativeVideoTracks = false;

    Chromecast.canPlaySource = function(source) {
        return chrome && (source.type) ? this.supportsCasting_(source.type) : this.supportsCasting_(source.src);
    };

    Chromecast.isSupported = function () {
        return true;
    };

    Chromecast.supportsCasting_ = function(source) {
        var typeRE = /^application\/(?:dash\+xml|(x-|vnd\.apple\.)mpegurl)/i;
        var extensionRE = /^video\/(mpd|mp4|webm|m3u8)/i;

        if (typeRE.test(source)) {
            return 'probably';
        } else if (extensionRE.test(source)) {
            return 'maybe';
        } else {
            return '';
        }
    };

    if (typeof Tech.registerTech !== 'undefined') {
        Tech.registerTech('Chromecast', Chromecast);
    } else {
        Component.registerComponent('Chromecast', Chromecast);
    }

})(window.videojs, document);
