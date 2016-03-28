'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();
const fs = require('fs');
const path = require('path');
require('chai').use(require('sinon-chai'));

describe('Should require all files in folder', () => {
  let requireDir;
  let mockObject;
  let readdirSync;

  before(() => {

    mockObject = {
      mockMethod: sinon.spy()
    };

    requireDir = proxyquire('../../../lib/helpers/require-dir.js', { fs });
    requireDir(path.join(__dirname, '/../../data/requireables'), (module) => {
      module(mockObject);
    });
  });

  it('Has called mockMethod from subject', () => {
    expect(mockObject.mockMethod).calledTwice;
    expect(mockObject.mockMethod.firstCall.args[0]).equal(1);
    expect(mockObject.mockMethod.secondCall.args[0]).equal(2);
  });
});
