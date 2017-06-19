'use strict';
const request = require('../helpers/request');
const apiBaseEndpoint = 'https://api.spotify.com';
const endpoints = {
  track: '/v1/tracks/'
};

function parseUri(uri) {
  // x-sonos-spotify:spotify%3atrack%3a3WKg25vrbjJlkhsgl2W4p3?sid=9&flags=8224&sn=9
  let id;

  const matches = /spotify%3atrack%3a([\w\d]+)/i.exec(uri);

  if (matches) {
    id = matches[1];
  }

  return {
    id
  };

}

function tryGetHighResArt(uri) {
  let trackInfo = parseUri(uri);

  let apiUrl = [apiBaseEndpoint, endpoints.track, trackInfo.id].join('');

  return request({
    uri: apiUrl,
    type: 'json'
  })
    .then((response) => {
      return response.album.images.length ? response.album.images[0].url : null;
    });
}

module.exports = function (services) {
  // services[9] = {
  //   tryGetHighResArt
  // };
};
