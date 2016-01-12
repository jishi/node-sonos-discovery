'use strict';
const request = require('request-promise');

const apiBaseEndpoint = 'http://api.deezer.com';
const endpoints = {
  track: '/track/'
};

function parseUri(uri) {
  //x-sonosprog-http:tr-flac%3a3134041.flac?sid=2&flags=8224&sn=7

  /x-.+?:.+%3a(\d+)\./.test(uri);

  let id = RegExp.$1;

  return {
    id
  };

}

function tryGetHighResArt(uri) {
  let trackInfo = parseUri(uri);

  let apiUrl = [apiBaseEndpoint, endpoints.track, trackInfo.id].join('');

  return request({
    url: apiUrl,
    json: true
  })
    .then((response) => {
      return response.album.cover_big; // jscs:ignore requireCamelCaseOrUpperCaseIdentifiers
    });
}

module.exports = function (services) {
  services[2] = {
    tryGetHighResArt
  };
};
