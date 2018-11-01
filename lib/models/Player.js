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
const logger = require('../helpers/logger');
const musicServices = require('../musicservices');
const xmlEntities = new XmlEntities();
const util = require('util');
const EventEmitter = require('events').EventEmitter;

const EMPTY_STATE = require('../types/empty-state');
const PLAY_MODE = require('../types/play-mode');
const REPEAT_MODE = require('../types/repeat-mode');
const URI_TYPE = require('../types/uri-type');

function reversePlayMode() {
  let lookup = {};
  for (let key in PLAY_MODE) {
    lookup[PLAY_MODE[key]] = key;
  }

  return lookup;
}

const PLAY_MODE_LOOKUP = Object.freeze(reversePlayMode());

function getPlayMode(state) {
  let key = state.shuffle << 1 | (state.repeat === REPEAT_MODE.ONE ? 4 : (state.repeat === REPEAT_MODE.ALL ? 1 : 0));
  return PLAY_MODE_LOOKUP[key];
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function parseTime(formattedTime) {
  if (formattedTime === undefined) {
    return 0;
  }

  var chunks = formattedTime.split(':').reverse();
  var timeInSeconds = 0;

  for (var i = 0; i < chunks.length; i++) {
    timeInSeconds += parseInt(chunks[i], 10) * Math.pow(60, i);
  }

  return isNaN(timeInSeconds) ? 0 : timeInSeconds;
}

function zpad(number) {
  return ('00' + number).substr(-2);
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

function deepFreeze(obj) {
  const copy = Object.assign({}, obj);
  Object.keys(copy).filter(key => copy[key] && Object.getPrototypeOf(copy[key]) === Object.prototype)
    .forEach(key => copy[key] = deepFreeze(copy[key]));

  return Object.freeze(copy);
}

function parseTrackMetadata(metadata, nextTrack) {
  return new Promise((resolve, reject) => {
    let track = nextTrack ? clone(EMPTY_STATE.nextTrack) : clone(EMPTY_STATE.currentTrack);
    if (!metadata || !metadata.val) resolve(track);

    const sax = flow(streamer(metadata.val));

    sax.on('tag:item', (item) => {
      track.uri = item.res && item.res.$text;
      track.trackUri = track.uri;
      track.duration = item.res ? parseTime((item.res.$attrs || item.res).duration) : 0;
      track.artist = item['dc:creator'];
      track.album = item['upnp:album'];

      // if title and uri is the same, this is a radio station
      // (cheap way of checking for radio)

      track.title = item['r:streamcontent'] || item['dc:title'];
      track.albumArtUri = item['upnp:albumarturi'];
    });

    sax.on('error', reject);

    sax.on('end', () => {
      resolve(track);
    });

  });
}

function parseEnqueuedMetadata(metadata) {
  return new Promise((resolve, reject) => {
    if (!metadata || !metadata.val) resolve({});

    const sax = flow(streamer(metadata.val));

    const enqueuedMetadata = {};

    sax.on('tag:item', (item) => {
      enqueuedMetadata.title = item['dc:title'];
      enqueuedMetadata.albumArtURI = item['upnp:albumarturi'];
    });

    sax.on('error', reject);

    sax.on('end', () => {
      resolve(enqueuedMetadata);
    });

  });
}

function getState(playerInternal, coordinatorInternal, sub) {
  var diff = 0;
  if (coordinatorInternal.playbackState === 'PLAYING')
    diff = Date.now() - coordinatorInternal.stateTime;

  var elapsedTime = coordinatorInternal.relTime + Math.floor(diff / 1000);

  const state = {
    volume: playerInternal.volume,
    mute: playerInternal.mute,
    equalizer: playerInternal.equalizer,
    currentTrack: coordinatorInternal.currentTrack,
    nextTrack: coordinatorInternal.nextTrack,
    trackNo: coordinatorInternal.trackNo,
    elapsedTime: elapsedTime,
    elapsedTimeFormatted: formatTime(elapsedTime),
    playbackState: coordinatorInternal.playbackState,
    playMode: coordinatorInternal.playMode
  };

  if (sub) {
    state.sub = sub;
  }

  return deepFreeze(state);
}

function Player(data, listener, system) {
  let _this = this;
  _this.system = system;
  _this.roomName = data.zonename;
  _this.uuid = data.uuid;
  _this.avTransportUri = '';
  _this.avTransportUriMetadata = '';
  _this.outputFixed = false;
  _this.hasSub = false;
  _this.sub = {};

  // This is just a default, SonosSystem is responsible for updating this
  _this.coordinator = _this;
  _this.groupState = {
    volume: 0,
    mute: false
  };
  let state = clone(EMPTY_STATE);
  Object.defineProperty(_this, 'state', {
    get: () => getState(state, _this.coordinator._state, _this.hasSub ? _this.sub : null)
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
    '/MediaRenderer/GroupRenderingControl/Event',
    '/MediaServer/ContentDirectory/Event'
  ];

  let subscriptions = subscribeEndpoints.map((path) => {
    return new Subscriber(`${_this.baseUrl}${path}`, listener.endpoint());
  });

  _this.dispose = function dispose() {
    subscriptions.forEach((subscriber) => {
      subscriber.dispose();
    });
  };

  function getPositionInfo() {
    return soap.invoke(
      `${_this.baseUrl}/MediaRenderer/AVTransport/Control`,
      TYPE.GetPositionInfo)
      .then(soap.parse)
      .then(response => {
        // Simplifies testing by not requiring mock data
        if (!response) {
          return;
        }

        if (response.reltime !== undefined) state.relTime = parseTime(response.reltime);
        state.stateTime = Date.now();

      })
      .catch((err) => {
        logger.error(err);
      });
  }

  function tryReplaceWithHighresAlbumArt(track) {
    if (!track.uri) {
      return;
    }

    return musicServices.tryGetHighResArt(track.uri)
      .then((highResAlbumArtUrl) => {
        track.absoluteAlbumArtUri = highResAlbumArtUrl;
      }).catch(() => {
        if (track.albumArtUri && track.albumArtUri.startsWith('http')) {
          track.absoluteAlbumArtUri = track.albumArtUri;
        } else if (track.albumArtUri) {
          track.absoluteAlbumArtUri = `${_this.baseUrl}${track.albumArtUri}`;
        }
      });
  }

  function notificationHandler(uuid, data) {
    if (uuid !== _this.uuid) {
      // This was not intended for us, skip it.
      return;
    }

    if (data.avtransporturi) {
      _this.avTransportUri = xmlEntities.decode(data.avtransporturi.val);
    }

    if (data.avtransporturimetadata) {
      _this.avTransportUriMetadata = data.avtransporturimetadata.val;
    }

    if (data.transportstate) {
      state.playbackState = data.transportstate.val;
      logger.debug('Updated playback state in notification handler');
      state.trackNo = parseInt(data.currenttrack.val);
      state.playMode.crossfade = data.currentcrossfademode.val === '1';

      // bitwise check if shuffle or repeat. Return boolean if flag is set.
      let currentPlayMode = PLAY_MODE[data.currentplaymode.val];
      state.playMode.repeat = !!(currentPlayMode & PLAY_MODE.REPEAT_ALL) ? REPEAT_MODE.ALL : !!(currentPlayMode & PLAY_MODE.REPEAT_ONE) ? REPEAT_MODE.ONE : REPEAT_MODE.NONE;
      state.playMode.shuffle = !!(PLAY_MODE[data.currentplaymode.val] & PLAY_MODE.SHUFFLE_NOREPEAT);

      const inputType = _this.getUriType(_this.avTransportUri);

      parseTrackMetadata(data.currenttrackmetadata)
        .then(track => {
          if (!track.uri) {
            track.uri = _this.avTransportUri;
          }

          state.currentTrack = track;
          state.currentTrack.type = inputType;
          return tryReplaceWithHighresAlbumArt(track);
        })
        .then(() => parseTrackMetadata(data['r:nexttrackmetadata'], true))
        .then(track => {
          state.nextTrack = track;
          return tryReplaceWithHighresAlbumArt(track);
        })
        .then(() => {
          return parseEnqueuedMetadata(data['r:enqueuedtransporturimetadata'])
            .then(enqueuedInfo => {
              if (inputType === URI_TYPE.RADIO) {
                if (state.currentTrack.artist === undefined) {
                  state.currentTrack.artist = enqueuedInfo.title;
                }

                state.currentTrack.stationName = enqueuedInfo.title;
                state.currentTrack.uri = _this.avTransportUri;
              } else if (inputType === URI_TYPE.TRACK) {
                state.playlistName = enqueuedInfo.title;
                state.currentTrack.absoluteAlbumArtUri = enqueuedInfo.albumArtURI || state.currentTrack.absoluteAlbumArtUri;
              }
            });
        })
        .then(() => {
          if (
            !_this.avTransportUri.startsWith('x-rincon:') &&
            _this.state.playbackState !== 'TRANSITIONING'
          ) {
            // Only fetch position info if coordinator
            return getPositionInfo()
              .then(() => {
                _this.emit('transport-state', _this.state);
                _this.system.emit('transport-state', _this);
              });
          }
        })
        .catch(err => {
          logger.error(err);
        });
    }

    if (data.mute) {
      let master = data.mute.find(x => x.channel === 'Master');
      const previousMute = state.mute;
      state.mute = master.val === '1';

      _this.emit('mute-change', {
        previousMute,
        newMute: state.mute,
        roomName: _this.roomName
      });

      _this.system.emit('mute-change', {
        uuid: _this.uuid,
        previousMute,
        newMute: state.mute,
        roomName: _this.roomName
      });
    }

    if (data.volume) {
      let master = data.volume.find(x => x.channel === 'Master');
      const previousVolume = state.volume;
      state.volume = parseInt(master.val);

      _this.emit('volume-change', {
        previousVolume,
        newVolume: state.volume,
        roomName: _this.roomName
      });

      _this.system.emit('volume-change', {
        uuid: _this.uuid,
        previousVolume,
        newVolume: state.volume,
        roomName: _this.roomName
      });

      _this.coordinator.recalculateGroupVolume();
    }

    if (data.outputfixed) {
      _this.outputFixed = data.outputfixed.val === '1';
    }

    if (data.subgain) {
      _this.sub.gain = parseInt(data.subgain.val);
    }

    if (data.subcrossover) {
      _this.sub.crossover = parseInt(data.subcrossover.val);
    }

    if (data.subpolarity) {
      _this.sub.polarity = parseInt(data.subpolarity.val);
    }

    if (data.subenabled) {
      _this.sub.enabled = data.subenabled.val == '1';
    }

    if (data.bass) {
      _this._state.equalizer.bass = parseInt(data.bass.val);
    }

    if (data.treble) {
      _this._state.equalizer.treble = parseInt(data.treble.val);
    }

    if (data.dialoglevel) {
      _this._state.equalizer.speechEnhancement = data.dialoglevel.val === '1';
    }

    if (data.nightmode) {
      _this._state.equalizer.nightMode = data.nightmode.val === '1';
    }

    if (data.loudness) {
      _this._state.equalizer.loudness = data.loudness.val === '1';
    }
  }

  function groupMuteHandler(uuid, mute) {
    if (uuid !== _this.uuid) {
      // This was not intended for us, skip it.
      return;
    }

    let previousMute = _this.groupState.mute;
    _this.groupState.mute = mute == '1';

    _this.emit('group-mute', {
      uuid: _this.uuid,
      previousMute,
      newMute: _this.groupState.mute,
      roomName: _this.roomName
    });

    _this.system.emit('group-mute', {
      uuid: _this.uuid,
      previousMute,
      newMute: _this.groupState.mute,
      roomName: _this.roomName
    });
  }

  listener.on('group-mute', groupMuteHandler);
  listener.on('last-change', notificationHandler);
}

util.inherits(Player, EventEmitter);

Player.prototype.play = function play() {
  logger.debug('invoking play');
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.Play);
};

Player.prototype.pause = function pause() {
  logger.debug('invoking pause');
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.Pause);
};

Player.prototype.stop = function stop() {
  logger.debug('invoking stop');
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.Stop);
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

Player.prototype.unMuteGroup = function unMuteGroup() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/GroupRenderingControl/Control`,
    TYPE.GroupMute,
    { mute: 0 });
};

Player.prototype.muteGroup = function muteGroup() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/GroupRenderingControl/Control`,
    TYPE.GroupMute,
    { mute: 1 });
};

