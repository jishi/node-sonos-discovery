'use strict';
const url = require('url');
const Subscriber = require('../Subscriber');
const soap = require('../helpers/soap');
const streamer = require('../helpers/streamer');
const TYPE = soap.TYPE;
const flow = require('xml-flow');
const XmlEntities = require('html-entities').XmlEntities;
const path = require('path');
const requireDir = require('../helpers/require-dir');
let xmlEntities = new XmlEntities();

const EMPTY_STATE = Object.freeze({
  currentTrack: Object.freeze({
    artist: '',
    title: '',
    album: '',
    albumArtUri: '',
    duration: 0,
    uri: '',
    radioShowMetaData: ''
  }),
  nextTrack: Object.freeze({
    artist: '',
    title: '',
    album: '',
    albumArtUri: '',
    duration: 0,
    uri: ''
  }),
  playMode: Object.freeze({
    repeat: false,
    shuffle: false,
    crossfade: false
  }),
  relTime: 0,
  stateTime: 0,
  volume: 0,
  mute: false,
  trackNo: 0,
  playbackState: 'STOPPED'
});

const PLAY_MODE = Object.freeze({
  NORMAL: 0,
  REPEAT_ALL: 1,
  SHUFFLE_NOREPEAT: 2,
  SHUFFLE: 3,
  REPEAT_ONE: 4,
  SHUFFLE_REPEAT_ONE: 6
});

function reversePlayMode() {
  let lookup = {};
  for (let key in PLAY_MODE) {
    lookup[PLAY_MODE[key]] = key;
  }

  return lookup;
}

const PLAY_MODE_LOOKUP = Object.freeze(reversePlayMode());

