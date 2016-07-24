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
  let res;

  beforeEach(() => {
    server = {
      listen: sinon.spy(),
      on: sinon.spy()
    };
    http = {
      createServer: sinon.stub().returns(server)
    };
    let NotificationListener = proxyquire('../../lib/NotificationListener', {
      http
    });

    res = {
      end: sinon.spy(),
      writeHead: sinon.spy()
    };

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
    let xmlStream = fs.createReadStream(__dirname + '/../data/zonegroupstate_with_satellites.xml');
    xmlStream.method = 'NOTIFY';
    xmlStream.headers = {
      sid: 'uuid:RINCON_12345678900001400_sub'
    };
    http.createServer.yield(xmlStream, res);

  });

  it('Emits last-change on AvTransport LastChange', (done) => {
    let listener = sinon.spy(function () {
      expect(listener).calledOnce;
      expect(listener.firstCall.args[0]).equal('RINCON_12345678900001400');
      expect(listener.firstCall.args[1].transportstate.val).equal('PLAYING');
      expect(listener.firstCall.args[1].currenttrackuri.val).equal('x-sonos-spotify:spotify%3atrack%3a5qAFqkXoQd2RfjZ2j1ay0w?sid=9&flags=8224&sn=9');
      done();
    });

    notificationListener.on('last-change', listener);
    let xmlStream = fs.createReadStream(__dirname + '/../data/avtransportlastchange.xml');
    xmlStream.method = 'NOTIFY';
    xmlStream.headers = {
      sid: 'uuid:RINCON_12345678900001400_sub'
    };
    http.createServer.yield(xmlStream, res);
  });

  it('Emits last-change on RenderingControl LastChange', (done) => {
    let listener = sinon.spy(function () {
      setImmediate(() => {
        expect(listener).calledOnce;
        expect(listener.firstCall.args[0]).equal('RINCON_12345678900001400');
        expect(listener.firstCall.args[1].volume).not.empty;
        let masterVolume = listener.firstCall.args[1].volume.find((x) => {
          return x.channel === 'Master';
        });
        expect(masterVolume.val).equal('12');
        done();
      });
    });

    notificationListener.on('last-change', listener);
    let xmlStream = fs.createReadStream(__dirname + '/../data/renderingcontrollastchange.xml');
    xmlStream.method = 'NOTIFY';
    xmlStream.headers = {
      sid: 'uuid:RINCON_12345678900001400_sub'
    };
    http.createServer.yield(xmlStream, res);
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
    http.createServer.yield(xmlStream, res);
  });

  it('Emits list-change', (done) => {
    let listener = sinon.spy(function () {
      expect(listener).calledOnce;
      expect(listener.firstCall.args[0]).equal('favorites');
      done();
    });

    notificationListener.on('list-change', listener);
    let xmlStream = fs.createReadStream(__dirname + '/../data/favoritechange.xml');
    xmlStream.method = 'NOTIFY';
    xmlStream.headers = {
      sid: 'uuid:RINCON_12345678900001400_sub'
    };
    http.createServer.yield(xmlStream, res);
  });

  it('Emits last-change for SUB rendering control last change event', (done) => {
    let listener = sinon.spy(function () {
      setImmediate(() => {
        expect(listener).calledOnce;
        expect(listener.firstCall.args[0]).equal('RINCON_12345678900001400');
        expect(listener.firstCall.args[1].subgain.val).equal('-3');
        expect(listener.firstCall.args[1].subcrossover.val).equal('90');
        expect(listener.firstCall.args[1].subenabled.val).equal('1');
        expect(listener.firstCall.args[1].subpolarity.val).equal('0');
        done();
      });
    });

    notificationListener.on('last-change', listener);
    let xmlStream = fs.createReadStream(__dirname + '/../data/sublastchange.xml');
    xmlStream.method = 'NOTIFY';
    xmlStream.headers = {
      sid: 'uuid:RINCON_12345678900001400_sub'
    };
    http.createServer.yield(xmlStream, res);
  });
});
