'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));

context('getFavorites', () => {

  let player;
  let system;
  let resultMock = [{}];
  let success;

  const getFavorites = require('../../../../lib/prototypes/SonosSystem/getFavorites.js');

  describe('When calling getFavorites', () => {
    before(() => {
      player = {
        browse: sinon.stub().resolves(resultMock)
      };

      system = {
        getAnyPlayer: sinon.stub().returns(player)
      };

      success = sinon.spy();

      return getFavorites.call(system)
        .then(success);
    });

    it('Has called browse', () => {
      expect(player.browse).calledOnce;
      expect(player.browse.firstCall.args).eql(['FV:2', 0, 0]);
    });

    it('Returns the expected result', () => {
      expect(success.firstCall.args[0]).equal(resultMock);
    });
  });
});
