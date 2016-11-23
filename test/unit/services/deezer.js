'use strict';
let expect = require('chai').expect;

describe('deezer', function () {

  let deezer;

  beforeEach(() => {
    let apiStub = require('../../../lib/services/deezer');
    let servicesContainer = {};

    apiStub(servicesContainer);

    deezer = servicesContainer[2];
  });

  it('should load highres art', () => {
    return deezer.tryGetHighResArt('x-sonosprog-http:tr-flac%3a3134041.flac?sid=2&flags=8224&sn=7')
      .then((url) => {
        expect(url).to.contain('deezer.com/images/cover/5646492f1aec0168e52814d27d2d9a67/500x500-000000-80-0-0.jpg');
      });
  });

});
