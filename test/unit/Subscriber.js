'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));
require('sinon-as-promised');

describe('Subscriber', () => {
  let request;
  let Subscriber;

  beforeEach(() => {

    request = sinon.stub();
    Subscriber = proxyquire('../../lib/Subscriber', {
      './helpers/request': request
    });
  });

  it('Sends a subscription with the correct parameters', () => {
    request.resolves({});
    new Subscriber('http://192.168.1.151:1400/test/path', 'http://127.0.0.2/', 600);
    expect(request).calledOnce;
    expect(request.firstCall.args[0]).eql({
      uri: 'http://192.168.1.151:1400/test/path',
      method: 'SUBSCRIBE',
      headers: {
        CALLBACK: '<http://127.0.0.2/>',
        NT: 'upnp:event',
        TIMEOUT: 'Second-600'
      }
    });
  });

  it('Resubscribes if failure', function (done) {
    request.rejects('Rejecting subscribe attempt. This is a mocked error');
    let subscriber = new Subscriber('http://192.168.1.151:1400/test/path', 'http://127.0.0.2/', 600, 100);

    setTimeout(() => {

      expect(request).calledTwice;
      expect(request.secondCall.args[0]).eql({
        uri: 'http://192.168.1.151:1400/test/path',
        method: 'SUBSCRIBE',
        headers: {
          CALLBACK: '<http://127.0.0.2/>',
          NT: 'upnp:event',
          TIMEOUT: 'Second-600'
        }
      });
      subscriber.dispose();
      done();
    }, 150);
  });

  it('Resubscribes right before timeout', (done) => {
    request.resolves({
      SID: '1234567890'
    });
    let subscriber = new Subscriber('http://192.168.1.151:1400/test/path', 'http://127.0.0.2/', 0.1);

    setTimeout(() => {
      expect(request).calledTwice;
      expect(request.secondCall.args[0]).eql({
        uri: 'http://192.168.1.151:1400/test/path',
        method: 'SUBSCRIBE',
        headers: {
          CALLBACK: '<http://127.0.0.2/>',
          NT: 'upnp:event',
          TIMEOUT: 'Second-0.1',
          SID: '1234567890'
        }
      });
      subscriber.dispose();
      done();
    }, 90);
  });

  it('Stops renewing if dispose is called', (done) => {
    request.resolves({
      SID: '1234567890'
    });
    let subscriber = new Subscriber('http://192.168.1.151:1400/test/path', 'http://127.0.0.2/', 0.1);

    setImmediate(() => {
      subscriber.dispose();
    });

    setTimeout(() => {
      expect(request).calledOnce;
      done();
    }, 90);
  });
});
