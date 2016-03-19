'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
require('chai').use(require('sinon-chai'));

context('SonosSystem.applyPreset', () => {
  describe('When applying a preset', () => {
    const preset = require('../../../lib/prototypes/SonosSystem.applyPreset.js');
    let system;

    before(() => {
      system = {};
      preset.call(system, {
        test: {
          players: [{ roomName: 'Bedroom' }, { roomName: 'Kitchen' }, { roomName: 'Office', volume: 15 }],
          playMode: 'NORMAL'
        }
      });
    })
  });
});