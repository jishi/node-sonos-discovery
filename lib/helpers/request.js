'use strict';
const http = require('http');
const url = require('url');

function request(options) {
  return new Promise((resolve, reject) => {
    let uri = url.parse(options.uri);
    let client = http.request({
      method: options.method || 'GET',
      path: uri.path,
      host: uri.hostname,
      port: uri.port * 1 || 80
    }, (res) => {

      let buffer = [];

      res.on('data', (chunk) => {
        buffer.push(chunk);
      });

      res.on('end', () => {
        resolve(buffer.join(''));
      });
    });

    client.on('error', (e) => {
      reject(e);
    });
  });
}

module.exports = request;