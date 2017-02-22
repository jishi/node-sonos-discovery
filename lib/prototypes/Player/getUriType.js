'use strict';
const URI_TYPE = require('../../types/uri-type');

function isRadio(uri) {
  return uri.startsWith('x-sonosapi-stream:') ||
    uri.startsWith('x-sonosapi-radio:') ||
    uri.startsWith('pndrradio:') ||
    uri.startsWith('x-sonosapi-hls:') ||
    uri.startsWith('x-sonosprog-http:') ||
    uri.startsWith('x-rincon-mp3radio:');
}

function isLineIn(uri) {
  return uri.startsWith('x-rincon-stream:') ||
    uri.startsWith('x-sonos-htastream:');
}

function getUriType(uri) {
  return isRadio(uri) ? URI_TYPE.RADIO : isLineIn(uri) ? URI_TYPE.LINE_IN : URI_TYPE.TRACK;
}

module.exports = getUriType;
