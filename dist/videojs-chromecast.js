/*! videojs-chromecast - v0.2.0 - 2018-08-10*/
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

  vjs.registerPlugin('chromecast', function(options) {
    var Chromecast = vjs.getTech('Chromecast'),
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

    this.onCastSessionUpdate_ = function(isAlive) {
      if (!isAlive) {
        return this.onCastStopped_('chromecast-stopped');
      }
    };

    this.onCastStopped_ = function(evt, data) {
      if (this.castSession_) {
        var source = this.currentSource(),
            currentTime = this.currentTime();

        this.castSession_ = undefined;
        this.unloadTech_();
        delete this.options_['chromecast'];

        this.trigger('waiting');

        this.src([source]);

        if (this.starttime) {
          this.starttime(currentTime);
        }

        this.one('ready', function() {
          if (!this.starttime) {
            this.one('timeupdate', function(){
              this.currentTime(currentTime);
            });
          }

          this.play();
        });

        this.trigger(evt, data);
      }
    };

    this.onCastMediaLoaded_ = function(media) {
      this.trigger('chromecast-media-loaded');
    };

    this.onCastMediaLoadedError_ = function() {
      this.trigger('chromecast-error', {code: 'MEDIA_ERROR'});
    };

    this.onLaunchSuccess_ = function(session) {
      this.castSession_ = session;

      this.options_['chromecast'] = {
        cast: this.castConnection_.cast,
        apiSession: this.castSession_,
        onMediaLoaded: this.onCastMediaLoaded_.bind(this),
        onMediaLoadedError: this.onCastMediaLoadedError_.bind(this),
        currentTime: this.currentTime()
      };

      this.loadTech_('Chromecast');

      this.castName_ = this.castSession_.receiver.friendlyName;
      this.castSession_.addUpdateListener(this.onCastSessionUpdate_.bind(this));

      this.pause();
      this.trigger('waiting');

      Player.src.call(this, this.currentSource());
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
      var canPlaySource = Chromecast.canPlaySource(this.currentSource());
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
      if (source) {
        this.stopCasting();
      }
      return Player.src.call(this, source);
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

  if (typeof Tech.registerTech !== 'undefined') {
    Tech.registerTech('Chromecast', Chromecast);
  } else {
    Component.registerComponent('Chromecast', Chromecast);
  }

})(window.videojs, document);
