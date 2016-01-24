'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const Readable = require('stream').Readable;
const fs = require('fs');
require('chai').use(require('sinon-chai'));

describe('NotificationListener', () => {
  let notificationListener;
  let http;
  let server;
  let mockedStream;

  beforeEach(() => {
    server = {
      listen: sinon.spy(),
      on: sinon.spy()
    }
    http = {
      createServer: sinon.stub().returns(server)
    };
    let NotificationListener = proxyquire('../../lib/NotificationListener', {
      http
    });

    notificationListener = new NotificationListener();

    mockedStream = new Readable();

    // Avoid not implemented warning
    mockedStream._read = function noop() {
    };
    mockedStream.method = 'NOTIFY';
    mockedStream.headers = {
      sid: 'uuid:RINCON_12345678900001400_sub'
    };
  });

  it('Sets up listening server on first available port in range', () => {
    expect(http.createServer).calledOnce;
    expect(server.listen).calledOnce;
    expect(server.listen.firstCall.args[0]).equal(3500);
  });

  it('Finds another port if taken', () => {
    server.on.withArgs('error').yield({
      code: 'EADDRINUSE'
    });
    expect(server.listen).calledTwice;
    expect(server.listen.secondCall.args[0]).equal(3501);
  });

  it('Emits topology on ZoneGroupState', (done) => {
    let listener = sinon.spy(function () {
      expect(listener).calledOnce;
      expect(listener.firstCall.args[1]).not.empty;
      done();
    });

    notificationListener.on('topology', listener);
    let xmlStream = fs.createReadStream(__dirname + '/../data/zonegroupstate.xml');
    xmlStream.method = 'NOTIFY';
    xmlStream.headers = {
      sid: 'uuid:RINCON_12345678900001400_sub'
    };
    http.createServer.yield(xmlStream);

  });

  it('Emits last-change on LastChange', (done) => {
    let listener = sinon.spy(function () {
      expect(listener).calledOnce;
      expect(listener.firstCall.args[0]).equal('RINCON_12345678900001400');
      expect(listener.firstCall.args[1].transportstate.val).equal('PLAYING');
      expect(listener.firstCall.args[1].currenttrackuri.val).equal('x-sonos-spotify:spotify%3atrack%3a5qAFqkXoQd2RfjZ2j1ay0w?sid=9&flags=8224&sn=9');
      done();
    });

    notificationListener.on('last-change', listener);
    let xmlStream = fs.createReadStream(__dirname + '/../data/lastchange.xml');
    xmlStream.method = 'NOTIFY';
    xmlStream.headers = {
      sid: 'uuid:RINCON_12345678900001400_sub'
    };
    http.createServer.yield(xmlStream);
  });

  it('Emits queue-change', (done) => {
    let listener = sinon.spy(function () {
      expect(listener).calledOnce;
      expect(listener.firstCall.args[0]).equal('RINCON_12345678900001400');
      done();
    });

    notificationListener.on('queue-change', listener);
    let xmlStream = fs.createReadStream(__dirname + '/../data/queuechange.xml');
    xmlStream.method = 'NOTIFY';
    xmlStream.headers = {
      sid: 'uuid:RINCON_12345678900001400_sub'
    };
    http.createServer.yield(xmlStream);
  });

  it('Emits favorite-change', (done) => {
    let listener = sinon.spy(function () {
      expect(listener).calledOnce;
      expect(listener.firstCall.args[0]).equal('RINCON_12345678900001400');
      done();
    });

    notificationListener.on('favorites-change', listener);
    let xmlStream = fs.createReadStream(__dirname + '/../data/favoritechange.xml');
    xmlStream.method = 'NOTIFY';
    xmlStream.headers = {
      sid: 'uuid:RINCON_12345678900001400_sub'
    };
    http.createServer.yield(xmlStream);
  });
});
