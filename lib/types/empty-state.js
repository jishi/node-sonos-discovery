'use strict';

const REPEAT_MODE = require('./repeat-mode');
const URI_TYPE = require('./uri-type');

const EMPTY_STATE = Object.freeze({
  currentTrack: Object.freeze({
    artist: '',
    title: '',
    album: '',
    albumArtUri: '',
    duration: 0,
    uri: '',
    type: URI_TYPE.TRACK
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
    repeat: REPEAT_MODE.NONE,
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

module.exports = EMPTY_STATE;
