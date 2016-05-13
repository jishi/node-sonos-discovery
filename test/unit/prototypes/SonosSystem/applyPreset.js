'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
require('chai').use(require('sinon-chai'));

describe('SonosSystem.applyPreset', () => {
  const applyPreset = require('../../../../lib/prototypes/SonosSystem/applyPreset.js');

  describe('When applying a preset', () => {
    let system;
    let player;
    let preset;
    let superfluousPlayer;

    before(() => {
      player = {
        roomName: 'Kitchen',
        play: sinon.stub().resolves(),
        setVolume: sinon.stub().resolves(),
        pause: sinon.stub().resolves(),
        setAVTransport: sinon.stub().resolves(),
        replaceWithFavorite: sinon.stub().resolves(),
        repeat: sinon.stub().resolves(),
        shuffle: sinon.stub().resolves(),
        crossfade: sinon.stub().resolves(),
        trackSeek: sinon.stub().resolves(),
        timeSeek: sinon.stub().resolves(),
        becomeCoordinatorOfStandaloneGroup: sinon.stub().resolves(),
        uuid: 'RINCON_0000000001400'
      };

      player.coordinator = player;

      superfluousPlayer = {
        becomeCoordinatorOfStandaloneGroup: sinon.stub().resolves()
      };

      system = {
        getPlayer: sinon.stub().returns(player),
        zones: [
          {
            uuid: 'RINCON_0000000001400', coordinator: player, members: [
            player, player, player, superfluousPlayer
          ]
          },
          { coordinator: player }
        ]
      };

      preset = {
        test: {
          players: [{ roomName: 'Bedroom', volume: 1 }, { roomName: 'Kitchen', volume: 2 }, {
            roomName: 'Office',
            volume: 3
          }],
          playMode: {
            crossfade: true,
            repeat: true,
            shuffle: true
          },
          pauseOthers: true,
          favorite: 'My favorite',
          trackNo: 12,
          elapsedTime: 120
        }
      };

      return applyPreset.call(system, preset.test);
    });

    it('Pauses all zones', () => {
      expect(player.pause).calledTwice;
    });

    it('Has invoked getPlayer thrice', () => {
      expect(system.getPlayer).calledThrice;
      expect(system.getPlayer.firstCall.args[0]).equal(preset.test.players[0].roomName);
      expect(system.getPlayer.secondCall.args[0]).equal(preset.test.players[1].roomName);
      expect(system.getPlayer.thirdCall.args[0]).equal(preset.test.players[2].roomName);
    });

    it('Has set volume correctly', () => {
      expect(player.setVolume).calletThrice;
      expect(player.setVolume.firstCall.args[0]).equal(1);
      expect(player.setVolume.secondCall.args[0]).equal(2);
      expect(player.setVolume.thirdCall.args[0]).equal(3);
    });

    it('Should not break out coordinator since already coordinator', () => {
      expect(player.becomeCoordinatorOfStandaloneGroup).not.called;
    });

    it('Groups players with coordinator', () => {
      expect(player.setAVTransport).calledTwice;
      expect(player.setAVTransport.firstCall.args[0]).equal('x-rincon:RINCON_0000000001400');
      expect(player.setAVTransport.secondCall.args[0]).equal('x-rincon:RINCON_0000000001400');
    });

    it('Ungroups players that does\'nt belong to group', () => {
      expect(superfluousPlayer.becomeCoordinatorOfStandaloneGroup).calledOnce;
    });

    it('Replaces queue with favorite', () => {
      expect(player.replaceWithFavorite).calledOnce;
      expect(player.replaceWithFavorite.firstCall.args[0]).equal(preset.test.favorite);
    });

    it('Sets correct playmode', () => {
      expect(player.repeat).calledOnce;
      expect(player.repeat.firstCall.args[0]).eql(preset.test.playMode.repeat);
      expect(player.shuffle).calledOnce;
      expect(player.shuffle.firstCall.args[0]).eql(preset.test.playMode.shuffle);
      expect(player.crossfade).calledOnce;
      expect(player.crossfade.firstCall.args[0]).eql(preset.test.playMode.crossfade);
    });

    it('Skips to correct track', () => {
      expect(player.trackSeek).calledOnce;
      expect(player.trackSeek.firstCall.args[0]).equal(preset.test.trackNo);
    });

    it('Skips to correct time', () => {
      expect(player.timeSeek).calledOnce;
      expect(player.timeSeek.firstCall.args[0]).equal(preset.test.elapsedTime);
    });

    it('Should start playback', () => {
      expect(player.play).calledOnce;
    });

  });

  describe('When coordinator is not coordinator of any group', () => {
    let system;
    let player;
    let preset;
    let coordinator;

    before(() => {
      player = {
        setVolume: sinon.stub().resolves(),
        setAVTransport: sinon.stub().resolves(),
        uuid: 'RINCON_0000000001400'
      };

      coordinator = {
        play: sinon.stub().resolves(),
        setVolume: sinon.stub().resolves(),
        becomeCoordinatorOfStandaloneGroup: sinon.stub().resolves(),
        uuid: 'RINCON_10000000001400',
        coordinator: player
      };

      system = {
        getPlayer: sinon.stub().returns(player),
        zones: [
          { uuid: 'RINCON_0000000001400', coordinator: coordinator },
          { coordinator: player }
        ]
      };

      system.getPlayer.onCall(0).returns(coordinator);

      preset = {
        test: {
          players: [{ roomName: 'Bedroom', volume: 1 }, { roomName: 'Kitchen', volume: 2 }, {
            roomName: 'Office',
            volume: 3
          }]
        }
      };

      return applyPreset.call(system, preset.test);
    });

    it('Detaches first player from group', () => {
      expect(coordinator.becomeCoordinatorOfStandaloneGroup).calledOnce;
    });
  });

  describe('When preset contains uri only', () => {
    let system;
    let player;
    let preset;
    let coordinator;

    before(() => {
      player = {
        play: sinon.stub().resolves(),
        setAVTransport: sinon.stub().resolves(),
        becomeCoordinatorOfStandaloneGroup: sinon.stub().resolves(),
        uuid: 'RINCON_0000000001400'
      };

      system = {
        getPlayer: sinon.stub().returns(player),
        zones: [
          { uuid: 'RINCON_0000000001400', coordinator: player }
        ]
      };

      preset = {
        test: {
          players: [{ roomName: 'Bedroom' }],
          uri: 'x-rincon-stream:UUID_0000000001400'
        }
      };

      return applyPreset.call(system, preset.test);
    });

    it('Sets uri to preset uri', () => {
      expect(player.setAVTransport).calledOnce;
      expect(player.setAVTransport.firstCall.args[0]).equal(preset.test.uri);
    });
  });
});
