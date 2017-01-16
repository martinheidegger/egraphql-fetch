'use strict'

var test = require('blue-tape').test
var createPad = require('../lib/pad.js')

test('padding', function (t) {
  var padAmount = 5
  var pad = createPad(padAmount)
  for (var str = ''; str.length <= 15; str += ' ') {
    var expected = str.length + (padAmount - str.length % padAmount)
    t.equal(pad(str).length, expected, 'pad string with length ' + str.length + ' should be padded to ' + expected)
  }
  t.end()
})
