'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
require('chai').use(require('sinon-chai'));

describe('Player.setGroupVolume', () => {
  const setGroupVolume = require('../../../../lib/prototypes/Player/setGroupVolume.js');
  let players;
  let coordinator;
  let system;

  beforeEach(() => {
    coordinator = {
      uuid: '123456789',
      groupState: {
        volume: 22
      }
    };

    players = [{
      system,
      coordinator,
      setVolume: sinon.spy(),
      _setVolume: sinon.spy(),
      state: {
        volume: 15
      }
    },
      {
        system,
        coordinator,
        setVolume: sinon.spy(),
        _setVolume: sinon.spy(),
        state: {
          volume: 20
        }
      },
      {
        system,
        coordinator,
        setVolume: sinon.spy(),
        _setVolume: sinon.spy(),
        state: {
          volume: 30
        }
      }];

    system = {
      zones: [
        {
          uuid: coordinator.uuid,
          members: players
        }
      ]
    };

    coordinator.system = system;
  });

  describe('When setting fixed group volume', () => {

    beforeEach(() => {
      return setGroupVolume.call(coordinator, 10);
    });

    it('should have called setVolume on all players', () => {
      expect(players[0].setVolume).calledOnce;
      expect(players[0].setVolume.firstCall.args[0]).equal(7);
      expect(players[1].setVolume).calledOnce;
      expect(players[1].setVolume.firstCall.args[0]).equal(10);
      expect(players[2].setVolume).calledOnce;
      expect(players[2].setVolume.firstCall.args[0]).equal(14);
    });

    it('Should have updated groupState to match desired volume', () => {
      expect(coordinator.groupState.volume).to.equal(10);
    });

  });

  describe('When setting relative negative group volume', () => {

    beforeEach(() => {
      return setGroupVolume.call(coordinator, '-5');
    });

    it('should have called setVolume on all players', () => {
      expect(players[0].setVolume).calledOnce;
      expect(players[0].setVolume.firstCall.args[0]).equal(12);
      expect(players[1].setVolume).calledOnce;
      expect(players[1].setVolume.firstCall.args[0]).equal(16);
      expect(players[2].setVolume).calledOnce;
      expect(players[2].setVolume.firstCall.args[0]).equal(24);
    });

    it('Should have updated groupState to match desired volume', () => {
      expect(coordinator.groupState.volume).to.equal(17);
    });
  });

  describe('When setting relative positive group volume', () => {

    beforeEach(() => {
      return setGroupVolume.call(coordinator, '+5');
    });

    it('should have called setVolume on all players', () => {
      expect(players[0].setVolume).calledOnce;
      expect(players[0].setVolume.firstCall.args[0]).equal(20);
      expect(players[1].setVolume).calledOnce;
      expect(players[1].setVolume.firstCall.args[0]).equal(25);
      expect(players[2].setVolume).calledOnce;
      expect(players[2].setVolume.firstCall.args[0]).equal(35);
    });

    it('Should have updated groupState to match desired volume', () => {
      expect(coordinator.groupState.volume).to.equal(27);
    });
  });
});
