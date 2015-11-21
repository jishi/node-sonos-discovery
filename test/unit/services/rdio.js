'use strict';
let expect = require('chai').expect;

xdescribe('rdio', function () {

  let rdio;

  beforeEach(() => {
    let apiStub = require('../../../lib/services/rdio');
    let servicesContainer = {};

    apiStub(servicesContainer);

    rdio = servicesContainer[11];
  });

  it('should load highres art', () => {


    return rdio.tryGetHighResArt('x-sonos-http:_t%3a%3a36909122.mp3?sid=11&flags=8224&sn=11')
      .then((url) => {
        expect(url).to.equal('http://rdio1img-a.akamaihd.net/album/4/e/3/00000000003513e4/1/square-400.jpg');
      });
  });

});