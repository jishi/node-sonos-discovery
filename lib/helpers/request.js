'use strict';
const http = require('http');
const https = require('https');
const url = require('url');

function request(options) {
  // Store a stack trace in case we get an error status code
  const stackHolder = {};
  Error.captureStackTrace(stackHolder, request);

  return new Promise((resolve, reject) => {
    let uri = url.parse(options.uri);
    let httpModule = http;
    let defaultPort = 80;
    if (uri.protocol === 'https:') {
      httpModule = https;
      defaultPort = 443;
    }

    let requestOptions = {
      method: options.method || 'GET',
      path: uri.path,
      host: uri.hostname,
      port: uri.port * 1 || defaultPort
    };

    if (options.headers) {
      requestOptions.headers = options.headers;
    }

    let client = httpModule.request(requestOptions, (res) => {
      if (res.statusCode < 200 || res.statusCode > 299) {
        let error = new RequestError(requestOptions, res);
        error.stack = stackHolder.stack;
        return reject(error);
      }

      if (options.type && options.type.toLowerCase() === 'stream') {
        resolve(res);
        return;
      }

      let buffer = [];

      res.on('data', (chunk) => {
        buffer.push(chunk);
      });

      res.on('end', () => {
        const body = buffer.join('');
        if (options.type && options.type.toLowerCase() === 'json') {
          resolve(JSON.parse(body));
          return;
        }

        resolve(body);
      });
    });

    client.on('error', (e) => {
      reject(e);
    });

    client.on('timeout', () => {
      const error = new Error('http request timed out');
      error.stack = stackHolder.stack;
      reject(error);
    });

    if (options.timeout) {
      client.setTimeout(options.timeout);
    }

    if (options.body) {
      client.write(options.body);
    }

    client.end();
  });
}

class RequestError extends Error {
  constructor(options, res) {
    const msg = `Got status ${res.statusCode} when invoking ${options.path}`;
    super(msg);
    Object.assign(this, options);
    this.statusCode = res.statusCode;
  }
}

module.exports = request;
