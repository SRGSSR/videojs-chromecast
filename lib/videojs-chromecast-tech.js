(function (vjs) {
  'use strict';

  var Component = vjs.getComponent('Component'),
      Tech = vjs.getTech('Tech'),
      chrome = window.chrome;

  var Chromecast = vjs.extend(Tech, {

    constructor: function(options, ready) {
      Tech.prototype.constructor.apply(this, arguments);

      this.cast_ = this.options_.cast;
      this.apiSession_ = this.options_.apiSession;
      this.currentTime_ = this.options_.currentTime;

      this.paused_ = false;
      this.muted_ = false;

      this.apiSession_.addUpdateListener(this.onSessionUpdate_.bind(this));

      this.startProgressTimer_();

      this.triggerReady();
    },

    onSessionUpdate_: function(isAlive) {
      if (this.apiMedia_ && !isAlive) {
        this.stopCasting_();
      }
    },

    stopCasting_: function() {
      this.stopTrackingCurrentTime();
      clearInterval(this.progressTimer_);
      if (this.apiMedia_) {
        this.apiMedia_.stop();
      }
      this.apiSession_.stop();
    },

    onMediaStateUpdate_: function() {
      if (!this.apiMedia_) {
        return;
      }

      this.currentTime_ = this.apiMedia_.currentTime;
      switch (this.apiMedia_.playerState) {
        case this.cast_.media.PlayerState.BUFFERING:
          this.trigger('waiting');
          break;
        case this.cast_.media.PlayerState.IDLE:
          this.onIdle_();
          break;
        case this.cast_.media.PlayerState.PAUSED:
          this.trigger('pause');
          this.paused_ = true;
          break;
        case this.cast_.media.PlayerState.PLAYING:
          this.trigger('playing');
          this.trigger('play');
          this.paused_ = false;
          break;
      }
    },

    onIdle_: function() {
      if (!this.apiMedia_) {
        return;
      }

      switch (this.apiMedia_.idleReason) {
        case this.cast_.media.IdleReason.CANCELLED:
        case this.cast_.media.IdleReason.INTERRUPTED:
        case this.cast_.media.IdleReason.ERROR:
          this.trigger('error');
          break;
        case this.cast_.media.IdleReason.FINISHED:
          this.ended_ = true;
          this.trigger('ended');
      }

      this.stopCasting_();
    },

    onMediaLoaded_: function(media) {
      this.apiMedia_ = media;

      this.trigger('durationchange');
      this.trigger('loadstart');
      this.trigger('loadedmetadata');
      this.trigger('loadeddata');
      this.trigger('canplay');
      this.trigger('canplaythrough');

      this.apiMedia_.addUpdateListener(this.onMediaStateUpdate_.bind(this));
      this.options_.onMediaLoaded();
    },

    load: function() {
      // Do nothing
    },

    src: function(source) {
      if (source!==undefined) {
        var media = new this.cast_.media.MediaInfo(source),
            request = new this.cast_.media.LoadRequest(media);

        request.autoplay = true;
        request.currentTime = this.currentTime();

        this.trigger('waiting');

        this.apiSession_.loadMedia(request,
            this.onMediaLoaded_.bind(this),
            this.options_.onMediaLoadedError
        );
      } else {
        return this.currentSrc();
      }
    },

    currentSrc: function() {
      return this.options_.source;
    },

    seekable: function() {
      return undefined;
    },

    mediaCastError_: function(e) {

    },

    mediaCastSuccess_: function() {

    },

    apiCall_: function(func, request) {
      this.apiMedia_[func](request || null, this.mediaCastSuccess_.bind(this), this.mediaCastError_.bind(this));
    },

    play: function() {
      if (!this.apiMedia_) {
        return;
      }
      if (this.paused_) {
        this.apiCall_('play');
      }
      this.paused_ = false;
    },

    pause: function() {
      if (!this.apiMedia_) {
        return;
      }
      if (!this.paused_) {
        this.apiCall_('pause');
        this.paused_ = true;
      }
    },

    paused: function() {
      return this.paused_;
    },

    currentTime: function() {
      return (!this.ended_) ? this.currentTime_ : this.duration();
    },

    setCurrentTime: function(position) {
      if (this.apiMedia_) {
        var request = new this.cast_.media.SeekRequest();

        request.currentTime = position;
        this.currentTime_ = position;

        this.apiCall_('seek', request); 
      }
    },

    startProgressTimer_: function() {
      if (this.progressTimer_) {
        clearInterval(this.progressTimer_);
      }
      this.progressTimer_ = setInterval(this.incrementCurrentTime_.bind(this), 1000);
    },

    incrementCurrentTime_: function() {
      if (!this.apiMedia_) {
        return;
      }

      if (this.apiMedia_.playerState === this.cast_.media.PlayerState.PLAYING) {
        if (this.currentTime() < this.apiMedia_.media.duration) {
          this.currentTime_ += 1;
          this.trigger('timeupdate');
        } else {
          clearInterval(this.progressTime_);
        }
      }
    },

    onSeekSuccess: function(position) {

    },

    ended: function() {
      return this.ended_ || this.duration() <= this.currentTime_;
    },

    duration: function() {
      if (!this.apiMedia_) {
        return 0;
      }

      return this.apiMedia_.media.duration;
    },

    controls: function() {
      return false;
    },

    volume: function() {
      return this.volume_;
    },

    setVolume: function(level) {
      if (this.apiMedia_) {
        var volume = new this.cast_.Volume(),
            request = new this.cast_.media.VolumeRequest(),
            success = this.mediaCastSuccess_.bind(this, 'Volume changed'),
            error = this.mediaCastError_.bind(this);

        volume.level = level;
        this.volume_ = level;
        request.volume = volume;
        this.apiCall_('setVolume', request);

        this.trigger('volumechange');
      }
    },

    muted: function() {
      return this.muted_;
    },

    setMuted: function(muted) {
      if (this.apiMedia_) {
        var volume = new this.cast_.Volume(),
            request = new this.cast_.media.VolumeRequest(),
            success = this.mediaCastSuccess_.bind(this, 'Mute changed'),
            error = this.mediaCastError_.bind(this);

        this.muted_ = muted === undefined ? false : !!muted;
        volume.level = this.muted_;
        this.apiCall_('setVolume', request);

        this.trigger('volumechange');
      }
    },

    supportsFullScreen: function() {
      return false;
    },

    resetSrc_: function(callback) {
      callback();
    },

    supportsStarttime: function() {
      return false;
    },

    dispose: function() {
      this.stopCasting_();
      this.apiMedia_ = undefined;
      this.apiSession_ = undefined;
      this.resetSrc_(Function.prototype);
      Tech.prototype.dispose.apply(this, arguments);
    }
  });

  Chromecast.prototype.options_ = {};
  Chromecast.isSupported = function () {
    return true;
  };

  Chromecast.prototype.featuresVolumeControl = true;
  Chromecast.prototype.featuresPlaybackRate = false;
  Chromecast.prototype.movingMediaElementInDOM = false;
  Chromecast.prototype.featuresFullscreenResize = false;
  Chromecast.prototype.featuresTimeupdateEvents = false;
  Chromecast.prototype.featuresProgressEvents = false;
  Chromecast.prototype.featuresNativeTextTracks = true;
  Chromecast.prototype.featuresNativeAudioTracks = true;
  Chromecast.prototype.featuresNativeVideoTracks = false;

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

  Chromecast.canPlaySource = function(source) {
    return chrome && (source.type) ? this.supportsCasting_(source.type) : this.supportsCasting_(source.src);
  };

  Component.registerComponent('Chromecast', Chromecast);
  Tech.registerTech('Chromecast', Chromecast);

})(window.videojs, document);
