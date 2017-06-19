'use strict';
let expect = require('chai').expect;

describe('spotify', function () {

  let spotify;

  beforeEach(() => {
    let apiStub = require('../../../lib/services/spotify');
    let servicesContainer = {};

    apiStub(servicesContainer);

    spotify = servicesContainer[9];
  });

});
