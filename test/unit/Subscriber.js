'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));
require('sinon-as-promised');

describe('Subscriber', () => {
  let request;
  let Subscriber;
  let successfulRequest;

  beforeEach(() => {
    successfulRequest = { headers: { sid: 1234567 } };
    request = sinon.stub();
    Subscriber = proxyquire('../../lib/Subscriber', {
      './helpers/request': request,
    });
  });

  describe('Sucessful subscription', () => {
    let subscriber;

    beforeEach(() => {
      request.resolves(successfulRequest);
      subscriber = new Subscriber('http://192.168.1.151:1400/test/path', 'http://127.0.0.2/', 600);
    });

    afterEach(() => {
      subscriber.dispose();
    });

    it('Sends a subscription with the correct parameters', () => {
      expect(request).calledOnce;
      expect(request.firstCall.args[0]).eql({
        uri: 'http://192.168.1.151:1400/test/path',
        method: 'SUBSCRIBE',
        headers: {
          CALLBACK: '<http://127.0.0.2/>',
          NT: 'upnp:event',
          TIMEOUT: 'Second-600',
        },
        type: 'stream',
      });
    });
  });

  it('Resubscribes if failure', function(done) {
    request.rejects('Rejecting subscribe attempt. This is a mocked error');
    request.onCall(2).resolves(successfulRequest);
    let subscriber = new Subscriber('http://192.168.1.151:1400/test/path', 'http://127.0.0.2/', 600, 100);

    setTimeout(() => {

      expect(request).calledTwice;
      expect(request.secondCall.args[0]).eql({
        uri: 'http://192.168.1.151:1400/test/path',
        method: 'SUBSCRIBE',
        type: 'stream',
        headers: {
          CALLBACK: '<http://127.0.0.2/>',
          NT: 'upnp:event',
          TIMEOUT: 'Second-600',
        },
      });
      subscriber.dispose();
      done();
    }, 150);
  });

  it('Resubscribes without sid if resubscribe fails', function(done) {
    request.onCall(0).resolves({
      headers: {
        sid: '12345678',
      },
    });
    request.rejects('Rejecting subscribe attempt. This is a mocked error');
    let subscriber = new Subscriber('http://192.168.1.151:1400/test/path', 'http://127.0.0.2/', 0.1, 100);

    setTimeout(() => {

      expect(request).callCount(3);
      expect(request.secondCall.args[0]).eql({
        uri: 'http://192.168.1.151:1400/test/path',
        method: 'SUBSCRIBE',
        type: 'stream',
        headers: {
          TIMEOUT: 'Second-0.1',
          SID: '12345678',
        },
      });

      expect(request.thirdCall.args[0]).eql({
        uri: 'http://192.168.1.151:1400/test/path',
        method: 'SUBSCRIBE',
        type: 'stream',
        headers: {
          CALLBACK: '<http://127.0.0.2/>',
          NT: 'upnp:event',
          TIMEOUT: 'Second-0.1',
        },
      });
      subscriber.dispose();
      done();
    }, 250);
  });

  it('Resubscribes right before timeout', (done) => {
    request.resolves({
      headers: {
        sid: '1234567890',
      },
    });
    let subscriber = new Subscriber('http://192.168.1.151:1400/test/path', 'http://127.0.0.2/', 0.1);

    setTimeout(() => {
      expect(request).calledTwice;
      expect(request.secondCall.args[0]).eql({
        uri: 'http://192.168.1.151:1400/test/path',
        method: 'SUBSCRIBE',
        type: 'stream',
        headers: {
          TIMEOUT: 'Second-0.1',
          SID: '1234567890',
        },
      });
      subscriber.dispose();
      done();
    }, 90);
  });

  it('Sends unsubscribe if dispose is called', (done) => {
    request.resolves({
      headers: {
        sid: '1234567890',
      },
    });
    let subscriber = new Subscriber('http://192.168.1.151:1400/test/path', 'http://127.0.0.2/', 0.1);

    setImmediate(() => {
      subscriber.dispose();
      expect(request).calledTwice;
      expect(request.secondCall.args[0]).eql({
        method: 'UNSUBSCRIBE',
        type: 'stream',
        uri: 'http://192.168.1.151:1400/test/path',
        headers: {
          SID: '1234567890',
        },
      });
      done();
    });
  });

  it('Stops renewing if dispose is called', (done) => {
    request.resolves({
      headers: {
        sid: '1234567890',
      },
    });
    let subscriber = new Subscriber('http://192.168.1.151:1400/test/path', 'http://127.0.0.2/', 0.1);

    setImmediate(() => {
      subscriber.dispose();
    });

    setTimeout(() => {
      expect(request).calledTwice;
      done();
    }, 90);
  });

  describe('When request fails 5 consecutive times', () => {
    let errorCallback = sinon.spy();
    let subscriber;

    beforeEach(() => {
      request.rejects();
    });

    beforeEach((done) => {
      subscriber = new Subscriber('http://192.168.1.151:1400/test/path', 'http://127.0.0.2/', 0.1, 100);
      subscriber.once('dead', errorCallback);
      setTimeout(done, 500);
    });

    afterEach(() => {
      subscriber.dispose();
    });

    it('Emits error if rejected too many times', () => {
      expect(errorCallback).calledOnce;
    });

  });
})
;
