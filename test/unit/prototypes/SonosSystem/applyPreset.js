'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
require('chai').use(require('sinon-chai'));

describe('SonosSystem.applyPreset', () => {
  const applyPreset = require('../../../../lib/prototypes/SonosSystem/applyPreset.js');

  describe('When applying a preset', () => {
    let system;
    let coordinator;
    let member;
    let preset;
    let superfluousPlayer;
    let otherPlayer;

    beforeEach(() => {
      coordinator = {
        roomName: 'Kitchen',
        play: sinon.stub().resolves(),
        setVolume: sinon.stub().resolves(),
        pause: sinon.stub().resolves(),
        setAVTransport: sinon.stub().resolves(),
        replaceWithFavorite: sinon.stub().resolves(),
        setPlayMode: sinon.stub().resolves(),
        trackSeek: sinon.stub().resolves(),
        timeSeek: sinon.stub().resolves(),
        sleep: sinon.stub().resolves(),
        mute: sinon.stub().resolves(),
        unMute: sinon.stub().resolves(),
        becomeCoordinatorOfStandaloneGroup: sinon.stub().resolves(),
        uuid: 'RINCON_0000000001400'
      };

      member = {
        roomName: 'Member',
        play: sinon.stub().resolves(),
        setVolume: sinon.stub().resolves(),
        pause: sinon.stub().resolves(),
        setAVTransport: sinon.stub().resolves(),
        replaceWithFavorite: sinon.stub().resolves(),
        setPlayMode: sinon.stub().resolves(),
        trackSeek: sinon.stub().resolves(),
        timeSeek: sinon.stub().resolves(),
        sleep: sinon.stub().resolves(),
        mute: sinon.stub().resolves(),
        unMute: sinon.stub().resolves(),
        becomeCoordinatorOfStandaloneGroup: sinon.stub().resolves(),
        uuid: 'RINCON_0100000001400'
      };

      otherPlayer = {
        roomName: 'Other room',
        pause: sinon.stub().resolves(),
        uuid: 'RINCON_1000000001400'
      };

      coordinator.coordinator = coordinator;
      member.coordinator = coordinator;

      superfluousPlayer = {
        becomeCoordinatorOfStandaloneGroup: sinon.stub().resolves()
      };

      system = {
        getPlayer: sinon.stub(),
        zones: [
          {
            uuid: 'RINCON_0000000001400',
            coordinator: coordinator,
            members: [
              coordinator, member, superfluousPlayer
            ]
          },
          {
            coordinator: otherPlayer,
            uuid: 'RINCON_1000000001400'
          }
        ]
      };

      system.getPlayer.withArgs('Kitchen').returns(coordinator);
      system.getPlayer.withArgs('Other room').returns(member);
      system.getPlayer.withArgs('Office').returns(member);

      preset = {
        players: [{ roomName: 'Kitchen', volume: 1 }, { roomName: 'Other room', volume: 2 }, {
          roomName: 'Office',
          volume: 3,
          mute: true
        }],
        playMode: {
          crossfade: true,
          repeat: true,
          shuffle: true
        },
        pauseOthers: true,
        favorite: 'My favorite',
        trackNo: 12,
        elapsedTime: 120,
        state: 'playing',
        sleep: 600
      };
    });

    describe('When applying preset', () => {

      beforeEach(() => {
        return applyPreset.call(system, preset);
      });

      it('Pauses all zones', () => {
        expect(coordinator.pause).not.called;
        expect(otherPlayer.pause).calledOnce;
      });

      it('Has invoked getPlayer thrice', () => {
        expect(system.getPlayer.firstCall.args[0]).equal(preset.players[0].roomName);
        expect(system.getPlayer.secondCall.args[0]).equal(preset.players[1].roomName);
        expect(system.getPlayer.thirdCall.args[0]).equal(preset.players[2].roomName);
      });

      it('Has set volume correctly', () => {
        expect(coordinator.setVolume).calledOnce;
        expect(coordinator.setVolume.firstCall.args[0]).equal(1);
        expect(member.setVolume).calledTwice;
        expect(member.setVolume.firstCall.args[0]).equal(2);
        expect(member.setVolume.secondCall.args[0]).equal(3);
      });

      it('Has muted player correctly', () => {
        expect(member.unMute).not.called;
        expect(member.mute).calledOnce;
      });

      it('Should not break out coordinator since already coordinator', () => {
        expect(coordinator.becomeCoordinatorOfStandaloneGroup).not.called;
      });

      it('Groups players with coordinator', () => {
        expect(member.setAVTransport).calledTwice;
        expect(member.setAVTransport.firstCall.args[0]).equal('x-rincon:RINCON_0000000001400');
        expect(member.setAVTransport.secondCall.args[0]).equal('x-rincon:RINCON_0000000001400');
      });

      it('Ungroups players that does\'nt belong to group', () => {
        expect(superfluousPlayer.becomeCoordinatorOfStandaloneGroup).calledOnce;
      });

      it('Replaces queue with favorite', () => {
        expect(coordinator.replaceWithFavorite).calledOnce;
        expect(coordinator.replaceWithFavorite.firstCall.args[0]).equal(preset.favorite);
      });

      it('Sets correct playmode', () => {
        expect(coordinator.setPlayMode).calledOnce;
        expect(coordinator.setPlayMode.firstCall.args[0]).eql(preset.playMode);
      });

      it('Skips to correct track', () => {
        expect(coordinator.trackSeek).calledOnce;
        expect(coordinator.trackSeek.firstCall.args[0]).equal(preset.trackNo);
      });

      it('Skips to correct time', () => {
        expect(coordinator.timeSeek).calledOnce;
        expect(coordinator.timeSeek.firstCall.args[0]).equal(preset.elapsedTime);
      });

      it('Should call sleep', () => {
        expect(coordinator.sleep).calledOnce;
        expect(coordinator.sleep.firstCall.args[0]).equal(preset.sleep);
      });

      it('Should start playback', () => {
        expect(coordinator.play).calledOnce;
      });

    });

    describe('When it contains an mute=false', () => {

      beforeEach(() => {
        preset.players[2].mute = false;
      });

      beforeEach(() => {
        return applyPreset.call(system, preset);
      });

      it('Has un-muted player correctly', () => {
        expect(member.mute).not.called;
        expect(member.unMute).calledOnce;
      });

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
        coordinator: player,
        pause: sinon.stub().resolves()
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
        players: [{ roomName: 'Bedroom', volume: 1 }, { roomName: 'Kitchen', volume: 2 }, {
          roomName: 'Office',
          volume: 3
        }]
      };

      return applyPreset.call(system, preset);
    });

    it('Detaches first player from group', () => {
      expect(coordinator.becomeCoordinatorOfStandaloneGroup).calledOnce;
    });

    it('Should not pause the coordinator', () => {
      expect(coordinator.pause).not.called;
    });

  });

  describe('When preset contains uri only', () => {
    let system;
    let player;
    let preset;

    before(() => {
      player = {
        play: sinon.stub().resolves(),
        setAVTransport: sinon.stub().resolves(),
        becomeCoordinatorOfStandaloneGroup: sinon.stub().resolves(),
        uuid: 'RINCON_0000000001400'
      };

      player.coordinator = player;

      system = {
        getPlayer: sinon.stub().returns(player),
        zones: [
          { uuid: 'RINCON_0000000001400', coordinator: player, members: [player] }
        ]
      };

      preset = {
        players: [{ roomName: 'Bedroom' }],
        uri: 'x-rincon-stream:UUID_0000000001400',
        metadata: '<DIDL-Lite></DIDL-Lite>'

      };

      return applyPreset.call(system, preset);
    });

    it('Sets uri to preset uri and metadata', () => {
      expect(player.setAVTransport).calledOnce;
      expect(preset.uri).not.undefined;
      expect(preset.metadata).not.undefined;
      expect(player.setAVTransport.firstCall.args[0]).equal(preset.uri);
      expect(player.setAVTransport.firstCall.args[1]).equal(preset.metadata);
    });
  });
});
