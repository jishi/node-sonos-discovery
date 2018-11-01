'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const fs = require('fs');
const path = require('path');
require('chai').use(require('sinon-chai'));
require('sinon-as-promised');

const soap = require('../../../lib/helpers/soap');

describe('Player', () => {
  let zoneMemberData;
  let request;
  let Player;
  let player;
  let Subscriber;
  let subscriber;
  let listener;
  let system;
  let musicServices;

  let TYPE = require('../../../lib/helpers/soap').TYPE;

  beforeEach(() => {
    sinon.stub(soap, 'invoke').resolves();
    sinon.stub(soap, 'parse');
  });

  afterEach(() => {
    if (soap.invoke.restore)
      soap.invoke.restore();
    if (soap.parse.restore)
      soap.parse.restore();
  });

  beforeEach(() => {
    zoneMemberData = {
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

    musicServices = {
      tryGetHighResArt: sinon.stub()
    };

    musicServices.tryGetHighResArt.onCall(0).resolves('http://example.org/image1');
    musicServices.tryGetHighResArt.onCall(1).resolves('http://example.org/image2');

    Player = proxyquire('../../../lib/models/Player', {
      '../helpers/request': request,
      '../Subscriber': Subscriber,
      '../musicservices': musicServices
    });

    listener = {
      endpoint: sinon.stub().returns('http://127.0.0.2/'),
      on: sinon.spy()
    };

    system = {
      zones: [
        {
          uuid: zoneMemberData.uuid,
          members: []
        }
      ],
      on: sinon.stub(),
      emit: sinon.spy()
    };

    player = new Player(zoneMemberData, listener, system);
    player.coordinator = player;
    system.zones[0].coordinator = player;
    system.zones[0].members.push(player);

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

  it('Subscribes to the various notifications by default', () => {
    expect(Subscriber).callCount(4);
    expect(Subscriber.withArgs('http://192.168.1.151:1400/MediaRenderer/AVTransport/Event', 'http://127.0.0.2/')).calledOnce;
    expect(Subscriber.withArgs('http://192.168.1.151:1400/MediaRenderer/RenderingControl/Event', 'http://127.0.0.2/')).calledOnce;
    expect(Subscriber.withArgs('http://192.168.1.151:1400/MediaRenderer/GroupRenderingControl/Event', 'http://127.0.0.2/')).calledOnce;
    expect(Subscriber.withArgs('http://192.168.1.151:1400/MediaServer/ContentDirectory/Event', 'http://127.0.0.2/')).calledOnce;
  });

  it('Invokes dispose on all listeners when disposing player', () => {
    player.dispose();
    expect(subscriber.dispose).callCount(4);
  });

  it('Subscribes to listener events', () => {
    expect(listener.on).calledTwice;
  });

  describe('When it receives a transport-state update for queue playback', () => {
    beforeEach((done) => {
      let lastChange = require('../../data/avtransportlastchange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      player.on('transport-state', () => {
        done();
      });
    });

    it('Updates state', () => {
      expect(player.state.playbackState).equals('PLAYING');
      expect(player.state.trackNo).equals(43);
      expect(player.state.currentTrack).eql({
        artist: 'Johannes Brahms',
        title: 'Intermezzo No. 3 in C-sharp minor, Op. 117 - Andante con moto',
        album: 'Glenn Gould plays Brahms: 4 Ballades op. 10; 2 Rhapsodies op. 79; 10 Intermezzi',
        albumArtUri: '/getaa?s=1&u=x-sonos-spotify%3aspotify%253atrack%253a5qAFqkXoQd2RfjZ2j1ay0w%3fsid%3d9%26flags%3d8224%26sn%3d9',
        absoluteAlbumArtUri: 'http://example.org/image1',
        duration: 318,
        uri: 'x-sonos-spotify:spotify%3atrack%3a5qAFqkXoQd2RfjZ2j1ay0w?sid=9&flags=8224&sn=9',
        trackUri: 'x-sonos-spotify:spotify%3atrack%3a5qAFqkXoQd2RfjZ2j1ay0w?sid=9&flags=8224&sn=9',
        type: 'track',
        stationName: '',
      });
      expect(player.state.nextTrack).eql({
        artist: 'Coheed and Cambria',
        title: 'Here To Mars',
        album: 'The Color Before The Sun',
        albumArtUri: '/getaa?s=1&u=x-sonos-spotify%3aspotify%253atrack%253a0Ap3aOVU7LItcHIFiRF8lY%3fsid%3d9%26flags%3d8224%26sn%3d9',
        absoluteAlbumArtUri: 'http://example.org/image2',
        duration: 241,
        uri: 'x-sonos-spotify:spotify%3atrack%3a0Ap3aOVU7LItcHIFiRF8lY?sid=9&flags=8224&sn=9',
        trackUri: 'x-sonos-spotify:spotify%3atrack%3a0Ap3aOVU7LItcHIFiRF8lY?sid=9&flags=8224&sn=9'
      });

      expect(player.state.playMode).eql({
        repeat: 'all',
        shuffle: true,
        crossfade: true
      });
    });

    it('Updates avTransportUri', () => {
      expect(player.avTransportUri).equals('x-rincon-queue:RINCON_00000000000001400#0');
    });

    it('Updates avTransportUriMetadata', () => {
      expect(player.avTransportUriMetadata).equals('');
    });
  });

  describe('When it receives a transport-state update for radio playback', () => {
    beforeEach(() => {
      musicServices.tryGetHighResArt.onCall(0).rejects();
    });

    beforeEach((done) => {
      let lastChange = require('../../data/avtransportlastchange_radio.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      player.on('transport-state', () => {
        done();
      });
    });

    it('Updates state', () => {
      expect(player.state.playbackState).equals('PLAYING');
      expect(player.state.trackNo).equals(1);
      expect(player.state.currentTrack).eql({
        stationName: 'Lugna Favoriter',
        title: 'Leona Lewis - Bleeding Love',
        album: undefined,
        artist: 'Lugna Favoriter',
        albumArtUri: '/getaa?s=1&u=x-sonosapi-stream%3as17553%3fsid%3d254%26flags%3d8224%26sn%3d0',
        absoluteAlbumArtUri: 'http://192.168.1.151:1400/getaa?s=1&u=x-sonosapi-stream%3as17553%3fsid%3d254%26flags%3d8224%26sn%3d0',
        duration: 0,
        uri: 'x-sonosapi-stream:s17553?sid=254&flags=8224&sn=0',
        trackUri: 'x-sonosapi-stream:s17553?sid=254&flags=8224&sn=0',
        type: 'radio'
      });

      expect(player.state.nextTrack).eql({
        artist: '',
        title: '',
        album: '',
        albumArtUri: '',
        duration: 0,
        uri: ''
      });
    });

    it('Updates avTransportUri', () => {
      expect(player.avTransportUri).equals('x-sonosapi-stream:s17553?sid=254&flags=8224&sn=0');
    });

    it('Updates avTransportUriMetadata', () => {
      expect(player.avTransportUriMetadata).equals('<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="-1" parentID="-1" restricted="true"><dc:title>Lugna Favoriter</dc:title><upnp:class>object.item.audioItem.audioBroadcast</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON65031_</desc></item></DIDL-Lite>');
    });
  });

  describe('When it receives a transport-state update for custom radio playback', () => {
    beforeEach(() => {
      musicServices.tryGetHighResArt.onCall(0).rejects();
    });

    beforeEach((done) => {
      let lastChange = require('../../data/avtransportlastchange_custom_radio.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      player.on('transport-state', () => {
        done();
      });
    });

    it('Updates state', () => {
      expect(player.state.currentTrack).eql({
        stationName: 'buddha',
        title: 'Orelha Negra - M.I.R.I.A.M.',
        album: undefined,
        artist: 'buddha',
        albumArtUri: undefined,
        duration: 0,
        uri: 'x-rincon-mp3radio://sc01.scahw.com.au:80/buddha_32',
        trackUri: 'aac://sc01.scahw.com.au:80/buddha_32',
        type: 'radio'
      });

      expect(player.state.nextTrack).eql({
        artist: '',
        title: '',
        album: '',
        albumArtUri: '',
        duration: 0,
        uri: ''
      });
    });

    it('Updates avTransportUri', () => {
      expect(player.avTransportUri).equals('x-rincon-mp3radio://sc01.scahw.com.au:80/buddha_32');
    });

    it('Updates avTransportUriMetadata', () => {
      expect(player.avTransportUriMetadata).equals('<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="R:0/0/60" parentID="R:0/0" restricted="true"><dc:title>buddha</dc:title><upnp:class>object.item.audioItem.audioBroadcast</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON65031_</desc></item></DIDL-Lite>');
    });
  });

  describe('When it receives a transport-state update for google music when casting', () => {

    it('Doesn\'t crash while casting google music', (done) => {
      let lastChange = require('../../data/avtransportlastchange_google_cast.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      player.on('transport-state', () => {
        done();
      });
    });
  });

  describe('When it receives a transport-state update for airplay 2 streaming', () => {

    it('Doesn\'t crash while streaming airplay 2', (done) => {
      let lastChange = require('../../data/avtransportlastchange_airplay.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      player.on('transport-state', () => {
        done();
      });
    });
  });

  describe('When it receives a transport-state update for a DLNA server', () => {

    it('Should have album art from EnqueuedURIMetadata', (done) => {
      let lastChange = require('../../data/avtransportlastchange_subsonic.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      player.on('transport-state', (state) => {
        expect(state.currentTrack.absoluteAlbumArtUri).to.equal('http://192.168.200.20:4040/coverArt.view?id=9381&auth=1583337699&size=300');
        done();
      });
    });
  });

  describe('When radio already has an absolute url', () => {

    beforeEach(() => {
      musicServices.tryGetHighResArt.onCall(0).rejects();
    });

    beforeEach((done) => {
      soap.invoke.resolves();
      let lastChange = require('../../data/avtransportlastchange_radio.json');
      lastChange.currenttrackmetadata.val = '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="-1" parentID="-1" restricted="true"><res protocolInfo="sonos.com-http:*:application/octet-stream:*">x-sonosapi-stream:s20308?sid=254&amp;flags=32</res><r:streamContent>P5 STHLM - Sebastian Ingrosso - Dark River</r:streamContent><r:radioShowMd></r:radioShowMd><upnp:albumArtURI>http://absolute.url/for/test</upnp:albumArtURI><dc:title>x-sonosapi-stream:s20308?sid=254&amp;flags=32</dc:title><upnp:class>object.item</upnp:class></item></DIDL-Lite>';
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      player.on('transport-state', () => {
        done();
      });
    });

    it('Should not touch absoluteAlbumUri', () => {
      expect(player.state.currentTrack.absoluteAlbumArtUri).equal('http://absolute.url/for/test');
    });
  });

  describe('when rendering control event occurs', () => {
    it('Updates volume', () => {
      let lastChange = require('../../data/renderingControlLastChange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);

      expect(player.state.volume).equals(12);
      expect(player.groupState.volume).equals(12);
    });

    it('outputFixed is false', () => {
      let lastChange = require('../../data/renderingControlLastChange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      expect(player.outputFixed).equals(false);
    });

    it('outputFixed is true', () => {
      let lastChange = require('../../data/renderingControlLastChange.json');
      lastChange.outputfixed.val = '1';
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      expect(player.outputFixed).equals(true);
    });

    it('loudness is true', () => {
      let lastChange = require('../../data/renderingControlLastChange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      expect(player.state.equalizer.loudness).equals(true);
    });

    it('bass is 3', () => {
      let lastChange = require('../../data/renderingControlLastChange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      expect(player.state.equalizer.bass).equals(3);
    });

    it('treble is -2', () => {
      let lastChange = require('../../data/renderingControlLastChange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      expect(player.state.equalizer.treble).equals(-2);
    });

    it('speech enhancement is true', () => {
      let lastChange = require('../../data/renderingControlLastChange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      expect(player.state.equalizer.speechEnhancement).equals(true);
    });

    it('nightMode is true', () => {
      let lastChange = require('../../data/renderingControlLastChange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      expect(player.state.equalizer.nightMode).equals(true);
    });

    it('emits event', () => {
      let lastChange = require('../../data/renderingControlLastChange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      expect(system.emit).calledOnce;
    });
  });

  describe('when sub event occurs', () => {

    it('updates gain', () => {
      let lastChange = require('../../data/sublastchange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      expect(player.sub.gain).equals(-3);
    });

    it('updates crossover', () => {
      let lastChange = require('../../data/sublastchange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      expect(player.sub.crossover).equals(90);
    });

    it('updates polarity', () => {
      let lastChange = require('../../data/sublastchange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      expect(player.sub.polarity).equals(0);
    });

    it('updates enabled', () => {
      let lastChange = require('../../data/sublastchange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      expect(player.sub.enabled).equals(true);
    });

    it('should be part of state data', () => {
      let lastChange = require('../../data/sublastchange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      player.hasSub = true;
      expect(player.state.sub).to.eql({
        gain: -3,
        crossover: 90,
        polarity: 0,
        enabled: true
      });
    });

  });

  it('Loads prototypes', () => {
    expect(player).respondsTo('replaceWithFavorite');
  });

  describe('commands', () => {

    const simpleCases = [
      { type: TYPE.Play, action: 'play' },
      { type: TYPE.Pause, action: 'pause' },
      { type: TYPE.Next, action: 'nextTrack' },
      { type: TYPE.Previous, action: 'previousTrack' }
    ];
    simpleCases.forEach((test) => {
      it(`${test.action}`, () => {
        expect(test.type, test.action).not.undefined;
        return player[test.action]()
          .then(() => {
            expect(soap.invoke.firstCall.args, test.action).eql([
              'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
              test.type
            ]);
          });
      });
    });

    beforeEach(() => {
      player._state.volume = 5;
    });

    const volumeCases = [
      { type: TYPE.Volume, action: 'setVolume', value: 10, expectation: 10 },
      { type: TYPE.Volume, action: 'setVolume', value: '10', expectation: 10 },
      { type: TYPE.Volume, action: 'setVolume', value: '+1', expectation: 6 },
      { type: TYPE.Volume, action: 'setVolume', value: '-1', expectation: 4 }
    ];
    volumeCases.forEach((test) => {
      it(`Volume ${test.value} should be ${test.expectation}`, () => {
        expect(test.type, test.action).not.undefined;
        return player[test.action](test.value)
          .then(() => {
            expect(player.state.volume).equal(test.expectation);
            expect(soap.invoke.firstCall.args, test.action).eql([
              'http://192.168.1.151:1400/MediaRenderer/RenderingControl/Control',
              test.type,
              { volume: test.expectation }
            ]);
          });
      });
    });

    it('Volume with fixedoutput should short circuit', () => {
      player.outputFixed = true;
      return player.setVolume(10)
        .then(() => {
          expect(soap.invoke).not.called;
        });
    });

    const muteCases = [
      { type: TYPE.Mute, action: 'mute', expectation: 1 },
      { type: TYPE.Mute, action: 'unMute', expectation: 0 }
    ];
    muteCases.forEach((test) => {
      it(`${test.action}`, () => {
        expect(test.type, test.action).not.undefined;
        return player[test.action]()
          .then(() => {
            expect(soap.invoke.firstCall.args, test.action).eql([
              'http://192.168.1.151:1400/MediaRenderer/RenderingControl/Control',
              test.type,
              { mute: test.expectation }
            ]);
          });
      });
    });

    const seekCases = [
      { type: TYPE.Seek, action: 'timeSeek', value: 120, expectation: { unit: 'REL_TIME', value: '00:02:00' } },
      { type: TYPE.Seek, action: 'trackSeek', value: 12, expectation: { unit: 'TRACK_NR', value: 12 } }
    ];
    seekCases.forEach((test) => {
      it(`${test.action}`, () => {
        expect(test.type, test.action).not.undefined;
        return player[test.action](test.value)
          .then(() => {
            expect(soap.invoke.firstCall.args, test.action).eql([
              'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
              test.type,
              test.expectation
            ]);
          });
      });
    });

    it('clearQueue', () => {
      expect(TYPE.RemoveAllTracksFromQueue).not.undefined;
      return player.clearQueue()
        .then(() => {
          expect(soap.invoke.firstCall.args).eql([
            'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
            TYPE.RemoveAllTracksFromQueue
          ]);
        });
    });

    it('removeTrackFromQueue', () => {
      expect(TYPE.RemoveTrackFromQueue).not.undefined;
      return player.removeTrackFromQueue(13)
        .then(() => {
          expect(soap.invoke.firstCall.args).eql([
            'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
            TYPE.RemoveTrackFromQueue,
            { track: 13 }
          ]);
        });
    });

    it('setBass', () => {
      expect(TYPE.SetBass).not.undefined;
      return player.setBass(2)
        .then(() => {
          expect(soap.invoke.firstCall.args).eql([
            'http://192.168.1.151:1400/MediaRenderer/RenderingControl/Control',
            TYPE.SetBass,
            { level: 2 }
          ]);
        });
    });

    it('setTreble', () => {
      expect(TYPE.SetTreble).not.undefined;
      return player.setTreble(-2)
        .then(() => {
          expect(soap.invoke.firstCall.args).eql([
            'http://192.168.1.151:1400/MediaRenderer/RenderingControl/Control',
            TYPE.SetTreble,
            { level: -2 }
          ]);
        });
    });

    describe('Playmode dependant tests', () => {

      it('Repeat with no state', () => {
        expect(TYPE.SetPlayMode).not.undefined;
        return player.repeat(true)
          .then(() => {
            expect(soap.invoke).calledOnce;
            expect(soap.invoke.firstCall.args).eql([
              'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
              TYPE.SetPlayMode,
              { playMode: 'REPEAT_ALL' }
            ]);
          });

      });

      it('Repeat with shuffle on', () => {
        player._state.playMode.shuffle = true;
        return player.repeat(true)
          .then(() => {
            expect(soap.invoke.firstCall.args).eql([
              'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
              TYPE.SetPlayMode,
              { playMode: 'SHUFFLE' }
            ]);
          });
      });

      it('Shuffle on with no other state', () => {
        expect(TYPE.SetPlayMode).not.undefined;
        return player.shuffle(true)
          .then(() => {
            expect(soap.invoke.firstCall.args).eql([
              'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
              TYPE.SetPlayMode,
              { playMode: 'SHUFFLE_NOREPEAT' }
            ]);
          });
      });

      it('Shuffle off', () => {
        player._state.playMode.repeat = 'all';
        return player.shuffle(true)
          .then(() => {
            expect(soap.invoke.firstCall.args).eql([
              'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
              TYPE.SetPlayMode,
              { playMode: 'SHUFFLE' }
            ]);
          });
      });

      it('Crossfade on', () => {
        expect(TYPE.SetCrossfadeMode).not.undefined;
        return player.crossfade(true)
          .then(() => {
            expect(soap.invoke.firstCall.args).eql([
              'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
              TYPE.SetCrossfadeMode,
              { crossfadeMode: 1 }
            ]);
          });
      });

      it('Crossfade off', () => {
        return player.crossfade(false)
          .then(() => {
            expect(soap.invoke.firstCall.args).eql([
              'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
              TYPE.SetCrossfadeMode,
              { crossfadeMode: 0 }
            ]);
          });
      });

      describe('when playmode fails', () => {

        beforeEach(() => {
          soap.invoke.onCall(0).rejects();
        });

        it('Still calls crossfade if playmode fails', () => {
          return player.setPlayMode({ repeat: false, crossfade: true })
            .then(() => {
              expect(soap.invoke).calledTwice;
            });
        });
      });

    });

    it('Sleep', () => {
      expect(TYPE.ConfigureSleepTimer).not.undefined;
      return player.sleep(120)
        .then(() => {
          expect(soap.invoke.firstCall.args).eql([
            'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
            TYPE.ConfigureSleepTimer,
            { time: '00:02:00' }
          ]);
        });
    });

    it('setAVTransport', () => {
      expect(TYPE.SetAVTransportURI).not.undefined;
      return player.setAVTransport('x-rincon:RINCON_00000000000001400', '<DIDL-Lite></DIDL-Lite>')
        .then(() => {
          expect(soap.invoke.firstCall.args).eql([
            'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
            TYPE.SetAVTransportURI,
            {
              uri: 'x-rincon:RINCON_00000000000001400',
              metadata: '&lt;DIDL-Lite&gt;&lt;/DIDL-Lite&gt;'
            }
          ]);
        });
    });

    it('setAVTransport without metadata', () => {
      expect(TYPE.SetAVTransportURI).not.undefined;
      return player.setAVTransport('x-rincon:RINCON_00000000000001400')
        .then(() => {
          expect(soap.invoke.firstCall.args).eql([
            'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
            TYPE.SetAVTransportURI,
            {
              uri: 'x-rincon:RINCON_00000000000001400',
              metadata: ''
            }
          ]);
        });
    });

    it('becomeCoordinatorOfStandaloneGroup', () => {
      expect(TYPE.BecomeCoordinatorOfStandaloneGroup).not.undefined;
      return player.becomeCoordinatorOfStandaloneGroup()
        .then(() => {
          expect(soap.invoke.firstCall.args).eql([
            'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
            TYPE.BecomeCoordinatorOfStandaloneGroup
          ]);
        });
    });

    it('refreshShareIndex', () => {
      expect(TYPE.RefreshShareIndex).not.undefined;
      return player.refreshShareIndex()
        .then(() => {
          expect(soap.invoke.firstCall.args).eql([
            'http://192.168.1.151:1400/MediaServer/ContentDirectory/Control',
            TYPE.RefreshShareIndex
          ]);
        });
    });

    it('addURIToQueue', () => {
      soap.parse.restore();
      let addURIToQueueXml = fs.createReadStream(`${__dirname}/../../data/addURIToQueue.xml`);
      addURIToQueueXml.statusCode = 200;
      soap.invoke.resolves(addURIToQueueXml);

      expect(TYPE.AddURIToQueue).not.undefined;
      return player.addURIToQueue('x-rincon:RINCON_00000000000001400', '<DIDL-Lite></DIDL-Lite>')
        .then((result) => {
          expect(result).eql({
            firsttracknumberenqueued: '1',
            newqueuelength: '1',
            numtracksadded: '1'
          });
          expect(soap.invoke).calledOnce;
          expect(soap.invoke.firstCall.args).eql([
            'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
            TYPE.AddURIToQueue,
            {
              uri: 'x-rincon:RINCON_00000000000001400',
              metadata: '&lt;DIDL-Lite&gt;&lt;/DIDL-Lite&gt;',
              enqueueAsNext: 0,
              desiredFirstTrackNumberEnqueued: 0
            }
          ]);
        });
    });
  });

  describe('Position of track progress should be fetched', () => {
    beforeEach((done) => {
      player.on('transport-state', () => {
        done();
      });
      let lastChange = require('../../data/avtransportlastchange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
    });

    it('GetPositionInfo is requested', () => {

      expect(TYPE.GetPositionInfo).not.undefined;
      expect(soap.invoke).calledOnce;
      expect(soap.invoke.firstCall.args).eql([
        'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
        TYPE.GetPositionInfo
      ]);
    });
  });

  describe('Using fake timers', () => {
    let clock;
    let now;

    beforeEach('We need parse functionality here', () => {
      soap.parse.restore();
    });

    beforeEach(() => {
      musicServices.tryGetHighResArt.rejects();
    });

    beforeEach((done) => {
      let positionXml = fs.createReadStream(`${__dirname}/../../data/getpositioninfo.xml`);
      positionXml.statusCode = 200;
      soap.invoke.resolves(positionXml);
      let lastChange = require('../../data/avtransportlastchange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      player.on('transport-state', () => {
        done();
      });
    });

    beforeEach(() => {
      now = Date.now();
      clock = sinon.useFakeTimers(now);
    });

    afterEach(() => {
      clock.restore();
    });

    it('GetPositionInfo is saved', () => {
      expect(player.state.elapsedTime).equal(142);
    });

    it('elapsedTime is dynamically calculated', () => {
      let positionXml = fs.createReadStream(`${__dirname}/../../data/getpositioninfo.xml`);
      positionXml.statusCode = 200;
      soap.invoke.resolves(positionXml);
      let lastChange = require('../../data/avtransportlastchange.json');
      listener.on.withArgs('last-change').yield('RINCON_00000000000001400', lastChange);
      clock.tick(6000);
      expect(player.state.elapsedTime).equal(148);
    });
  });

  describe('Browse-inherited functions', () => {

    beforeEach('We need parse functionality here', () => {
      soap.parse.restore();
    });

    describe('Return queue', () => {
      let queue;
      beforeEach(() => {
        let queueStream = fs.createReadStream(path.join(__dirname, '../../data/queue.xml'));
        soap.invoke.resolves(queueStream);
      });

      describe('without arguments', () => {

        beforeEach(() => {
          return player.getQueue()
            .then((q) => {
              queue = q;
            });
        });

        it('Should have invoked browse', () => {
          expect(soap.invoke).calledOnce;
          expect(soap.invoke.firstCall.args[2]).eql({
            objectId: 'Q:0',
            startIndex: 0,
            limit: 0
          });
        });

        it('Parses queue and returns a list of well designed objects', () => {
          expect(queue).not.empty;
          expect(queue[0]).eql({
            uri: 'x-sonos-spotify:spotify%3atrack%3a2uAWmcvujYUNTPCIb2VYKH?sid=9&flags=8224&sn=2',
            artist: 'Deftones',
            metadata: undefined,
            albumTrackNumber: undefined,
            title: 'Prayers/Triangles',
            album: 'Prayers/Triangles',
            albumArtUri: '/getaa?s=1&u=x-sonos-spotify%3aspotify%253atrack%253a2uAWmcvujYUNTPCIb2VYKH%3fsid%3d9%26flags%3d8224%26sn%3d2'
          });
        });

      });

      describe('with only limit', () => {

        beforeEach(() => {
          return player.getQueue(10)
            .then((q) => {
              queue = q;
            });
        });

        it('Should have invoked browse', () => {
          expect(soap.invoke).calledOnce;
          expect(soap.invoke.firstCall.args[2]).eql({
            objectId: 'Q:0',
            startIndex: 0,
            limit: 10
          });
        });

      });

      describe('with limit and offset', () => {

        beforeEach(() => {
          return player.getQueue(10, 100)
            .then((q) => {
              queue = q;
            });
        });

        it('Should have invoked browse', () => {
          expect(soap.invoke).calledOnce;
          expect(soap.invoke.firstCall.args[2]).eql({
            objectId: 'Q:0',
            startIndex: 100,
            limit: 10
          });
        });
      });
    });

    describe('Parsing playlists', () => {
      let queue;
      beforeEach(() => {
        let queueStream = fs.createReadStream(path.join(__dirname, '../../data/playlists.xml'));

        soap.invoke.resolves(queueStream);

        return player.browse()
          .then((q) => {
            queue = q;
          });
      });

      it('Parses response and returns a list of well designed objects', () => {
        expect(queue.items).not.empty;
        expect(queue.startIndex).equal(0);
        expect(queue.numberReturned).equal(2);
        expect(queue.totalMatches).equal(2);
        expect(queue.items[0]).eql({
          uri: 'file:///jffs/settings/savedqueues.rsq#2',
          title: 'Morgon',
          artist: undefined,
          albumArtUri: [
            '/getaa?s=1&u=x-sonos-spotify%3aspotify%253atrack%253a35N1AduT1LDo3deLfYniTY%3fsid%3d9%26flags%3d0',
            '/getaa?s=1&u=x-sonos-spotify%3aspotify%253atrack%253a1MQYow43CGLYMECVSjTpCM%3fsid%3d9%26flags%3d0',
            '/getaa?s=1&u=x-sonos-spotify%3aspotify%253atrack%253a4QWMYALvB1m4Um8ytjZR9m%3fsid%3d9%26flags%3d0',
            '/getaa?s=1&u=x-sonos-spotify%3aspotify%253atrack%253a1d62ECx2DlaBmhOLymrVGc%3fsid%3d9%26flags%3d0'
          ]
        });
      });
    });
  });
});