function getPlayMode(state) {
  let key = state.shuffle << 1 | state.repeat;
  return PLAY_MODE_LOOKUP[key];
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function parseTime(formattedTime) {
  var chunks = formattedTime.split(':').reverse();
  var timeInSeconds = 0;

  for (var i = 0; i < chunks.length; i++) {
    timeInSeconds += parseInt(chunks[i], 10) * Math.pow(60, i);
  }

  return isNaN(timeInSeconds) ? 0 : timeInSeconds;
}

function zpad(number) {
  return number.toLocaleString('en-us', { minimumIntegerDigits: 2 });
}

function formatTime(seconds) {
  var chunks = [];
  var remainingTime = seconds;

  // hours
  var hours = Math.floor(remainingTime / 3600);

  chunks.push(zpad(hours));
  remainingTime -= hours * 3600;

  // minutes
  var minutes = Math.floor(remainingTime / 60);
  chunks.push(zpad(minutes));
  remainingTime -= minutes * 60;

  // seconds
  chunks.push(zpad(remainingTime));

  return chunks.join(':');
}

function parseTrackMetadata(metadata, nextTrack) {
  let track = nextTrack ? clone(EMPTY_STATE.nextTrack) : clone(EMPTY_STATE.currentTrack);
  track.uri = metadata.res.$text;
  track.duration = parseTime(metadata.res.$attrs.duration);
  track.artist = metadata['dc:creator'];
  track.album = metadata['upnp:album'];
  track.title = metadata['dc:title'];
  track.albumArtUri = metadata['upnp:albumarturi'];
  return track;
}

function getState(playerInternal, coordinatorInternal) {
  var diff = 0;
  if (coordinatorInternal.currentState === 'PLAYING')
    diff = new Date().valueOf() - coordinatorInternal.stateTime;

  var elapsedTime = coordinatorInternal.relTime + Math.floor(diff / 1000);

  return Object.freeze({
    currentTrack: coordinatorInternal.currentTrack,
    nextTrack: coordinatorInternal.nextTrack,
    volume: playerInternal.volume,
    mute: playerInternal.mute,
    trackNo: coordinatorInternal.trackNo,
    elapsedTime: elapsedTime,
    elapsedTimeFormatted: formatTime(elapsedTime),
    playbackState: coordinatorInternal.currentState,
    playMode: coordinatorInternal.playMode
  });
}

function Player(data, listener, system) {
  let _this = this;
  _this.system = system;
  _this.roomName = data.zonename;
  _this.uuid = data.uuid;

  // This is just a default, SonosSystem is responsible for updating this
  _this.coordinator = _this;
  _this.groupState = {
    volume: 0,
    mute: false
  };
  let state = clone(EMPTY_STATE);
  Object.defineProperty(_this, 'state', {
    get: () => getState(state, _this.coordinator._state)
  });

  // This is used internally only
  Object.defineProperty(_this, '_state', {
    get: () => state
  });
  _this.ownVolumeEvents = [];
  _this._setVolume = function _setVolume(level) {
    state.volume = level;
  };

  let uri = url.parse(data.location);
  _this.baseUrl = `${uri.protocol}//${uri.host}`;

  let subscribeEndpoints = [
    '/MediaRenderer/AVTransport/Event',
    '/MediaRenderer/RenderingControl/Event',
    '/MediaRenderer/GroupRenderingControl/Event'
  ];

  let subscriptions = subscribeEndpoints.map((path) => {
    return new Subscriber(_this.baseUrl + path, listener.endpoint());
  });

  _this.dispose = function dispose() {
    subscriptions.forEach((subscriber) => {
      subscriber.dispose();
    });
  };

  function getPositionInfo() {
    soap.invoke(
      `${_this.baseUrl}/MediaRenderer/AVTransport/Control`,
      TYPE.GetPositionInfo)
      .then((response) => {
        // Simplifies testing by not requiring mock data
        if (!response) return;

        let sax = flow(response);
        sax.on('tag:reltime', (node) => {
          state.relTime = parseTime(node.$text);
          state.stateTime = Date.now();
        });
      })
      .catch((err) => {
        console.error(err);
      });
  }

  function notificationHandler(uuid, data) {
    if (uuid !== _this.uuid) {
      // This was not intended for us, skip it.
      return;
    }

    if (data.transportstate) {
      state.currentState = data.transportstate.val;
      state.trackNo = parseInt(data.currenttrack.val);
      state.currentTrack = parseTrackMetadata(data.currenttrackmetadata.item);
      state.nextTrack = parseTrackMetadata(
        data.currenttrackmetadata['r:nexttrackmetadata'].item,
        true
      );
      state.playMode.crossfade = data.currentcrossfademode.val === '1';

      // bitwise check if shuffle or repeat. Return boolean if flag is set.
      state.playMode.repeat = !!(PLAY_MODE[data.currentplaymode.val] & PLAY_MODE.REPEAT_ALL);
      state.playMode.shuffle = !!(PLAY_MODE[data.currentplaymode.val] & PLAY_MODE.SHUFFLE);

      getPositionInfo();

    } else if (data.volume) {
      let master = data.volume.find(x => x.channel === 'Master');
      state.volume = parseInt(master.val);
      _this.coordinator.recalculateGroupVolume();
    }

  }

  listener.on('last-change', notificationHandler);
}

Player.prototype.play = function play() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.Play);
};

Player.prototype.pause = function pause() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.Pause);
};

Player.prototype.nextTrack = function nextTrack() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.Next);
};

Player.prototype.previousTrack = function previousTrack() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.Previous);
};

Player.prototype.mute = function mute() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.Mute,
    { mute: 1 });
};

Player.prototype.unMute = function unMute() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.Mute,
    { mute: 0 });
};

Player.prototype.setVolume = function setVolume(level) {
  // If prefixed with + or -
  if (/^[+\-]/.test(level)) {
    level = this.state.volume + parseInt(level);
  }

  if (level < 0) level = 0;
  this._setVolume(level);

  // stash this update to ignore the event when it comes back.
  this.ownVolumeEvents.push(level);

  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.Volume,
    { volume: level });
};

Player.prototype.timeSeek = function timeSeek(seconds) {
  let formattedTime = formatTime(seconds);
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.Seek,
    { unit: 'REL_TIME', value: formattedTime });
};

Player.prototype.trackSeek = function trackSeek(trackNo) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.Seek,
    { unit: 'TRACK_NR', value: trackNo });
};

Player.prototype.clearQueue = function clearQueue() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.RemoveAllTracksFromQueue);
};

Player.prototype.removeTrackFromQueue = function removeTrackFromQueue(index) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.RemoveTrackFromQueue,
    { track: index || 0 });
};

