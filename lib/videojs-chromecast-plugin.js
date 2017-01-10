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

    this.onCastSessionUpdate_ = function(isAlive) {
      if (!isAlive) {
        return this.onCastStopped_('chromecast-stopped');
      }
    };

    this.onCastMediaLoaded_ = function(media) {
      this.options_['chromecast'] = {
        apiMedia: media,
        apiSession: this.castSession_,
        currentTime: this.currentTime()
      };

      this.loadTech_('Chromecast', this.currentSource());

      this.castName_ = this.castSession_.receiver.friendlyName;
      this.castSession_.addUpdateListener(this.onCastSessionUpdate_.bind(this));

      this.trigger('chromecast-media-loaded');
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

    this.onLaunchSuccess_ = function(session) {
      var source = this.currentSource(),
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