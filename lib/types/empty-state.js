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
    trackUri: '',
    type: URI_TYPE.TRACK,
    stationName: '',
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
  playlistName: '',
  relTime: 0,
  stateTime: 0,
  volume: 0,
  mute: false,
  trackNo: 0,
  playbackState: 'STOPPED',
  equalizer: {
    bass: 0,
    treble: 0,
    loudness: false
  }
});

module.exports = EMPTY_STATE;
