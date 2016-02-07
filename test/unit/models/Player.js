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
  let soap;

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

    soap = {
      invoke: sinon.stub().returns('promise')
    };

    Player = proxyquire('../../../lib/models/Player', {
      '../helpers/request': request,
      '../Subscriber': Subscriber,
      '../helpers/soap': soap
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

    expect(player.state.playMode).eql({
      repeat: true,
      shuffle: true,
      crossfade: true
    });
  });

  it('Updates volume when notification occurs', () => {
    let lastChange = require('../../data/renderingControlLastChange.json');
    listener.on.yield('RINCON_00000000000001400', lastChange);

    expect(player.state.volume).equals(12);
  });

  context('Basic commands', () => {
    let TYPE = require('../../../lib/helpers/soap').TYPE;

    it('Basic actions', () => {
      const cases = [
        { type: TYPE.Play, action: 'play' },
        { type: TYPE.Pause, action: 'pause' },
        { type: TYPE.Next, action: 'nextTrack' },
        { type: TYPE.Previous, action: 'previousTrack' }
      ];
      cases.forEach((test) => {
        // Need to reset this in the loop since we are testing multiple actions
        soap.invoke.reset();
        expect(test.type, test.action).not.undefined;
        expect(player[test.action](), test.action).equal('promise');
        expect(soap.invoke.firstCall.args, test.action).eql([
          'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
          test.type
        ]);
      });
    });

    it('Volume', () => {
      const cases = [
        { type: TYPE.Volume, action: 'setVolume', value: 10, expectation: 10 },
        { type: TYPE.Volume, action: 'setVolume', value: '+1', expectation: 21 },
        { type: TYPE.Volume, action: 'setVolume', value: '-1', expectation: 19 }
      ];
      cases.forEach((test) => {
        // Need to reset this in the loop since we are testing multiple actions
        soap.invoke.reset();
        player.state.volume = 20;
        expect(test.type, test.action).not.undefined;
        expect(player[test.action](test.value), test.action).equal('promise');
        expect(soap.invoke.firstCall.args, test.action).eql([
          'http://192.168.1.151:1400/MediaRenderer/RenderingControl/Control',
          test.type,
          { volume: test.expectation }
        ]);
      });
    });

    it('Mute', () => {
      const cases = [
        { type: TYPE.Mute, action: 'mute', expectation: 1 },
        { type: TYPE.Mute, action: 'unMute', expectation: 0 }
      ];
      cases.forEach((test) => {
        // Need to reset this in the loop since we are testing multiple actions
        soap.invoke.reset();
        expect(test.type, test.action).not.undefined;
        expect(player[test.action](), test.action).equal('promise');
        expect(soap.invoke.firstCall.args, test.action).eql([
          'http://192.168.1.151:1400/MediaRenderer/RenderingControl/Control',
          test.type,
          { mute: test.expectation }
        ]);
      });
    });

    it('Seek', () => {
      const cases = [
        { type: TYPE.Seek, action: 'timeSeek', value: 120, expectation: { unit: 'REL_TIME', value: '00:02:00' } },
        { type: TYPE.Seek, action: 'trackSeek', value: 12, expectation: { unit: 'TRACK_NR', value: 12 } }
      ];
      cases.forEach((test) => {
        // Need to reset this in the loop since we are testing multiple actions
        soap.invoke.reset();
        expect(test.type, test.action).not.undefined;
        expect(player[test.action](test.value), test.action).equal('promise');
        expect(soap.invoke.firstCall.args, test.action).eql([
          'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
          test.type,
          test.expectation
        ]);
      });
    });

    it('clearQueue', () => {
      expect(TYPE.RemoveAllTracksFromQueue).not.undefined;
      expect(player.clearQueue()).equal('promise');
      expect(soap.invoke.firstCall.args).eql([
        'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
        TYPE.RemoveAllTracksFromQueue
      ]);
    });

    it('removeTrackFromQueue', () => {
      expect(TYPE.RemoveTrackFromQueue).not.undefined;
      expect(player.removeTrackFromQueue(13)).equal('promise');
      expect(soap.invoke.firstCall.args).eql([
        'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
        TYPE.RemoveTrackFromQueue,
        { track: 13 }
      ]);
    });

    it('removeTrackFromQueue', () => {
      expect(TYPE.RemoveTrackFromQueue).not.undefined;
      expect(player.removeTrackFromQueue(13)).equal('promise');
      expect(soap.invoke.firstCall.args).eql([
        'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
        TYPE.RemoveTrackFromQueue,
        { track: 13 }
      ]);
    });

    it('Repeat', () => {
      expect(TYPE.SetPlayMode).not.undefined;
      expect(player.repeat(true)).equal('promise');
      expect(soap.invoke.firstCall.args).eql([
        'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
        TYPE.SetPlayMode,
        { playMode: 'REPEAT' }
      ]);

      player.state.playMode.shuffle = true;
      player.repeat(true);
      expect(soap.invoke.secondCall.args).eql([
        'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
        TYPE.SetPlayMode,
        { playMode: 'SHUFFLE' }
      ]);
    });

    it('Shuffle', () => {
      expect(TYPE.SetPlayMode).not.undefined;
      expect(player.shuffle(true)).equal('promise');
      expect(soap.invoke.firstCall.args).eql([
        'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
        TYPE.SetPlayMode,
        { playMode: 'SHUFFLE_NOREPEAT' }
      ]);

      player.state.playMode.repeat = true;
      player.shuffle(true);
      expect(soap.invoke.secondCall.args).eql([
        'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
        TYPE.SetPlayMode,
        { playMode: 'SHUFFLE' }
      ]);
    });

    it.only('Crossfade', () => {
      expect(TYPE.SetCrossfadeMode).not.undefined;
      expect(player.crossfade(true)).equal('promise');
      expect(soap.invoke.firstCall.args).eql([
        'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
        TYPE.SetCrossfadeMode,
        { crossfadeMode: 1 }
      ]);
      player.crossfade(false);
      expect(soap.invoke.secondCall.args).eql([
        'http://192.168.1.151:1400/MediaRenderer/AVTransport/Control',
        TYPE.SetCrossfadeMode,
        { crossfadeMode: 0 }
      ]);
    });
  });
});