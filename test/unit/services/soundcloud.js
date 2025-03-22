'use strict';
let expect = require('chai').expect;

describe('soundcloud', function () {

  let soundcloud;

  beforeEach(() => {
    let apiStub = require('../../../lib/services/soundcloud');
    let servicesContainer = {};

    apiStub(servicesContainer);

    soundcloud = servicesContainer[160];
  });
});
