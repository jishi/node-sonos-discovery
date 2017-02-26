'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));

const soap = require('../../../../lib/helpers/soap');
const TYPE = soap.TYPE;

describe('Player.speechEnhancement()', () => {
  let zoneMemberData;
  let request;
  let Player;
  let player;
  let Subscriber;
  let subscriber;
  let listener;
  let system;
  let musicServices;

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

    subscriber = {
      dispose: sinon.spy()
    };

    Subscriber = sinon.stub().returns(subscriber);

    musicServices = {
      tryGetHighResArt: sinon.stub()
    };

    musicServices.tryGetHighResArt.onCall(0).resolves('http://example.org/image1');
    musicServices.tryGetHighResArt.onCall(1).resolves('http://example.org/image2');

    Player = proxyquire('../../../../lib/models/Player', {
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

  it('should call correct soap call when enabling', () => {
    return player.speechEnhancement(true)
      .then(() => {
        expect(soap.invoke).calledOnce;
        expect(soap.invoke.firstCall.args).eql([
          'http://192.168.1.151:1400/MediaRenderer/RenderingControl/Control',
          TYPE.SetEQ,
          {
            eqType: 'DialogLevel',
            value: '1'
          }
        ]);
      });
  });

  it('should call correct soap call when disabling', () => {
    return player.speechEnhancement(false)
      .then(() => {
        expect(soap.invoke).calledOnce;
        expect(soap.invoke.firstCall.args).eql([
          'http://192.168.1.151:1400/MediaRenderer/RenderingControl/Control',
          TYPE.SetEQ,
          {
            eqType: 'DialogLevel',
            value: '0'
          }
        ]);
      });
  });

});
