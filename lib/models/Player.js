'use strict';
const url = require('url');
const util = require('util');
const Subscriber = require('../Subscriber');

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
  relTime: 0,
  stateTime: 0,
  volume: 0,
  mute: false,
  trackNo: 0,
  currentState: 'STOPPED'
});

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

function Player(data, listener) {
  let _this = this;
  _this.roomName = data.zonename;
  _this.uuid = data.uuid;
  _this.state = clone(EMPTY_STATE);

  let uri = url.parse(data.location);
  _this.baseUrl = util.format('%s//%s', uri.protocol, uri.host);

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
  }

  function notificationHandler(uuid, data) {
    if (uuid !== _this.uuid) {
      // This was not intended for us, skip it.
      return;
    }

    if (data.transportstate) {
      _this.state.currentState = data.transportstate.val;
      _this.state.trackNo = parseInt(data.currenttrack.val);
      _this.state.currentTrack = parseTrackMetadata(data.currenttrackmetadata.item);
      _this.state.nextTrack = parseTrackMetadata(data.currenttrackmetadata['r:nexttrackmetadata'].item, true);
    } else if (data.volume) {
      let master = data.volume.find(x => x.channel === 'Master');
      _this.state.volume = parseInt(master.val);
    }

  }

  listener.on('last-change', notificationHandler);
}

module.exports = Player;
