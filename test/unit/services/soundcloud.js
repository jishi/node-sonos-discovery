'use strict';
let expect = require('chai').expect;

describe('soundcloud', function () {

  let soundcloud;

  beforeEach(() => {
    let apiStub = require('../../../lib/services/soundcloud');
    let servicesContainer = {};

    apiStub(servicesContainer);

    soundcloud = servicesContainer[10];
  });

  it('should load highres art', () => {


    return soundcloud.tryGetHighResArt('x-sonos-http:track%3a232202756.mp3?sid=160&flags=8224&sn=10')
      .then((url) => {
        expect(url).to.equal('https://i1.sndcdn.com/artworks-000135513720-rt0k2s-t500x500.jpg');
      });
  });

});