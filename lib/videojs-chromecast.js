/*! videojs-chromecast - v0.0.1 - 2016-03-23*/
(function (window, videojs, document, undefined) {
  'use strict';

  var Component = videojs.getComponent('Component'),
      Tech = videojs.getTech('Tech'),
      chrome = window.chrome;

  var Chromecast = videojs.extend(Tech, {
    constructor: function(options, ready) {
      Tech.prototype.constructor.apply(this, arguments);

      this.apiMedia = this.options_.source.apiMedia;
      this.apiSession = this.options_.source.apiSession;
      this.currentMediaTime = this.options_.source.currentTime;
      this.receiver = this.apiSession.receiver.friendlyName;

      this.apiMedia.addUpdateListener(this.onMediaStatusUpdate.bind(this));
      this.apiSession.addUpdateListener(this.onSessionUpdate.bind(this));
      this.startProgressTimer(this.incrementMediaTime.bind(this));

      var tracks = this.textTracks();

      if (tracks) {
        (function () {
          var changeHandler = this.handleTracksChange.bind(this);

          tracks.addEventListener('change', changeHandler);
          this.on('dispose', function () {
            tracks.removeEventListener('change', changeHandler);
          });

          this.handleTracksChange();
        }.bind(this))();
      }
      this.triggerReady();

      this.trigger('loadstart');
      this.trigger('loadedmetadata');
      this.trigger('loadeddata');
      this.trigger('canplay');
      this.trigger('canplaythrough');
      this.trigger('durationchange');
    },

    onSessionUpdate: function(isAlive) {
      if (!this.apiMedia) {
        return;
      }
      if (!isAlive) {
        return this.onStopAppSuccess();
      }
    },

    onStopAppSuccess: function() {
      this.stopTrackingCurrentTime();
      clearInterval(this.timer);
      this.apiMedia = null;
    },

    onMediaStatusUpdate: function() {
      if (!this.apiMedia) {
        return;
      }
      this.currentMediaTime = this.apiMedia.currentTime;
      switch (this.apiMedia.playerState) {
        case chrome.cast.media.PlayerState.BUFFERING:
          this.trigger('waiting');
          break;
        case chrome.cast.media.PlayerState.IDLE:
          this.currentMediaTime = 0;
          this.trigger('timeupdate');
          this.onStopAppSuccess();
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

    src: function(src) {

    },

    seekable: function() {
      return undefined;
    },

    handleTracksChange: function() {
      var trackInfo = [];
      var tracks = this.textTracks();

      if (!tracks) {
        return;
      }

      for (var i = 0; i < tracks.length; i++) {
        var track = tracks[i];
        if (track.mode === 'showing') {
          trackInfo.push(i + 1);
        }
      }

      if (this.apiMedia) {
        this.tracksInfoRequest = new chrome.cast.media.EditTracksInfoRequest(trackInfo);
        return this.apiMedia.editTracksInfo(this.tracksInfoRequest, this.onTrackSuccess.bind(this), this.onTrackError.bind(this));
      }
    },

    onTrackSuccess: function(e) {
      // return _videoJs2['default'].log('track added');
    },

    onTrackError: function(e) {
      // return _videoJs2['default'].log('Cast track Error: ' + JSON.stringify(e));
    },

    castError: function(e) {
      // return _videoJs2['default'].log('Cast Error: ' + JSON.stringify(e));
    },

    play: function() {
      if (!this.apiMedia) {
        return;
      }
      if (this.paused_) {
        this.apiMedia.play(null, this.mediaCommandSuccessCallback.bind(this, 'Playing: ' + this.apiMedia.sessionId), this.castError.bind(this));
      }
      this.paused_ = false;
    },

    pause: function() {
      if (!this.apiMedia) {
        return;
      }
      if (!this.paused_) {
        this.apiMedia.pause(null, this.mediaCommandSuccessCallback.bind(this, 'Paused: ' + this.apiMedia.sessionId), this.castError.bind(this));
        this.paused_ = true;
      }
    },

    paused: function() {
      return this.paused_;
    },

    currentTime: function() {
      return this.currentMediaTime;
    },

    setCurrentTime: function(position) {
      if (!this.apiMedia) {
        return 0;
      }
      var request = new chrome.cast.media.SeekRequest();
      request.currentTime = position;
      this.currentMediaTime = position;
      return this.apiMedia.seek(request, this.onSeekSuccess.bind(this, position), this.castError.bind(this));
    },

    startProgressTimer: function(callback) {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.timer = setInterval(callback.bind(this), this.timerStep);
    },

    incrementMediaTime: function() {
      if (this.apiMedia.playerState !== chrome.cast.media.PlayerState.PLAYING) {
        return;
      }
      if (this.currentTime() < this.apiMedia.media.duration) {
        this.currentMediaTime += 1;
        this.trigger('timeupdate');
      } else {
        clearInterval(this.timer);
      }
    },

    onSeekSuccess: function(position) {
      //_videoJs2['default'].log('seek success' + position);
    },

    volume: function() {
      return this.volume_;
    },

    duration: function() {
      if (!this.apiMedia) {
        return 0;
      }
      return this.apiMedia.media.duration;
    },

    controls: function() {
      return false;
    },

    setVolume: function(level) {
      var mute = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1], request, volume;

      if (!this.apiMedia) {
        return;
      }
      volume = new chrome.cast.Volume();
      volume.level = level;
      volume.muted = mute;
      this.volume_ = volume.level;
      this.muted_ = mute;
      request = new chrome.cast.media.VolumeRequest();
      request.volume = volume;
      this.apiMedia.setVolume(request, this.mediaCommandSuccessCallback.bind(this, 'Volume changed'), this.castError.bind(this));
      return this.trigger('volumechange');
    },

    mediaCommandSuccessCallback: function(information) {
      //_videoJs2['default'].log(information);
    },

    muted: function() {
      return this.muted_;
    },

    setMuted: function(muted) {
      return this.setVolume(this.volume_, muted);
    },

    supportsFullScreen: function() {
      return false;
    },

    resetSrc_: function(callback) {
      callback();
    },

    dispose: function() {
      this.resetSrc_(Function.prototype);
      Tech.prototype.dispose.apply(this, arguments);
    }
  });

  Chromecast.prototype.paused_ = false;
  Chromecast.prototype.options_ = {};
  Chromecast.prototype.timerStep = 1000;
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

  Chromecast.supportsCasting = function(source) {
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
    return chrome && (source.type) ? this.supportsCasting(source.type) : this.supportsCasting(source.src);
  };

  Component.registerComponent('Chromecast', Chromecast);
  Tech.registerTech('Chromecast', Chromecast);
})(window, videojs, document);
