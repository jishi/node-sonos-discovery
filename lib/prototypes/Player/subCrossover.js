'use strict';
const soap = require('../../helpers/soap');
const TYPE = soap.TYPE;

function subCrossover(value) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetEQ,
    { eqType: 'SubCrossover', value: value });
}

module.exports = subCrossover;
