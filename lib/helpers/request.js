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
      const buffer = [];

      if (res.statusCode < 200 || res.statusCode > 299) {
        let error = new RequestFailedError(requestOptions, res);
        error.setStack(stackHolder.stack);
        res.on('data', (chunk) => {
          buffer.push(chunk);
        });

        res.on('end', () => {
          error.body = buffer.join('');
          reject(error);
        });
        return;
      }

      if (options.type && options.type.toLowerCase() === 'stream') {
        resolve(res);
        return;
      }

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
      const error = new RequestError('http request timed out');
      error.setStack(stackHolder.stack);
      reject(error);
    });

    if (options.timeout) {
      client.setTimeout(options.timeout || 5000);
    }

    if (options.body) {
      client.write(options.body);
    }

    client.end();
  });
}

class RequestError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'RequestError';
  }

  setStack(stack) {
    const newStack = [`Error: ${this.message}`];
    this.stack = newStack.concat(stack.split('\n').slice(1)).join('\n');
  }
}

class RequestFailedError extends RequestError {
  constructor(options, res) {
    const msg = `Got status ${res.statusCode} when invoking ${options.path}`;
    super(msg);
    Object.assign(this, options);
    this.name = 'RequestFailedError';
    this.statusCode = res.statusCode;
    this.statusMessage = res.statusMessage;
  }
}

module.exports = request;
