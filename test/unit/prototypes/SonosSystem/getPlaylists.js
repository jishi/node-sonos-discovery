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
        browseAll: sinon.stub().resolves(resultMock.items)
      };

      system = {
        getAnyPlayer: sinon.stub().returns(player)
      };

      success = sinon.spy();

      return getPlaylists.call(system)
        .then(success);
    });

    it('Has called browseAll', () => {
      expect(player.browseAll).calledOnce;
      expect(player.browseAll.firstCall.args).eql(['SQ:']);
    });

    it('Returns the expected result', () => {
      expect(success.firstCall.args[0]).eql(resultMock.items);
    });
  });

});
