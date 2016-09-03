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

  it('should load highres art', () => {

    return spotify.tryGetHighResArt('x-sonos-spotify:spotify%3atrack%3a3WKg25vrbjJlkhsgl2W4p3?sid=9&flags=8224&sn=9')
      .then((url) => {
        expect(url).to.have.string('https://i.scdn.co/image/');
      });
  });

});
