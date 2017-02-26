'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();
const fs = require('fs');
const soap = require('../../lib/helpers/soap');
const UnknownServiceError = require('../../lib/errors/unknown-service');
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
  let subscriber;
  let Player;

  beforeEach(() => {
    ssdp = {
      start: sinon.spy(),
      stop: sinon.spy(),
      once: sinon.spy()
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

    subscriber = {
      once: sinon.spy(),
      dispose: sinon.spy()
    };
    Subscriber = sinon.stub().returns(subscriber);

    Player = sinon.spy(proxyquire('../../lib/models/Player', {
      '../Subscriber': Subscriber
    }));

    sinon.stub(soap, 'invoke').resolves(fs.createReadStream(`${__dirname}/../data/listavailableservices.xml`));

    SonosSystem = proxyquire('../../lib/SonosSystem', {
      './sonos-ssdp': ssdp,
      './helpers/request': request,
      './NotificationListener': NotificationListener,
      './Subscriber': Subscriber,
      './models/Player': Player
    });
  });

  afterEach(() => {
    soap.invoke.restore();
  });

  describe('When no settings are provided', () => {
    beforeEach(() => {
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
        ssdp.once.yield({
          ip: '127.0.0.1',
          location: 'http://127.0.0.1:1400/xml',
          household: 'Sonos_1234567890abcdef'
        });

        setImmediate(() => {
          done();
        });
      });

      beforeEach(() => {
        listener.on.withArgs('listening').yield();
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

      describe('If Subscriber errors out', () => {

        beforeEach(() => {
          subscriber.once.withArgs('dead').yield('Mocked error');
        });

        it('Should restart discovery', () => {
          expect(subscriber.dispose).calledOnce;
          expect(ssdp.start).calledTwice;
        });

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

          expect(sonos.zones[0].id).equal('RINCON_00000000000301400:66');
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

        it('Flags primary player if SUB is connected', () => {
          const tvRoom = sonos.getPlayer('TV Room');
          expect(tvRoom).not.undefined;
          expect(tvRoom.hasSub).to.be.true;
        });

        it('should flag stereo pair if SUB is connected', () => {
          const livingRoom = sonos.getPlayer('Living Room');
          expect(livingRoom).not.undefined;
          expect(livingRoom.hasSub).to.be.true;
        });

        it('should flag PLAYBAR if SUB is connected', () => {
          const playbar = sonos.getPlayer('Home Theatre');
          expect(playbar).not.undefined;
          expect(playbar.hasSub).to.be.true;
        });

        it('should not flag player if SUB is not connected', () => {
          const kitchen = sonos.getPlayer('Kitchen');
          expect(kitchen).not.undefined;
          expect(kitchen.hasSub).to.be.false;
        });

        it('Only creates player once', () => {
          let topology = require('../data/topology.json');
          listener.on.withArgs('topology').yield('', topology);
          expect(Player).callCount(7);
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

        describe('After initialized', () => {
          beforeEach((done) => {
            sonos.on('initialized', done);
          });

          it('Called ListAvailableServices with valid player', () => {
            expect(soap.invoke).calledOnce;
            expect(soap.invoke.firstCall.args[0]).equal('http://192.168.1.151:1400/MusicServices/Control');
          });

          it('Can lookup SID from service name', () => {
            expect(sonos.getServiceId('Spotify')).to.equal(9);
            expect(sonos.getServiceId('Apple Music')).to.equal(204);
          });

          it('Can lookup type from service name', () => {
            expect(sonos.getServiceType('Spotify')).to.equal(2311);
            expect(sonos.getServiceType('Apple Music')).to.equal(52231);
          });

          it('Throws error on unknown service', () => {
            expect(sonos.getServiceId.bind(sonos, 'UNKNOWN SERVICE')).to.throw(UnknownServiceError);
            expect(sonos.getServiceType.bind(sonos, 'UNKNOWN SERVICE')).to.throw(UnknownServiceError);
          });

          describe('When a new topology with removed players emits', () => {

            beforeEach(() => {
              const topology = require('../data/topology_without_office.json');
              listener.on.withArgs('topology').yield('', topology);
            });

            it('Should no longer have Office left', () => {
              const player = sonos.getPlayer('Office');
              expect(player).to.be.undefined;
            });
          });
        });
      });
    });
  });

  describe('When we have household setting', () => {

    beforeEach(() => {
      request.resolves({
        socket: {
          address: function () {
            return {
              address: '127.0.0.2'
            };
          }
        }
      });
    });

    beforeEach(() => {
      sonos = new SonosSystem({
        household: 'Sonos_asdg12335346345'
      });
    });

    beforeEach((done) => {
      ssdp.once.yield({
        ip: '127.0.0.1',
        location: 'http://127.0.0.1:1400/xml',
        household: 'Sonos_1234567890abcdef'
      });

      ssdp.once.yield({
        ip: '127.0.0.1',
        location: 'http://127.0.0.3:1400/xml',
        household: 'Sonos_asdg12335346345'
      });

      setImmediate(() => {
        done();
      });
    });

    it('Finds the system matching the configured household', () => {
      expect(request).called;
      expect(request.firstCall.args[0].method).equals('GET');
      expect(request.firstCall.args[0].uri).equals('http://127.0.0.3:1400/xml');
    });
  });

});
