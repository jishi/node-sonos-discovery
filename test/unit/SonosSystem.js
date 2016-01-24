'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));

describe('SonosSystem', () => {
  let SonosSystem;
  let ssdp;
  let sonos;
  let request;
  let NotificationListener;
  let listener;

  beforeEach(() => {
    ssdp = {
      start: sinon.spy(),
      stop: sinon.spy(),
      on: sinon.spy()
    };

    request = sinon.stub();

    listener = {
      on: sinon.spy()
    };

    NotificationListener = sinon.stub().returns(listener);

    SonosSystem = proxyquire('../../lib/SonosSystem', {
      './sonos-ssdp': ssdp,
      './helpers/request': request,
      './NotificationListener': NotificationListener
    });

    sonos = new SonosSystem();
  });

  it('Starts scanning', () => {
    expect(ssdp.start).calledOnce;
  });

  it('Subscribes to player when ssdp emits', () => {
    ssdp.on.yield({
      ip: '127.0.0.1',
      location: 'http://127.0.0.1:1400/xml',
      household: 'Sonos_1234567890abcdef'
    });
    expect(request).calledOnce;
    expect(request.firstCall.args[0].method).equals('SUBSCRIBE');
    expect(request.firstCall.args[0].uri).equals('http://127.0.0.1:1400/ZoneGroupTopology/Event');
    expect(request.firstCall.args[0].headers).eql({
      NT: 'upnp:event',
      CALLBACK: '<http://127.0.0.1:3500/>',
      TIMEOUT: 'Second-600'
    });
  });

  it('Starts a NotificationListener', () => {
    expect(NotificationListener).calledWithNew;
  });
});
