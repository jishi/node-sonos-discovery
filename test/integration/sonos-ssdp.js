'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));

describe.only('Make sure it finds players', () => {
  let ssdp;

  beforeEach(() => {
    ssdp = require('../../lib/sonos-ssdp');
    ssdp.start();
  });

  afterEach(() => {
    ssdp.stop();
  });

  it('Finds players', function (done) {
    this.timeout(5000);
    let handler = sinon.spy((topology) => {
      console.log(topology);
      expect(topology.location).to.match(/^http:\/\/\d+\.\d+\.\d+\.\d+:1400/);
      expect(topology.household).not.empty;
      expect(topology.ip).to.match(/^\d+\.\d+\.\d+\.\d+$/);
      done();
    });

    ssdp.on('found', handler);
  });
});