Player.prototype.setVolume = function setVolume(level) {
  if (this.outputFixed) {
    return Promise.resolve();
  }

  // If prefixed with + or -
  if (/^[+\-]/.test(level)) {
    level = this.state.volume + parseInt(level);
  }

  level = parseInt(level);

  if (level < 0) level = 0;
  this._setVolume(level);

  // stash this update to ignore the event when it comes back.
  this.ownVolumeEvents.push(level);

  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.Volume,
    { volume: level });
};

Player.prototype.setBass = function setBass(level) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetBass,
    { level });
};

Player.prototype.setTreble = function setBass(level) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetTreble,
    { level });
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

Player.prototype.removeTrackRangeFromQueue = function removeTrackRangeFromQueue(startIndex, numberOfTracks) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.RemoveTrackRangeFromQueue,
    {
      startIndex: parseInt(startIndex, 10) || 0,
      numberOfTracks: parseInt(numberOfTracks, 10) || 0
    });
};

Player.prototype.reorderTracksInQueue = function reorderTracksInQueue(startIndex, numberOfTracks, insertBefore) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.ReorderTracksInQueue,
    {
      startIndex: parseInt(startIndex, 10) || 0,
      numberOfTracks: parseInt(numberOfTracks, 10) || 0,
      insertBefore: parseInt(insertBefore, 10) || 0
    });
};

