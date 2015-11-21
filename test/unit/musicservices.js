var expect = require('chai').expect;
var rewire = require('rewire');

describe('MusicServices', function () {

  var musicServices;

  beforeEach(() => {

    musicServices = rewire('../../lib/musicservices');

  });

  it('should reject on non existent service', () => {
    return musicServices.tryGetHighResArt('sn=1000')
      .then(() => {
        throw new Error('Should not resolve');
      }, () => {
        console.log('Rejected succesfully');
      });
  });

  it('should return cover art on existing service', () => {
    return musicServices.tryGetHighResArt('x-sonos-http:track%3a232202756.mp3?sid=160&flags=8224&sn=10')
    .then((url) => {
      expect(url).to.equal('https://i1.sndcdn.com/artworks-000135513720-rt0k2s-t500x500.jpg');
    });
  });
});