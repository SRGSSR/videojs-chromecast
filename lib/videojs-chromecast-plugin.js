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