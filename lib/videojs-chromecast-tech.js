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
