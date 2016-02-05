'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));

describe('Sub', () => {
  let Sub;
  let zoneMemberData;
  let request;
  let subscriber;
  let Subscriber;
  let listener;
  let sub;

  beforeEach(() => {
    zoneMemberData =  {
      uuid: 'RINCON_10000000000001400',
      location: 'http://192.168.1.155:1400/xml/device_description.xml',
      zonename: 'TV Room',
      icon: 'x-rincon-roomicon:tvroom',
      configuration: '1',
      invisible: '1',
      softwareversion: '31.8-24090',
      mincompatibleversion: '29.0-00000',
      legacycompatibleversion: '24.0-00000',
      channelmapset: 'RINCON_20000000000001400:LF,RF;RINCON_10000000000001400:SW,SW',
      bootseq: '21',
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

    listener = {
      endpoint: sinon.stub().returns('http://127.0.0.2/'),
      on: sinon.spy()
    };

    Sub = proxyquire('../../../lib/models/Sub', {
      '../Subscriber': Subscriber
    });

    sub = new Sub(zoneMemberData, listener);
  });

  it('Got subname', () => {
    expect(sub.roomName).equal('TV Room (SUB)');
  });

  it('Got sub uuid', () => {
    expect(sub.uuid).equal('RINCON_10000000000001400');
  });

  it('Instantiate a subscriber', () => {
    expect(Subscriber).calledWithNew;
  });

  it('Subscribes to RenderingControl', () => {
    expect(Subscriber.withArgs('http://192.168.1.155:1400/MediaRenderer/RenderingControl/Event', 'http://127.0.0.2/')).calledOnce;
  });

  it('Disposes Subscriber when Sub is disposed', () => {
    sub.dispose();
    expect(subscriber.dispose).calledOnce;
  });

  it('Updates SubGain when event occurs', () => {

  });
});
