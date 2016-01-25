'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));

describe('Sonos-SSDP', function () {
  let ssdp;
  let dgram;
  let socket;

  beforeEach(() => {
    socket = {
      bind: sinon.spy(),
      setMulticastTTL: sinon.spy(),
      close: sinon.spy(),
      send: sinon.spy()
    };
    dgram = {
      createSocket: sinon.stub().returns(socket)
    };
    ssdp = proxyquire('../../lib/sonos-ssdp', {
      dgram
    });
  });

  it('Creates listening UDP socket', () => {
    ssdp.start();

    expect(dgram.createSocket).calledOnce;
    expect(socket.bind).calledOnce;
    expect(socket.bind.firstCall.args[0]).equals(1905);

    // trigger the callback on bind
    socket.bind.yield();
    expect(socket.setMulticastTTL).calledWith(2);
  });

  it('Sends M-SEARCH data once started', () => {
    ssdp.start();

    // Trigger the listening event callback
    socket.bind.yield();
    expect(socket.send).calledOnce;
    expect(socket.send.firstCall.args[0]).contains('M-SEARCH');
    expect(socket.send.firstCall.args[3]).equals(1900);
    expect(socket.send.firstCall.args[4]).equals('239.255.255.250');
  });

  it('Sends M-SEARCH periodically if no response', (done) => {
    ssdp.start();
    socket.bind.yield();

    setTimeout(() => {
      expect(socket.send).calledTwice;
      done();
    }, 1500);
  });

  it('Emits upon successful resolve', () => {
    ssdp.start();

    let buffer = [
      'LOCATION: http://10.0.0.1:1400/device_descriptor.xml',
      'X-RINCON-HOUSEHOLD: Sonos_123456789abcdef',
      'ST: urn:schemas-upnp-org:device:ZonePlayer:1'
    ].join('\r\n');

    let cb = sinon.spy();

    ssdp.on('found', cb);

    dgram.createSocket.yield(new Buffer(buffer), {
      address: '127.0.0.1'
    });

    expect(cb).calledOnce;
    expect(cb.firstCall.args[0]).eql({
      household: 'Sonos_123456789abcdef',
      ip: '127.0.0.1',
      location: 'http://10.0.0.1:1400/device_descriptor.xml'
    });
  });

  it('Closes socket if stop is invoked', () => {
    ssdp.start();
    ssdp.stop();

    expect(socket.close).calledOnce;
  });
});
