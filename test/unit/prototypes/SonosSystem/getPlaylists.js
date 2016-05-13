'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));

describe('getPlaylists', () => {

  let system;
  let resultMock;
  let success;

  const getPlaylists = require('../../../../lib/prototypes/SonosSystem/getPlaylists.js');

  describe('When calling getPlaylists', () => {
    let player;
    before(() => {

      resultMock = {
        items: [],
        startIndex: 0,
        numberReturned: 0,
        totalMatches: 0
      };

      player = {
        browse: sinon.stub().resolves(resultMock)
      };

      system = {
        getAnyPlayer: sinon.stub().returns(player)
      };

      success = sinon.spy();

      return getPlaylists.call(system)
        .then(success);
    });

    it('Has called browse', () => {
      expect(player.browse).calledOnce;
      expect(player.browse.firstCall.args).eql(['SQ:', 0, 0]);
    });

    it('Returns the expected result', () => {
      expect(success.firstCall.args[0]).eql(resultMock);
    });
  });

  describe('When result is bigger than maximum chunk', () => {
    let player;
    before(() => {

      player = {
        browse: sinon.stub()
      };

      player.browse.onCall(0).resolves({
        items: [1, 2, 3],
        startIndex: 0,
        numberReturned: 3,
        totalMatches: 6
      });

      player.browse.onCall(1).resolves({
        items: [4, 5, 6],
        startIndex: 3,
        numberReturned: 3,
        totalMatches: 6
      });

      // This prevents the loop from continuing without noticing.
      // Should not happen.
      player.browse.onCall(2).rejects();

      system = {
        getAnyPlayer: sinon.stub().returns(player)
      };

      success = sinon.spy();

      return getPlaylists.call(system)
        .then(success);
    });

    it('Should call browse twice', () => {
      expect(player.browse).calledTwice;
    });

    it('Has merged result', () => {
      expect(success.firstCall.args[0]).eql({
        items: [1, 2, 3, 4, 5, 6],
        startIndex: 0,
        numberReturned: 6,
        totalMatches: 6
      });
    });
  });
});
