'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));
require('sinon-as-promised');
const Player = require('../../lib/models/Player');

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

  context('topology done', () => {

    beforeEach((done) => {
      ssdp.on.yield({
        ip: '127.0.0.1',
        location: 'http://127.0.0.1:1400/xml',
        household: 'Sonos_1234567890abcdef'
      });

      setImmediate(() => {
        done();
      });
    });

    it('Finds local endpoint', () => {
      expect(request).called;
      expect(request.firstCall.args[0].method).equals('HEAD');
      expect(request.firstCall.args[0].uri).equals('http://127.0.0.1:1400/xml');
      expect(sonos.localEndpoint).equals('127.0.0.2');
    });

    it('Starts a NotificationListener', () => {
      expect(NotificationListener).calledWithNew;
    });

    it('Subscribes to player when ssdp emits', () => {

      expect(request).calledTwice;
      expect(request.secondCall.args[0].method).equals('SUBSCRIBE');
      expect(request.secondCall.args[0].uri).equals('http://127.0.0.1:1400/ZoneGroupTopology/Event');
      expect(request.secondCall.args[0].headers).eql({
        NT: 'upnp:event',
        CALLBACK: '<http://127.0.0.2:3500/>',
        TIMEOUT: 'Second-600'
      });

    });

    it('Populate zones on topology notification', () => {
      let topology = require('../data/topology.json');
      listener.on.withArgs('topology').yield('', topology);
      expect(sonos.zones).not.empty;
      sonos.zones.forEach((zone) => {
        expect(zone.members).not.empty;
        zone.members.forEach((member) => {
          expect(member).instanceOf(Player);
        })
      });
    });

    it('Do not contain Invisible units', () => {
      let topology = require('../data/topology.json');
      listener.on.withArgs('topology').yield('', topology);
      sonos.zones.forEach((zone) => {
        return zone.members.forEach((member) => {
          expect(member.roomName).not.equal('BOOST');
        });
      });
    });

    it('Attaches SUB to primary player', () => {
      let topology = require('../data/topology.json');
      listener.on.withArgs('topology').yield('', topology);
      sonos.zones.forEach((zone) => {
        let tvRoom = zone.members.find((member) => member.roomName === 'TV Room');
        expect(tvRoom).not.undefined;
        expect(tvRoom.sub).not.undefined;
        expect(tvRoom.sub.roomName).equal('TV Room (SUB)');
      });
    });
  });
});
