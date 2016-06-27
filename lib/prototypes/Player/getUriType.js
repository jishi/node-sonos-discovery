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
  return isRadio(uri) ? URI_TYPE.RADIO : isLineIn(uri) ? URI_TYPE.LINE_IN : URI_TYPE.TRACK;
}

module.exports = getUriType;
