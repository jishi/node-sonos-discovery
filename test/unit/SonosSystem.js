'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));
require('sinon-as-promised');

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
    request.onCall(0).resolves({
      socket: {
        address: function () {
          return {
            address: '127.0.0.2'
          };
        }
      }
    });

    listener = {
      on: sinon.spy(),
      endpoint: sinon.stub().returns('http://127.0.0.2:3500/')
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

  it('Finds local endpoint', (done) => {

    ssdp.on.yield({
      ip: '127.0.0.1',
      location: 'http://127.0.0.1:1400/xml',
      household: 'Sonos_1234567890abcdef'
    });

    expect(request).calledOnce;
    expect(request.firstCall.args[0].method).equals('HEAD');
    expect(request.firstCall.args[0].uri).equals('http://127.0.0.1:1400/xml');

    setImmediate(() => {
      expect(sonos.localEndpoint).equals('127.0.0.2');
      done();
    });
  });

  it('Starts a NotificationListener', (done) => {
    ssdp.on.yield({
      ip: '127.0.0.1',
      location: 'http://127.0.0.1:1400/xml',
      household: 'Sonos_1234567890abcdef'
    });

    setImmediate(() => {
      expect(NotificationListener).calledWithNew;
      done();
    });
  });

  it('Subscribes to player when ssdp emits', (done) => {
    ssdp.on.yield({
      ip: '127.0.0.1',
      location: 'http://127.0.0.1:1400/xml',
      household: 'Sonos_1234567890abcdef'
    });

    setImmediate(() => {
      expect(request).calledTwice;
      expect(request.secondCall.args[0].method).equals('SUBSCRIBE');
      expect(request.secondCall.args[0].uri).equals('http://127.0.0.1:1400/ZoneGroupTopology/Event');
      expect(request.secondCall.args[0].headers).eql({
        NT: 'upnp:event',
        CALLBACK: '<http://127.0.0.2:3500/>',
        TIMEOUT: 'Second-600'
      });
      done();
    });
  });

  it('Populate zones on topology notification', (done) => {
    ssdp.on.yield({
      ip: '127.0.0.1',
      location: 'http://127.0.0.1:1400/xml',
      household: 'Sonos_1234567890abcdef'
    });
    let topology = require('../data/topology.json');
    setImmediate(() => {
      listener.on.withArgs('topology').yield('', topology);
      expect(sonos.zones).not.empty;
      sonos.zones.forEach((zone) => {
        expect(zone.members).not.empty;
      });
      done();
    });
  });

  it('Do not contain Invisible units', (done) => {
    ssdp.on.yield({
      ip: '127.0.0.1',
      location: 'http://127.0.0.1:1400/xml',
      household: 'Sonos_1234567890abcdef'
    });
    let topology = require('../data/topology.json');
    setImmediate(() => {
      listener.on.withArgs('topology').yield('', topology);
      sonos.zones.forEach((zone) => {
        return zone.members.forEach((member) => {
          expect(member.roomName).not.equal('BOOST');
        });
      });
      done();
    });
  });
});
