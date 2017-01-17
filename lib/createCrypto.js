'use strict'
var crypto = require('crypto')
var createPad = require('./pad.js')
var toBuffer = require('./toBuffer.js')

module.exports = function (cipherAlgorithm, privateKey, cipherPad) {
  var pad = createPad(cipherPad || 1024)
  return {
    cipher: function (data) {
      data = pad(data)
      var c = crypto.createCipher(cipherAlgorithm, privateKey)
      return Buffer.concat([
        c.update(data),
        c.final()
      ]).toString('base64')
    },
    decipher: function (data) {
      var d = crypto.createDecipher(cipherAlgorithm, privateKey)
      return Buffer.concat([
        d.update(toBuffer(data, 'base64')),
        d.final()
      ]).toString('utf8')
    }
  }
}
