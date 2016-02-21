'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
require('chai').use(require('sinon-chai'));

describe('http test', () => {
  let request;
  let promise;

  beforeEach(() => {
    request = require('../../lib/helpers/request');
    promise = request({
      uri: 'http://httpbin.org/delay/1',
      timeout: 10
    });
  });

  it('should timeout if request takes to long', () => {
    return promise.then(() => {
      throw new Error('This should not happen');
    }, (e) => {
      expect(e).instanceOf(Error);
    });
  });
});
