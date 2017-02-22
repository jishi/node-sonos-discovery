'use strict';
const soap = require('../../helpers/soap');
const TYPE = soap.TYPE;

function subCrossover(value) {
  if (value < 40 || value > 200) {
    return Promise.reject(new Error('You shouldn\'t use unreasonable values, you risk damaging the SUB'));
  }

  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetEQ,
    { eqType: 'SubCrossover', value: value });
}

module.exports = subCrossover;
