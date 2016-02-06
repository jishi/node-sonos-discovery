'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
require('chai').use(require('sinon-chai'));

const SonosSystem = require('../../lib/SonosSystem');

describe.only('System test', () => {
  let system;

  beforeEach((done) => {
    system = new SonosSystem();
    system.on('topology-change', () => done());
  });

  it('Has zones', () => {
    expect(system.zones).not.empty;
  });

  it('Pauses', () => {
    system.getPlayer('Office')
  });
});
