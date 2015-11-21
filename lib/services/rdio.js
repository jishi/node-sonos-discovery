'use strict';
const request = require('request-promise');

const apiBaseEndpoint = 'https://services.rdio.com/api/1/';

function parseUri(uri) {
  // x-sonos-http:_t%3a%3a36909122.mp3?sid=11&flags=8224&sn=11

  /x-.+?:.+%3a(\d+)\./.test(uri);

  let id = 't' + RegExp.$1;

  return {
    id
  };

}

function tryGetHighResArt(uri) {
  let trackInfo = parseUri(uri);

  let parameters = {
    method: 'get',
    keys: trackInfo.id
  };

  return request({
    method: 'POST',
    url: apiBaseEndpoint,
    body: parameters,
    json: true
  })
    .then((response) => {
      console.log(response)
      return response.album.cover_big;
    })
}

module.exports = function (services) {
  services[11] = {
    tryGetHighResArt
  };
};