'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));

describe('getFavorites', () => {

  let player;
  let system;
  let resultMock = {
    items: [{
      uri: 'test://uri',
      title: 'title'
    }, {
      uri: undefined,
      title: undefined
    }], startIndex: 0
  };
  let success;

  const getFavorites = require('../../../../lib/prototypes/SonosSystem/getFavorites.js');

  describe('When calling getFavorites', () => {
    before(() => {
      player = {
        browseAll: sinon.stub().resolves(resultMock.items)
      };

      system = {
        getAnyPlayer: sinon.stub().returns(player)
      };

      success = sinon.spy();

      return getFavorites.call(system)
        .then(success);
    });

    it('Has called browseAll', () => {
      expect(player.browseAll).calledOnce;
      expect(player.browseAll.firstCall.args).eql(['FV:2']);
    });

    it('Returns the expected result with undefined values filtered out', () => {
      expect(success.firstCall.args[0]).eql(resultMock.items);
    });
  });
});
