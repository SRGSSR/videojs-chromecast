/*! videojs-chromecast - v0.1.0 - 2016-12-22*/
(function(window, vjs) {
  'use strict';

  function CastConnection(onSessionJoined) {
    this.isConnected_ = false;
    this.onSessionJoined_ = onSessionJoined;
  }

  CastConnection.prototype = {
    connect_: function() {
      var request = new this.cast.SessionRequest(this.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID),
          config = new this.cast.ApiConfig(request, this.onSessionJoined_, this.receiverListener_.bind(this));

      this.cast.initialize(config, this.onInitSuccess_, this.onInitError_);
    },

    initialize_: function() {
      if (this.isAvailable) {
        this.connect_();
        this.intializeTimeout_ = undefined;
      } else {
        this.intializeTimeout_ = setTimeout(this.initialize_.bind(this), 2000);
      }
    },

    receiverListener_: function(availability) {
      if (availability === 'available') {
        this.isConnected_ = true;
      }
    },

    initialize: function(success, error) {
      if (!this.isConnected_ && window.chrome) {
        this.onInitSuccess_ = success;
        this.onInitError_ = error;
        this.initialize_();
      }
    },

    dispose: function() {
      if (this.intializeTimeout_) {
        clearTimeout(this.intializeTimeout_);
      }
    }
  };

  Object.defineProperties(CastConnection.prototype, {
    cast: {
      get: function() {
        return (window.chrome) ? window.chrome.cast : undefined;
      }
    },
    isConnected: {
      get: function() {
        return this.isConnected_;
      }
    },
    isAvailable: {
      get: function() {
        return this.cast && this.cast.isAvailable;
      }
    }
  });

  vjs.plugin('chromecast', function(options) {
    var Chromecast = vjs.getComponent('Chromecast'),
        constructor = this,
        Player = {
          dispose: constructor.dispose,
          src: constructor.src
        };

    this.initCastConnection_ = function() {
      if (!this.castConnection_ && this.canCastCurrentSrc_()) {
        this.castConnection_ = new CastConnection(this.onCastSessionJoined_);
        this.castConnection_.initialize_(this.onCastInitSucccess_, this.onCastInitError);
      }
    };

    this.onCastInitSucccess_ = function() {
      this.trigger('chromecast-initialized');
    };

    this.onCastInitError_ = function() {
      this.trigger('chromecast-error', {code: 'LAUNCH_ERROR'});
    };

    this.onCastSessionJoined_ = function(session) {
      if (session.media.length) {
        this.castSession_ = session;
        this.onCastMediaLoaded_(this.castSession_.media[0]);
      }
    };

    this.onCastMediaLoaded_ = function(media) {
      this.loadTech_('Chromecast', {
        type: 'cast',
        src: this.currentSrc(),
        apiMedia: media,
        apiSession: this.castSession_,
        currentTime: this.currentTime()
      });

      this.castName_ = this.castSession_.receiver.friendlyName;
      this.castSession_.addUpdateListener(this.onCastSessionUpdate_.bind(this));
      this.trigger('chromecast-media-loaded');
    };

    this.onCastSessionUpdate_ = function(isAlive) {
      if (!isAlive && this.castSession_) {
        return this.onCastStopped_('chromecast-stopped');
      }
    };

    this.onCastStopped_ = function(evt, data) {
      this.castSession_ = undefined;

      // Steps to recover old tech
      // 1. Create  plugin to tokenize on src call
      // 2. Get previous tech on on CastingMediaLoaded
      // 3. do a loadTech with the currentSrc and set the position (probably offset plugin?)
      this.trigger(evt, data);
    };

    this.onLaunchSuccess_ = function(session) {
      var source = this.currentSrc(),
          cast = this.castConnection_.cast,
          media = new cast.media.MediaInfo(source.src, source.type),
          request = new cast.media.LoadRequest(media);

      request.autoplay = true;
      request.currentTime = this.currentTime();

      this.castSession_ = session;        

      this.pause();
      this.trigger('waiting');

      this.castSession_.loadMedia(request,
          this.onCastMediaLoaded_.bind(this),
          function () {
            this.trigger('chromecast-error', {code: 'MEDIA_ERROR'});
          }.bind(this)
      );
    };

    this.launchCasting = function() {
      if (this.castConnection_ && this.castConnection_.isConnected) {
        var cast = this.castConnection_.cast;

        this.pause();
        this.trigger('waiting');

        cast.requestSession(
          this.onLaunchSuccess_.bind(this),
          function() {
            this.pause();
            this.trigger('chromecast-error', {code: 'MEDIA_ERROR'});
          }.bind(this)
        );
      }
    };

    this.stopCasting = function() {
      if (this.castSession_) {
        this.castSession_.stop(
          this.onCastStopped_.bind(this, 'chromecast-stopped'),
          this.onCastStopped_.bind(this, 'chromecast-error', {code: 'STOP_ERROR'})
        );
      }
    };

    this.getCastDeviceName = function() {
      return this.castName_;
    };

    this.isCasting = function() {
      return !!this.castSession_;
    };

    this.canCastCurrentSrc_ = function() {
      var canPlaySource = Chromecast.canPlaySource(this.currentSrc());
      return (canPlaySource === 'maybe' || canPlaySource === 'probably');
    };

    this.isCastReady = function() {
       return this.canCastCurrentSrc_() &&
              this.castConnection_ &&
              this.castConnection_.isConnected;
    };

    this.disposeCast_ = function() {
      this.stopCasting();
      if (this.castConnection_) {
        this.castConnection_.dispose();
        this.castConnection_ = undefined;
      }
    };

    this.dispose = function() {
      this.disposeCast_();
      Player.dispose.call(this);
    };

    this.src = function(source) {
      this.stopCasting();
      Player.src.call(this, source);
    };

    if (!this.isReady_) {
      this.on('ready', function() {
        this.initCastConnection_();
      });
    } else {
      this.initCastConnection_();
    }
  });

})(window, window.videojs);
(function (window, videojs, document) {
  'use strict';

  var Component = videojs.getComponent('Component'),
      Tech = videojs.getTech('Tech'),
      chrome = window.chrome;

  var Chromecast = videojs.extend(Tech, {

    constructor: function(options, ready) {
      Tech.prototype.constructor.apply(this, arguments);

      this.apiMedia_ = this.options_.source.apiMedia;
      this.apiSession_ = this.options_.source.apiSession;
      this.currentTime_ = this.options_.source.currentTime;

      this.paused_ = false;
      this.muted_ = false;

      this.apiMedia_.addUpdateListener(this.onMediaStateUpdate_.bind(this));
      this.apiSession_.addUpdateListener(this.onSessionUpdate_.bind(this));

      this.startProgressTimer_();

      this.triggerReady();

      this.trigger('loadstart');
      this.trigger('loadedmetadata');
      this.trigger('loadeddata');
      this.trigger('canplay');
      this.trigger('canplaythrough');
      this.trigger('durationchange');
    },

    onSessionUpdate_: function(isAlive) {
      if (this.apiMedia_ && !isAlive) {
        this.stopCasting_();
      }
    },

    stopCasting_: function() {
      this.stopTrackingCurrentTime();
      clearInterval(this.progressTimer_);
      this.apiMedia_.stop();
      this.apiSession_.stop();
    },

    onMediaStateUpdate_: function() {
      if (!this.apiMedia_) {
        return;
      }

      this.currentTime_ = this.apiMedia_.currentTime;
      switch (this.apiMedia_.playerState) {
        case chrome.cast.media.PlayerState.BUFFERING:
          this.trigger('waiting');
          break;
        case chrome.cast.media.PlayerState.IDLE:
          this.onIdle_();
          break;
        case chrome.cast.media.PlayerState.PAUSED:
          this.trigger('pause');
          this.paused_ = true;
          break;
        case chrome.cast.media.PlayerState.PLAYING:
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
        case chrome.cast.media.IdleReason.CANCELLED:
        case chrome.cast.media.IdleReason.INTERRUPTED:
        case chrome.cast.media.IdleReason.ERROR:
          this.trigger('error');
          break;
        case chrome.cast.media.IdleReason.FINISHED:
          this.ended_ = true;
          this.trigger('ended');
      }

      this.stopCasting_();
    },

    src: function(src) {
      // Not Supported
    },

    currentSrc: function() {
      return this.options_.source.src;
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
        var request = new chrome.cast.media.SeekRequest();

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

      if (this.apiMedia_.playerState === chrome.cast.media.PlayerState.PLAYING) {
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
        var volume = new chrome.cast.Volume(),
            request = new chrome.cast.media.VolumeRequest(),
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
        var volume = new chrome.cast.Volume(),
            request = new chrome.cast.media.VolumeRequest(),
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

})(window, window.videojs, document);
