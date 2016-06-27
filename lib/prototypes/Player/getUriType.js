const URI_TYPE = require('../../types/uri-type');

function isRadio(uri) {
  return uri.startsWith('x-sonosapi-stream:') ||
    uri.startsWith('x-sonosapi-radio:') ||
    uri.startsWith('pndrradio:') ||
    uri.startsWith('x-sonosapi-hls:') ||
    uri.startsWith('x-sonosprog-http:');
}

function isLineIn(uri) {
  return uri.startsWith('x-rincon-stream:');
}

function getUriType(uri) {
  const _uri = (typeof uri !== 'undefined') ? uri : this.state && this.state.currentTrack && this.state.currentTrack.uri;

  return isRadio(_uri) ? URI_TYPE.RADIO : isLineIn(_uri) ? URI_TYPE.LINE_IN : URI_TYPE.TRACK;
}

module.exports = getUriType;
