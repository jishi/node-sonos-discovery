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

function Player(data, listener) {
  let _this = this;
  this.roomName = data.zonename;
  this.uuid = data.uuid;

  let uri = url.parse(data.location);
  this.baseUrl = util.format('%s//%s', uri.protocol, uri.host);

  let subscribeEndpoints = [
    '/MediaRenderer/AVTransport/Event',
    '/MediaRenderer/RenderingControl/Event',
    '/MediaRenderer/GroupRenderingControl/Event'
  ];

  let subscriptions = subscribeEndpoints.map((path) => {
    return new Subscriber(_this.baseUrl + path, listener.endpoint());
  });

  this.dispose = function dispose() {
    subscriptions.forEach((subscriber) => {
      subscriber.dispose();
    });
  }

  function notificationHandler(uuid, data) {
    if (uuid !== _this.uuid) {
      // This was not intended for us, skip it.
      return;
    }

    let state = clone(EMPTY_STATE);
    state.currentState = data.transportstate.val;
    state.trackNo = parseInt(data.currenttrack.val);
    state.currentTrack.uri = data.currenttrackuri.val;
    state.currentTrack.duration = parseTime(data.currenttrackduration.val);
    state.currentTrack.artist = data.currenttrackmetadata.item['dc:creator'];
    state.currentTrack.album = data.currenttrackmetadata.item['upnp:album'];
    state.currentTrack.title = data.currenttrackmetadata.item['dc:title'];
    state.currentTrack.albumArtUri = data.currenttrackmetadata.item['upnp:albumarturi'];

    _this.state = state;

  }

  listener.on('last-change', notificationHandler);
}

module.exports = Player;
