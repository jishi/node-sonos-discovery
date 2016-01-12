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

  it('should load highres art', () => {
    return soundcloud.tryGetHighResArt('x-sonos-http:track%3a44731098.mp3?sid=160&flags=8224&sn=10')
      .then((url) => {
        expect(url).to.equal('https://i1.sndcdn.com/artworks-000022486019-txiq8s-t500x500.jpg');
      });
  });
});
