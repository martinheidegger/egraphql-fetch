var afterEach = global.afterEach
var before = global.before
var beforeEach = global.beforeEach
var describe = global.describe
var it = global.it
var expect = require('code').expect
var createPad = require('../lib/pad.js')

function createTest(str, padAmount, pad) {
  var expected = str.length + (padAmount - str.length % padAmount)
  it('string with length ' + str.length + ' should be padded to ' + expected, function () {
    expect(pad(str).length).to.equal(expected)
  })
}

describe('pad all lengths of strings', function () {
  var padAmount = 5
  var pad = createPad(padAmount)
  for (var str = ''; str.length <= 15; str += ' ') {
    createTest(str, padAmount, pad)
  }
})
