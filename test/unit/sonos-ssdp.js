'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));

describe('Sonos-SSDP', function () {
  let ssdp;
  let dgram;
  let socket;
  let os;

  beforeEach(() => {
    socket = {
      bind: sinon.spy(),
      setMulticastTTL: sinon.spy(),
      setBroadcast: sinon.spy(),
      close: sinon.spy(),
      send: sinon.spy(),
      on: sinon.spy()
    };
    dgram = {
      createSocket: sinon.stub().returns(socket)
    };
    os = {
      networkInterfaces: sinon.stub().returns({
        eth0: [{
          internal: false,
          family: 'IPv4',
          address: '10.0.0.1'
        }]
      })
    };

    ssdp = proxyquire('../../lib/sonos-ssdp', {
      dgram,
      os
    });
  });

  it('Creates listening UDP socket', () => {
    ssdp.start();

    expect(dgram.createSocket).calledOnce;
    expect(socket.bind).calledOnce;
    expect(socket.bind.firstCall.args[0]).equals(1905);
    expect(socket.bind.firstCall.args[1]).equals('0.0.0.0');

    // trigger the callback on bind
    socket.bind.yield();
    expect(socket.setMulticastTTL).calledWith(2);
    expect(socket.setBroadcast).calledWith(true);
  });

  it('Sends M-SEARCH data once started', () => {
    ssdp.start();

    // Trigger the listening event callback
    socket.bind.yield();
    expect(socket.send).calledOnce;
    expect(socket.send.firstCall.args[0].toString()).contains('M-SEARCH');
    expect(socket.send.firstCall.args[3]).equals(1900);
    expect(socket.send.firstCall.args[4]).equals('239.255.255.250');
  });

  it('Sends M-SEARCH periodically if no response', (done) => {
    ssdp.start();
    socket.bind.yield();

    setTimeout(() => {
      expect(socket.send).calledTwice;
      expect(socket.send.secondCall.args[4]).equals('255.255.255.255');
      done();
    }, 1500);
  });

  it('Switches interface if more than 5 seconds elapse', function (done) {
    this.timeout(10000);
    ssdp.start();
    socket.bind.yield();
    setTimeout(() => {
      expect(socket.bind).calledTwice;
      expect(socket.bind.secondCall.args[1]).equals('10.0.0.1');
      done();
    }, 5500);
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
