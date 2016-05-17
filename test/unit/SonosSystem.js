'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();
require('chai').use(require('sinon-chai'));
require('sinon-as-promised');

describe('SonosSystem', () => {
  let SonosSystem;
  let ssdp;
  let sonos;
  let request;
  let NotificationListener;
  let listener;
  let Subscriber;
  let Player;
  let Sub;

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

    Subscriber = sinon.spy();

    Player = sinon.spy(proxyquire('../../lib/models/Player', {
      '../Subscriber': Subscriber
    }));

    Sub = sinon.spy(proxyquire('../../lib/models/Sub', {
    '../Subscriber': Subscriber
  }));

    SonosSystem = proxyquire('../../lib/SonosSystem', {
      './sonos-ssdp': ssdp,
      './helpers/request': request,
      './NotificationListener': NotificationListener,
      './Subscriber': Subscriber,
      './models/Player': Player,
      './models/Sub': Sub
    });

    sonos = new SonosSystem();
  });

  it('Loaded prototypes', () => {
    expect(SonosSystem).respondTo('applyPreset');
    expect(SonosSystem).respondTo('getFavorites');
    expect(SonosSystem).respondTo('getPlaylists');
    expect(SonosSystem).respondTo('refreshShareIndex');
  });

  it('Starts scanning', () => {
    expect(ssdp.start).calledOnce;
  });

  describe('when topology is done', () => {

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
      expect(request.firstCall.args[0].method).equals('GET');
      expect(request.firstCall.args[0].uri).equals('http://127.0.0.1:1400/xml');
      expect(sonos.localEndpoint).equals('127.0.0.2');
    });

    it('Starts a NotificationListener', () => {
      expect(NotificationListener).calledWithNew;
    });

    it('Subscribes to player when ssdp emits', () => {
      expect(Subscriber).calledWithNew;
      expect(Subscriber.firstCall.args).eql([
        'http://127.0.0.1:1400/ZoneGroupTopology/Event',
        'http://127.0.0.2:3500/'
      ]);

    });

    describe('topology', () => {

      beforeEach(() => {
        let topology = require('../data/topology.json');
        listener.on.withArgs('topology').yield('', topology);
      });

      it('Populate zones on topology notification', () => {
        expect(sonos.zones).not.empty;
        sonos.zones.forEach((zone) => {
          expect(zone.members).not.empty;
          zone.members.forEach((member) => {
            expect(member).instanceOf(Player);
          });
        });
      });

      it('Populate players on topology notification', () => {
        expect(sonos.players).not.empty;
        let player = sonos.getPlayer('TV Room');
        expect(player.roomName).equal('TV Room');
      });

      it('Do not contain Invisible units', () => {
        sonos.zones.forEach((zone) => {
          return zone.members.forEach((member) => {
            expect(member.roomName).not.equal('BOOST');
          });
        });
      });

      it('Attaches SUB to primary player', () => {
        sonos.zones.forEach((zone) => {
          let tvRoom = zone.members.find((member) => member.roomName === 'TV Room');
          expect(tvRoom).not.undefined;
          expect(tvRoom.sub).not.undefined;
          expect(tvRoom.sub.roomName).equal('TV Room (SUB)');
        });
      });

      it('Only creates player and sub once', () => {
        let topology = require('../data/topology.json');
        listener.on.withArgs('topology').yield('', topology);
        expect(Player).callCount(5);
        expect(Sub).calledOnce;
      });

      it('Links coordinator property on all players', () => {
        sonos.zones.forEach((zone) => {
          let coordinatorUuid = zone.uuid;
          zone.members.forEach((player) => {
            expect(player.coordinator).instanceOf(Player);
            expect(player.coordinator.uuid).equal(coordinatorUuid);
          });
        });
      });

      it('Returns player with getPlayer', () => {
        let player = sonos.getPlayer('Office');
        expect(player).instanceOf(Player);
        expect(player.roomName).equals('Office');
      });

      it('Returns player with getPlayer case insensitive', () => {
        let player = sonos.getPlayer('officE');
        expect(player).instanceOf(Player);
        expect(player.roomName).equals('Office');
      });

      it('Returns player with getPlayerByUUD', () => {
        let player = sonos.getPlayerByUUID('RINCON_20000000000001400');
        expect(player).instanceOf(Player);
        expect(player.roomName).equals('TV Room');
      });
    });
  });
});
