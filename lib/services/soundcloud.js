'use strict';
const request = require('../helpers/request');
const clientId = '6b9ec970f07f410376f1db1dfa8d71b3';
const apiBaseEndpoint = 'http://api.soundcloud.com';
let settings = {};

try {
  settings = require.main.require('./settings.json');
} catch (e) {
}

settings.soundcloud = settings.soundcloud || clientId;

const endpoints = {
  track: '/tracks/'
};

function parseUri(uri) {
  // x-sonos-http:track%3a232202756.mp3?sid=160&flags=8224&sn=10
  let id;
  const uriParts = /x-sonos-http:track%3a(\d+)\./.exec(uri);
  if (uriParts) {
    id = uriParts[1];
  }

  return {
    id
  };

}

function tryGetHighResArt(uri) {
  let trackInfo = parseUri(uri);

  let apiUrl = [
    apiBaseEndpoint,
    endpoints.track,
    trackInfo.id,
    '?client_id=',
    settings.soundcloud
  ].join('');

  return request({
    uri: apiUrl,
    type: 'json'
  })
    .then((response) => {
      let artwork;

      // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
      /* jshint -W106 */
      if (response.artwork_url) {
        artwork = response.artwork_url.replace('large', 't500x500');
      }

      // jscs:enable requireCamelCaseOrUpperCaseIdentifiers
      /* jshint +W106 */

      return artwork;
    });
}

module.exports = function (services) {
  services[160] = {
    tryGetHighResArt
  };
};
