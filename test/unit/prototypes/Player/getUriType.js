'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const UriType = require('../../../../lib/types/uri-type');
require('chai').use(require('sinon-chai'));

describe('Player.getUriType', () => {
  const getUriType = require('../../../../lib/prototypes/Player/getUriType.js');

  describe('UriType enum', () => {

    it('should have type track', () => {
      expect(UriType.TRACK).to.exist;
    });

    it('should have type radio', () => {
      expect(UriType.RADIO).to.exist;
    });

    it('should have type line in', () => {
      expect(UriType.LINE_IN).to.exist;
    });

  });

  describe('When called with different types', () => {

    it('should be of type "radio"', () => {
      const type = getUriType('x-sonosapi-stream:s20308?sid=254&flags=32');
      expect(type).to.equal(UriType.RADIO);
    });

    it('should be of type "line-in"', () => {
      const type = getUriType('x-rincon-stream:RINCON_00000000000001400');
      expect(type).to.equal(UriType.LINE_IN);
    });

    it('should be of type "track"', () => {
      const type = getUriType('x-rincon-queue:RINCON_00000000000001400#0');
      expect(type).to.equal(UriType.TRACK);
    });

  });
});