Player.prototype.saveQueue = function saveQueue(title) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.SaveQueue,
    {
      title
    });
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
    }).then(soap.parse);
};

Player.prototype.addMultipleURIsToQueue = function addMultipleURIsToQueue(elements, containerURI, containerMetadata, enqueueAsNext, desiredFirstTrackNumberEnqueued) {
  desiredFirstTrackNumberEnqueued = desiredFirstTrackNumberEnqueued === undefined ? 0 : desiredFirstTrackNumberEnqueued;
  enqueueAsNext = enqueueAsNext ? 1 : 0;

  let uris = [];
  let metadatas = [];

  elements.forEach(element => {
    uris.push(xmlEntities.encode(element[0]));
    metadatas.push(xmlEntities.encode(element[1] || ''));
  });

  if (containerMetadata === undefined) {
    containerMetadata = '';
  }

  containerMetadata = xmlEntities.encode(containerMetadata);
  containerURI = xmlEntities.encode(containerURI);

  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
    TYPE.AddURIToQueue,
    {
      amount: uris.length,
      uris: uris.join(' '),
      metadatas: metadatas.join(' '),
      containerURI,
      containerMetadata,
      desiredFirstTrackNumberEnqueued,
      enqueueAsNext
    }).then(soap.parse);
};

Player.prototype.setPlayMode = function setPlayMode(newPlayMode) {
  let promise = Promise.resolve();

  if (newPlayMode.repeat !== undefined || newPlayMode.shuffle !== undefined) {
    const desiredPlayMode = Object.assign({}, this.state.playMode, newPlayMode);
    const playMode = getPlayMode(desiredPlayMode);

    logger.debug(`repeat: ${newPlayMode.repeat}, shuffle: ${newPlayMode.shuffle}`);
    logger.debug(`calculated playmode to ${playMode}`);
    promise = promise.then(() => {
      return soap.invoke(
        `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
        TYPE.SetPlayMode,
        { playMode })
        .catch((err) => {
          logger.warn(err, `Failed when trying to set playmode ${playMode}, could be playing radiostation or line-in, no worries.`);
        });
    });
  }

  if (newPlayMode.crossfade !== undefined) {
    promise = promise.then(() => {
      return soap.invoke(
        `${this.baseUrl}/MediaRenderer/AVTransport/Control`,
        TYPE.SetCrossfadeMode,
        { crossfadeMode: newPlayMode.crossfade ? 1 : 0 });
    });
  }

  return promise;
};

Player.prototype.repeat = function repeat(mode) {
  let repeatMode = mode;
  if (typeof mode === 'boolean') repeatMode = mode ? REPEAT_MODE.ALL : REPEAT_MODE.NONE;

  return this.setPlayMode({ repeat: repeatMode });
};

Player.prototype.shuffle = function shuffle(enabled) {
  return this.setPlayMode({ shuffle: Boolean(enabled) });
};

Player.prototype.crossfade = function crossfade(enabled) {
  logger.debug(`Setting crossfade to ${enabled}`);
  return this.setPlayMode({ crossfade: Boolean(enabled) });
};

Player.prototype.sleep = function sleep(seconds) {
  let formattedTime = '';
  if (seconds != 0) {
    formattedTime = formatTime(seconds);
  }

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
    { uri: entityEncodedUri, metadata: entityEncodedMetadata })
    .then(() => {
      this.avTransportUri = uri;
      this.avTransportUriMetadata = metadata;
    });
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
    .then(soap.parse)
    .then(res => {
      return new Promise((resolve, reject) => {
        let returnResult = {
          startIndex,
          items: []
        };

        returnResult.numberReturned = parseInt(res.numberreturned, 10);
        returnResult.totalMatches = parseInt(res.totalmatches, 10);

        let stream = streamer(res.result);
        let sax = flow(stream, { preserveMarkup: flow.NEVER });

        sax.on('tag:item', (item) => {
          returnResult.items.push({
            uri: item.res ? item.res.$text : '',
            title: item['dc:title'],
            artist: item['dc:creator'],
            album: item['upnp:album'],
            albumTrackNumber: item['upnp:originaltracknumber'],
            albumArtUri: item['upnp:albumarturi'] instanceof Array
              ? item['upnp:albumarturi'][0]
              : item['upnp:albumarturi'],
            metadata: item['r:resmd']
          });
        });

        sax.on('tag:container', (item) => {

          returnResult.items.push({
            uri: item.res.$text,
            title: item['dc:title'],
            artist: item['dc:creator'],
            albumArtUri: item['upnp:albumarturi']
          });
        });

        sax.on('end', () => {
          resolve(returnResult);
        });

        sax.on('error', (error) => {
          reject(error);
        });
      });
    });
};

Player.prototype.browseAll = function browseAll(objectId) {
  let result = {
    items: [],
    startIndex: 0,
    numberReturned: 0,
    totalMatches: 1
  };

  let getChunk = (chunk) => {
    if (!chunk || !Array.isArray(chunk.items) || isNaN(chunk.totalMatches)) {
      // something went wrong. prevent infinite loop
      return Promise.reject(new Error('browse() returned an invalid payload'));
    }

    Array.prototype.push.apply(result.items, chunk.items);
    result.numberReturned += chunk.numberReturned;
    result.totalMatches = chunk.totalMatches;

    if (chunk.startIndex + chunk.numberReturned >= chunk.totalMatches) {
      return result.items;
    }

    // Recursive promise chain
    return this.browse(objectId, chunk.startIndex + chunk.numberReturned, 0)
      .then(getChunk);
  };

  return Promise.resolve(result)
    .then(getChunk);
};

Player.prototype.getQueue = function getQueue(limit, offset) {
  const queueIdentifier = 'Q:0';
  limit = limit || 0;
  offset = offset || 0;

  if (!limit) {
    return this.browseAll(queueIdentifier);
  }

  return this.browse(queueIdentifier, offset, limit)
    .then(result => result.items);
};

Player.prototype.toJSON = function toJSON() {
  return {
    uuid: this.uuid,
    coordinator: this.coordinator.uuid,
    roomName: this.roomName,
    state: this.state,
    groupState: this.coordinator.groupState,
    avTransportUri: this.avTransportUri,
    avTransportUriMetadata: this.avTransportUriMetadata
  };
};

requireDir(path.join(__dirname, '../prototypes/Player'), (proto) => {
  Player.prototype[proto.name] = proto;
});

module.exports = Player;
