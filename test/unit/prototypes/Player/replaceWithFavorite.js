'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
require('chai').use(require('sinon-chai'));

describe('Player.replaceWithFavorite', () => {
  const replaceWithFavorite = require('../../../../lib/prototypes/Player/replaceWithFavorite.js');

  describe('When replacing with streaming favorite', () => {
    let player;
    let system;
    let favorites;

    before(() => {
      favorites = [
        {
          title: 'A soundtrack for coding',
          uri: 'x-rincon-cpcontainer:1006006cspotify%3auser%3amill%3aplaylist%3a4mxd3BBHjZ4gBlBnbusntN',
          albumArtURI: 'http://spotify-static-resources.s3.amazonaws.com/img/playlist_default.png',
          metadata: '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="1006006cspotify%3auser%3amill%3aplaylist%3a4mxd3BBHjZ4gBlBnbusntN" parentID="100a0664playlists" restricted="true"><dc:title>A soundtrack for coding</dc:title><upnp:class>object.container.playlistContainer</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON2311_X_#Svc2311-0-Token</desc></item></DIDL-Lite>'
        },
        {
          title: 'Blast from the past',
          uri: 'x-rincon-cpcontainer:10060a6cspotify%3auser%3ajishi%3aplaylist%3a0hk4rggpXBUvHnDTLCkN9N',
          albumArtURI: 'http://spotify-static-resources.s3.amazonaws.com/img/playlist_default.png',
          metadata: '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="10060a6cspotify%3auser%3ajishi%3aplaylist%3a0hk4rggpXBUvHnDTLCkN9N" parentID="100a0664playlists" restricted="true"><dc:title>Blast from the past</dc:title><upnp:class>object.container.playlistContainer</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON2311_X_#Svc2311-0-Token</desc></item></DIDL-Lite>'
        }
      ];

      system = {
        getFavorites: sinon.stub().resolves(favorites)
      };
      player = {
        system,
        uuid: 'RINCON_000000000000001400',
        clearQueue: sinon.stub().resolves(),
        addURIToQueue: sinon.stub().resolves(),
        setAVTransport: sinon.stub().resolves(),
        play: sinon.stub().resolves()

      };

      return replaceWithFavorite.call(player, favorites[0].title);

    });

    it('Has fetched favorites', () => {
      expect(system.getFavorites).calledOnce;
    });

    it('Removes all tracks before adding them', () => {
      expect(player.clearQueue).calledOnce;
    });

    it('Adds URI to queue with metadata', () => {
      expect(player.addURIToQueue).calledOnce;
      expect(player.addURIToQueue.firstCall.args).eql([
        favorites[0].uri,
        favorites[0].metadata
      ]);
    });

    it('Sets the avtransport to current queue', () => {
      expect(player.setAVTransport).calledOnce;
      expect(player.setAVTransport.firstCall.args[0]).equal(`x-rincon-queue:${player.uuid}#0`);
    });
  });

  describe('When replacing with radio favorite', () => {
    let player;
    let system;
    let favorites;

    before(() => {
      favorites = [
        {
          title: 'Metropol 93,8',
          uri: 'x-sonosapi-stream:s20308?sid=254&flags=32',
          albumArtURI: 'http://d1i6vahw24eb07.cloudfront.net/s20308q.gif',
          metadata: '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="F00090020s20308" parentID="F00020064search%3astation:Metropol" restricted="true"><dc:title>Metropol 93,8</dc:title><upnp:class>object.item.audioItem.audioBroadcast</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON65031_</desc></item></DIDL-Lite>'
        }
      ];

      system = {
        getFavorites: sinon.stub().resolves(favorites)
      };
      player = {
        system,
        uuid: 'RINCON_000000000000001400',
        clearQueue: sinon.stub().resolves(),
        addURIToQueue: sinon.stub().resolves(),
        setAVTransport: sinon.stub().resolves(),
        play: sinon.stub().resolves()

      };

      return replaceWithFavorite.call(player, favorites[0].title);

    });

    it('Do not remove tracks', () => {
      expect(player.clearQueue).not.called;
    });

    it('Do not try to add uri to queue', () => {
      expect(player.addURIToQueue).not.called;
    });

    it('Sets the avtransport to uri directly', () => {
      expect(player.setAVTransport).calledOnce;
      expect(player.setAVTransport.firstCall.args[0]).equal(favorites[0].uri);
      expect(player.setAVTransport.firstCall.args[1]).equal(favorites[0].metadata);
    });
  });

  describe('When favorite is not found', () => {
    let player;
    let system;
    let favorites;
    let success;
    let fail;

    before(() => {
      favorites = [];

      system = {
        getFavorites: sinon.stub().resolves(favorites)
      };
      player = {
        system
      };

      success = sinon.spy();
      fail = sinon.spy();

      return replaceWithFavorite.call(player, 'some favorite')
        .then(success)
        .catch(fail);

    });

    it('Promise should not resolve', () => {
      expect(success).not.called;
    });

    it('Promise should reject', () => {
      expect(fail).calledOnce;
      expect(fail.firstCall.args[0]).instanceOf(Error);
      expect(fail.firstCall.args[0].message).equal('Favorite not found');
    });
  });
});
