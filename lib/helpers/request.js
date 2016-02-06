'use strict';
const http = require('http');
const url = require('url');

function request(options) {
  return new Promise((resolve, reject) => {
    let uri = url.parse(options.uri);

    let requestOptions = {
      method: options.method || 'GET',
      path: uri.path,
      host: uri.hostname,
      port: uri.port * 1 || 80
    };

    if (options.headers) {
      requestOptions.headers = options.headers;
    }

    let client = http.request(requestOptions, (res) => {
      if (res.statusCode < 200 || res.statusCode > 299) {
        let error = new Error(res.statusMessage);
        error.statusCode = res.statusCode;
        return reject(error);
      }

      if (options.stream) {
        resolve(res);
        return;
      }

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

    if (options.body) {
      client.write(options.body);
    }

    client.end();
  });
}

module.exports = request;
