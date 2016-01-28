'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));

describe('Player', () => {
  let zoneMemberData;
  let request;
  let Player;
  let player;
  let Subscriber;
  let subscriber;
  let listener;

  beforeEach(() => {
    zoneMemberData =  {
      uuid: 'RINCON_00000000000001400',
      location: 'http://192.168.1.151:1400/xml/device_description.xml',
      zonename: 'Kitchen',
      icon: 'x-rincon-roomicon:kitchen',
      configuration: '1',
      softwareversion: '31.8-24090',
      mincompatibleversion: '29.0-00000',
      legacycompatibleversion: '24.0-00000',
      bootseq: '114',
      wirelessmode: '0',
      hasconfiguredssid: '0',
      channelfreq: '2412',
      behindwifiextender: '0',
      wifienabled: '1',
      orientation: '0',
      sonarstate: '4'
    };

    request = sinon.spy();

    subscriber = {
      dispose: sinon.spy()
    };

    Subscriber = sinon.stub().returns(subscriber);

    Player = proxyquire('../../../lib/models/Player', {
      '../helpers/request': request,
      '../Subscriber': Subscriber
    });

    listener = {
      endpoint: sinon.stub().returns('http://127.0.0.2/'),
      on: sinon.spy()
    };

    player = new Player(zoneMemberData, listener);

  });

  it('Should set name on player', () => {
    expect(player.roomName).equal('Kitchen');
  });

  it('Should have uuid', () => {
    expect(player.uuid).equal('RINCON_00000000000001400');
  });

  it('Has baseUrl', () => {
    expect(player.baseUrl).equal('http://192.168.1.151:1400');
  });

  it('Subscribes to the various notifications', () => {
    expect(Subscriber).callCount(3);
    expect(Subscriber.withArgs('http://192.168.1.151:1400/MediaRenderer/AVTransport/Event', 'http://127.0.0.2/')).calledOnce;
    expect(Subscriber.withArgs('http://192.168.1.151:1400/MediaRenderer/RenderingControl/Event', 'http://127.0.0.2/')).calledOnce;
    expect(Subscriber.withArgs('http://192.168.1.151:1400/MediaRenderer/GroupRenderingControl/Event', 'http://127.0.0.2/')).calledOnce;
  });

  it('Invokes dispose on all listeners when disposing player', () => {
    player.dispose();
    expect(subscriber.dispose).callCount(3);
  });

  it('Subscribes to listener events', () => {
    expect(listener.on).calledOnce;
  });

  it('Updates state when last change event occur', () => {
    let lastChange = require('../../data/avtransportlastchange.json');
    listener.on.yield('RINCON_00000000000001400', lastChange);

    expect(player.state.currentState).equals('PLAYING');
    expect(player.state.trackNo).equals(43);
    expect(player.state.currentTrack).eql({
      artist: 'Johannes Brahms',
      title: 'Intermezzo No. 3 in C-sharp minor, Op. 117 - Andante con moto',
      album: 'Glenn Gould plays Brahms: 4 Ballades op. 10; 2 Rhapsodies op. 79; 10 Intermezzi',
      albumArtUri: '/getaa?s=1&u=x-sonos-spotify%3aspotify%253atrack%253a5qAFqkXoQd2RfjZ2j1ay0w%3fsid%3d9%26flags%3d8224%26sn%3d9',
      duration: 318,
      uri: 'x-sonos-spotify:spotify%3atrack%3a5qAFqkXoQd2RfjZ2j1ay0w?sid=9&flags=8224&sn=9',
      radioShowMetaData: ''
    });

    expect(player.state.nextTrack).eql({
      artist: 'Coheed and Cambria',
      title: 'Here To Mars',
      album: 'The Color Before The Sun',
      albumArtUri: '/getaa?s=1&u=x-sonos-spotify%3aspotify%253atrack%253a0Ap3aOVU7LItcHIFiRF8lY%3fsid%3d9%26flags%3d8224%26sn%3d9',
      duration: 241,
      uri: 'x-sonos-spotify:spotify%3atrack%3a0Ap3aOVU7LItcHIFiRF8lY?sid=9&flags=8224&sn=9'
    });
  });

  it('Updates volume when notification occurs', () => {
    let lastChange = require('../../data/renderingControlLastChange.json');
    listener.on.yield('RINCON_00000000000001400', lastChange);

    expect(player.state.volume).equals(12);
  });
});
