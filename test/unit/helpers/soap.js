'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
require('chai').use(require('sinon-chai'));
/* jshint -W101 */

describe('soap', () => {
  let request;
  let soap;

  beforeEach(() => {
    request = sinon.stub().resolves({ statusCode: 200 });

    soap = proxyquire('../../../lib/helpers/soap', {
      './request': request
    });
  });

  it('Invokes soap call with the correct parameters and returns the promise', () => {
    let result = soap.invoke(
      'http://127.0.0.1/test/path',
      soap.TYPE.SetEQ,
      { eqType: 'SubGain', value: -2 });
    expect(request).calledOnce;
    expect(request.firstCall.args[0]).eql({
      uri: 'http://127.0.0.1/test/path',
      method: 'POST',
      headers: {
        'CONTENT-TYPE': 'text/xml; charset="utf-8"',
        SOAPACTION: '"urn:schemas-upnp-org:service:RenderingControl:1#SetEQ"',
        'CONTENT-LENGTH': 312
      },
      body: new Buffer('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetEQ xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1"><InstanceID>0</InstanceID><EQType>SubGain</EQType><DesiredValue>-2</DesiredValue></u:SetEQ></s:Body></s:Envelope>'),
      type: 'stream'
    });
    expect(result).instanceOf(Promise);
    return result;
  });

  it('Supports calls without values', () => {
    soap.invoke(
      'http://127.0.0.1/test/path',
      soap.TYPE.Play
    );
    expect(request).calledOnce;
    expect(request.firstCall.args[0]).eql({
      uri: 'http://127.0.0.1/test/path',
      method: 'POST',
      headers: {
        'CONTENT-TYPE': 'text/xml; charset="utf-8"',
        SOAPACTION: '"urn:schemas-upnp-org:service:AVTransport:1#Play"',
        'CONTENT-LENGTH': 266
      },
      body: new Buffer('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Speed>1</Speed></u:Play></s:Body></s:Envelope>'),
      type: 'stream'
    });
  });

  it('Contains templates', () => {
    expect(soap.TYPE).not.empty;
    for (let key in soap.TYPE) {
      let action = soap.TYPE[key];
      expect(soap.TEMPLATES[action], key).not.undefined;
    }
  });
});
