'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));

context('Player.calculateGroupVolume', () => {
  const recalculateGroupVolume = require('../../../../lib/prototypes/Player/recalculateGroupVolume.js');
  let players;
  let coordinator;
  let system;

  beforeEach(() => {
    coordinator = {
      uuid: '123456789',
      groupState: {
        volume: 10
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

  describe('When recalculating group volume', () => {

    beforeEach(() => {
      return recalculateGroupVolume.call(coordinator);
    });

    it('should have updated groupState.volume', () => {
      expect(coordinator.groupState.volume).equal(22);
    });

  });
});
