'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const Readable = require('stream').Readable;
require('chai').use(require('sinon-chai'));

describe('request', () => {
  let http;
  let https;
  let request;
  let client;
  let mockedStream;

  beforeEach(() => {
    client = {
      on: sinon.spy(),
      end: sinon.spy(),
      write: sinon.spy(),
      setTimeout: sinon.spy()
    };

    http = {
      request: sinon.stub().returns(client)
    };

    https = {
      request: sinon.stub().returns(client)
    };

    request = proxyquire('../../../lib/helpers/request', {
      http,
      https
    });

    mockedStream = new Readable();

    // Avoid not implemented warning
    mockedStream._read = function noop() {
    };
  });

  it('Transfers common arguments to http.request', () => {
    request({
      uri: 'http://127.0.0.1:1400/path',
      method: 'SUBSCRIBE',
      headers: {
        'Content-Type': 'text/xml'
      }
    });

    expect(http.request).calledOnce;
    expect(http.request.firstCall.args[0]).eql({
      method: 'SUBSCRIBE',
      path: '/path',
      host: '127.0.0.1',
      port: 1400,
      headers: {
        'Content-Type': 'text/xml'
      }
    });
  });

  it('Uses https if called with https url', () => {
    request({
      uri: 'https://127.0.0.1:1400/path',
      method: 'SUBSCRIBE',
      headers: {
        'Content-Type': 'text/xml'
      }
    });

    expect(https.request).calledOnce;
    expect(https.request.firstCall.args[0]).eql({
      method: 'SUBSCRIBE',
      path: '/path',
      host: '127.0.0.1',
      port: 1400,
      headers: {
        'Content-Type': 'text/xml'
      }
    });
  });

  it('Sets timeout on client object', () => {
    request({
      uri: 'http://127.0.0.1:1400/path',
      timeout: 10
    });

    expect(client.setTimeout).calledOnce;
    expect(client.setTimeout.firstCall.args[0]).equal(10);

  });

  it('does not call setTimeout if no timeout', () => {
    request({
      uri: 'http://127.0.0.1:1400/path'
    });

    expect(client.setTimeout).not.called;

  });

  it('Defaults to GET and port 80', () => {
    request({
      uri: 'http://127.0.0.1/path'
    });

    expect(http.request).calledOnce;
    expect(http.request.firstCall.args[0]).eql({
      method: 'GET',
      path: '/path',
      host: '127.0.0.1',
      port: 80
    });
  });

  it('Invokes end() to trigger the request', () => {
    request({
      uri: 'http://127.0.0.1/path'
    });

    expect(client.end).calledOnce;
  });

  it('Resolves promise if successful request', () => {
    let body = 'abcdef';
    let promise = request({
      uri: 'http://127.0.0.1/path'
    }).then((content) => {
      expect(content).equal(body);
    });

    http.request.yield(mockedStream);

    mockedStream.push(body);
    mockedStream.push(null);

    return promise;
  });

  it('Resolves promise with deserialized JSON if type=json', () => {
    let body = '{ "x": 1, "y": "z" }';
    let promise = request({
      uri: 'http://127.0.0.1/path',
      type: 'json'
    }).then((content) => {
      expect(content).eql({ x: 1, y: 'z' });
    });

    http.request.yield(mockedStream);

    mockedStream.push(body);
    mockedStream.push(null);

    return promise;
  });

  it('Rejects if error occur', () => {
    let promise = request({
      uri: 'http://127.0.0.1/path'
    }).then(() => {
      expect().fail();
    }).catch((e) => {
      expect(e).instanceOf(Error);
    });

    client.on.withArgs('error').yield(new Error());

    return promise;
  });

  it('Rejects if response code is other than 2xx', () => {
    let promise = request({
      uri: 'http://127.0.0.1/path'
    }).then(() => {
      expect().fail();
    }).catch((e) => {
      expect(e).instanceOf(Error);
      expect(e.statusCode).equals(500);
    });

    mockedStream.statusCode = 500;
    mockedStream.statusMessage = 'This is an error';
    http.request.yield(mockedStream);
    mockedStream.push(null);

    return promise;
  });

  it('Rejects if timeout occur', () => {
    let promise = request({
      uri: 'http://127.0.0.1/path'
    }).then(() => {
      expect().fail();
    }).catch((e) => {
      expect(e).instanceOf(Error);
    });

    client.on.withArgs('timeout').yield(new Error());

    return promise;
  });

  it('Returns response object if stream=true', () => {
    let promise = request({
      uri: 'http://127.0.0.1/path',
      type: 'stream'
    }).then((res) => {
      expect(res).equal(mockedStream);
    });

    mockedStream.statusCode = 200;
    mockedStream.statusMessage = 'OK';

    http.request.yield(mockedStream);
    mockedStream.push(null);

    return promise;
  });

  it('Writes body if exists', () => {
    request({
      uri: 'http://127.0.0.1/path',
      body: 'FOOBAR'
    });

    expect(client.write).calledOnce;
    expect(client.write.firstCall.args[0]).equal('FOOBAR');
  });

});
