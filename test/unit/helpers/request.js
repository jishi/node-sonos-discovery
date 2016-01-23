'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const Readable = require('stream').Readable;
require('chai').use(require('sinon-chai'));

describe.only('request', () => {
  let http;
  let request;
  let client;
  let mockedStream;

  beforeEach(() => {
    client = {
      on: sinon.spy()
    };
    http = {
      request: sinon.stub().returns(client)
    };
    request = proxyquire('../../../lib/helpers/request', {
      http
    });

    mockedStream = new Readable();

    // Avoid not implemented warning
    mockedStream._read = function noop() {
    };
  });

  it('Transfers common arguments to http.request', () => {
    let promise = request({
      uri: 'http://127.0.0.1:1400/path',
      method: 'SUBSCRIBE'
    }).then(() => {
      expect(http.request).calledOnce;
      expect(http.request.firstCall.args[0]).eql({
        method: 'SUBSCRIBE',
        path: '/path',
        host: '127.0.0.1',
        port: 1400
      });
    });

    http.request.yield(mockedStream);
    mockedStream.push(null);

    return promise;
  });

  it('Defaults to GET and port 80', () => {
    let promise = request({
      uri: 'http://127.0.0.1/path'
    }).then(() => {
      expect(http.request).calledOnce;
      expect(http.request.firstCall.args[0]).eql({
        method: 'GET',
        path: '/path',
        host: '127.0.0.1',
        port: 80
      });
    });

    http.request.yield(mockedStream);
    mockedStream.push(null);

    return promise;
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

  it('Rejects if error occur', () => {
    let promise = request({
      uri: 'http://127.0.0.1/path'
    }).then(() => {
      expect().fail();
      })
      .catch((e) => {
        expect(e).instanceOf(Error);
      });

    client.on.withArgs('error').yield(new Error());

    return promise;
  });
});
