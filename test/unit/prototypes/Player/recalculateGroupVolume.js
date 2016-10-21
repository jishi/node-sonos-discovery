'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));

describe('Player.calculateGroupVolume', () => {
  const recalculateGroupVolume = require('../../../../lib/prototypes/Player/recalculateGroupVolume.js');
  let players;
  let coordinator;
  let system;

  beforeEach(() => {
    coordinator = {
      uuid: '123456789',
      groupState: {
        volume: 10
      },
      emit: sinon.spy()
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
      ],
      emit: sinon.spy()
    };

    coordinator.system = system;
  });

  describe('When recalculating group volume', () => {

    beforeEach(() => {
      return recalculateGroupVolume.call(coordinator);
    });

    it('should have updated groupState.volume', () => {
      expect(coordinator.groupState.volume).equal(22);
    });

  });

  describe('When all players has outputFixed = true', () => {

    beforeEach(() => {
      players.forEach(player => player.outputFixed = true);
    });

    it('should not have updated groupState.volume', () => {
      expect(coordinator.groupState.volume).equal(10);
    });

  });
});