Player.prototype.addURIToQueue = function addURIToQueue(uri, metadata, enqueueAsNext, desiredFirstTrackNumberEnqueued) {
  desiredFirstTrackNumberEnqueued =
    desiredFirstTrackNumberEnqueued === undefined
      ? 0
      : desiredFirstTrackNumberEnqueued;

  enqueueAsNext = enqueueAsNext ? 1 : 0;

  if (metadata === undefined) {
    metadata = '';
  }

  metadata = xmlEntities.encode(metadata);
  uri = xmlEntities.encode(uri);

  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.AddURIToQueue,
    {
      uri,
      metadata,
      desiredFirstTrackNumberEnqueued,
      enqueueAsNext
    });
};

Player.prototype.repeat = function repeat(enabled) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.SetPlayMode,
    {
      playMode: getPlayMode({
        repeat: !!enabled,
        shuffle: this.state.playMode.shuffle
      })
    });
};

Player.prototype.shuffle = function shuffle(enabled) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.SetPlayMode,
    {
      playMode: getPlayMode({
        shuffle: !!enabled,
        repeat: this.state.playMode.repeat
      })
    });
};

Player.prototype.crossfade = function crossfade(enabled) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.SetCrossfadeMode,
    { crossfadeMode: enabled ? 1 : 0 });
};

Player.prototype.sleep = function sleep(seconds) {
  let formattedTime = formatTime(seconds);
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.ConfigureSleepTimer,
    { time: formattedTime });
};

Player.prototype.setAVTransport = function setAVTransport(uri, metadata) {
  if (metadata === undefined) {
    metadata = '';
  }

  let entityEncodedMetadata = xmlEntities.encode(metadata);
  let entityEncodedUri = xmlEntities.encode(uri);
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.SetAVTransportURI,
    { uri: entityEncodedUri, metadata: entityEncodedMetadata });
};

Player.prototype.becomeCoordinatorOfStandaloneGroup = function becomeCoordinatorOfStandaloneGroup() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.BecomeCoordinatorOfStandaloneGroup);
};

Player.prototype.refreshShareIndex = function refreshShareIndex() {
  return soap.invoke(
    `${this.baseUrl}/MediaServer/ContentDirectory/Control`,
    TYPE.RefreshShareIndex);
};

Player.prototype.browse = function browse(objectId, startIndex, limit) {
  startIndex = startIndex === undefined ? 0 : startIndex;
  limit = limit === undefined ? 0 : limit;
  return soap.invoke(
    `${this.baseUrl}/MediaServer/ContentDirectory/Control`,
    TYPE.Browse,
    { objectId, startIndex, limit })
    .then((stream) => {
      return new Promise((resolve, reject) => {

        let returnResult = {
          startIndex,
          items: []
        };

        let sax = flow(stream);
        sax.on('tag:numberreturned', (node) => {
          returnResult.numberReturned = parseInt(node.$text);
        });

        sax.on('tag:totalmatches', (node) => {
          returnResult.totalMatches = parseInt(node.$text);
        });

        sax.on('tag:result', (node) => {

          let stream = streamer(node.$text);
          let sax2 = flow(stream);

          sax2.on('tag:item', (item) => {
            returnResult.items.push({
              uri: item.res.$text,
              title: item['dc:title'],
              artist: item['dc:creator'],
              album: item['upnp:album'],
              albumArtUri: item['upnp:albumarturi'],
              metadata: item['r:resmd']
            });
          });

          sax2.on('tag:container', (item) => {

            returnResult.items.push({
              uri: item.res.$text,
              title: item['dc:title'],
              albumArtUri: item['upnp:albumarturi']
            });
          });

          sax2.on('end', () => {
            resolve(returnResult);
          });

          sax2.on('error', (error) => {
            reject(error);
          });

        });

        sax.on('error', (error) => {
          reject(error);
        });
      });
    });
};

Player.prototype.getQueue = function getQueue(startIndex, limit) {
  return this.browse('Q:0', startIndex, limit);
};

requireDir(path.join(__dirname, '../prototypes/Player'), (proto) => {
  Player.prototype[proto.name] = proto;
});

module.exports = Player;
