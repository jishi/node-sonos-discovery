'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
require('chai').use(require('sinon-chai'));

context('SonosSystem.applyPreset', () => {
  describe('When applying a preset', () => {
    const applyPreset = require('../../../lib/prototypes/SonosSystem.applyPreset.js');
    let system;
    let player;
    let preset;

    before(() => {
      player = {
        setVolume: sinon.stub().resolves(),
        pause: sinon.stub().resolves(),
        setAVTransport: sinon.stub().resolves(),
        uuid: 'RINCON_0000000001400'
      };

      system = {
        getPlayer: sinon.stub().returns(player),
        zones: [
          { uuid: 'RINCON_0000000001400', coordinator: player },
          { coordinator: player }
        ]
      };

      preset = {
        test: {
          players: [{ roomName: 'Bedroom', volume: 1 }, { roomName: 'Kitchen', volume: 2 }, { roomName: 'Office', volume: 3 }],
          playMode: 'NORMAL',
          pauseOthers: true
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

    it('Groups players with coordinator', () => {
      expect(player.setAVTransport).calledTwice;
      expect(player.setAVTransport.firstCall.args[0]).equal('x-rincon:RINCON_0000000001400');
      expect(player.setAVTransport.secondCall.args[0]).equal('x-rincon:RINCON_0000000001400');
    });

  });
});