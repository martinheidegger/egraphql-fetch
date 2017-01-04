module.exports = function createPad (padAmount) {
  var padString = new Array(padAmount + 1).join(' ')
  return function pad (data) {
    var padLength = padString.length - data.length % padString.length
    return data + padString.substr(0, padLength)
  }
}
