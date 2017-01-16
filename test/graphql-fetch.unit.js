'use strict'

/* global Headers */
require('isomorphic-fetch')
require('../lib/bufferFix.js')

var test = require('blue-tape').test

var sinon = require('sinon')
var crypto = require('crypto')
require('sinon-as-promised')

var graphqlUrl = 'http://host/graphql'
var graphqlFactory = require('../index.js')

function _encrypt (cipher, key, pad, data) {
  var c = crypto.createCipher(cipher, key)
  data = JSON.stringify(data)
  var missing = pad - (data.length % pad)
  for (var i = 0; i < missing; i++) {
    data += ' '
  }
  return Buffer.concat([
    c.update(data),
    c.final()
  ]).toString('base64')
}

function _decrypt (cipher, key, data) {
  var d = crypto.createDecipher(cipher, key)
  return Buffer.concat([
    d.update(Buffer.from(data, 'base64')),
    d.final()
  ]).toString()
}

function testRequest (t, request, response) {
  var encrypt = _encrypt.bind(null, request.cipherAlgorithm || 'aes256', request.privateKey, request.cipherPad || 1024)
  var decrypt = _decrypt.bind(null, request.cipherAlgorithm || 'aes256', request.privateKey)
  var res = {
    text: sinon.stub().returns(encrypt({
      payload: response.payload
    }))
  }
  sinon.stub(global, 'fetch').resolves(res)
  try {
    var graphqlFetch = graphqlFactory(request.url, request.keyID, request.privateKey, request.cipherAlgorithm, request.cipherPad)
  } catch (e) {
    return Promise.reject(e)
  }
  return graphqlFetch(request.query, request.variables, request.opts)
    .then(function (result) {
      t.same(result, response.payload)
      sinon.assert.calledOnce(global.fetch)
      sinon.assert.calledOnce(res.text)
      sinon.assert.calledWith(global.fetch, request.url, sinon.match(function (opts) {
        var json = JSON.parse(decrypt(opts.body))
        t.deepEqual(Object.keys(json), ['t', 'payload'])
        t.equal(typeof json.t, 'number')
        t.deepEqual(json.payload, {
          query: request.query,
          variables: request.variables || {}
        })
        t.equal(opts.method, 'POST')
        t.ok(opts.headers instanceof Headers)
        t.equal(opts.headers.get('x-cipher'), request.cipherAlgorithm || 'aes256')
        t.equal(opts.headers.get('x-key-id'), request.keyID)
        t.equal(opts.headers.get('content-transfer-encoding'), 'base64')
        t.equal(opts.headers.get('content-type'), opts.headers && opts.headers.get('content-type') || 'application/json')
        if (request.checkOpts) {
          return request.checkOpts(opts)
        }
        return true
      }))
      return result
    })
    .then(function (result) {
      return {
        result: result,
        encrypt: encrypt
      }
    })
    .catch(function (e) {
      global.fetch.restore()
      return Promise.reject(e)
    })
    .then(function () {
      global.fetch.restore()
    })
}

test('make a graphql request', function (t) {
  return testRequest(t, {
    url: graphqlUrl,
    keyID: 'admin',
    privateKey: 'password',
    query: 'query { user { username } }'
  }, {
    payload: {
      data: 'something'
    }
  })
})

test('make a graphql request w/ vars and fetch options', function (t) {
  var headers = new Headers()
  headers.append('authorization', 'abcd')
  headers.append('moreData', 'fancy')
  headers.append('content-type', 'text-html')
  return testRequest(t, {
    url: graphqlUrl,
    keyID: 'user',
    privateKey: 'fancy',
    cipherAlgorithm: 'des',
    cipherPad: 512,
    query: 'query { user { password } }',
    variables: { foo: 'bar' },
    opts: {
      headers: headers
    },
    checkOpts: function (opts) {
      t.equal(opts.headers.get('authorization'), 'abcd')
      t.equal(opts.headers.get('moreData'), 'fancy')
      return true
    }
  }, {
    payload: {
      other: 'fancystuff'
    }
  })
})

test('rejected without query', function (t) {
  return testRequest(t, { url: graphqlUrl, privateKey: 'foo' }, {})
    .then(function () {
      return Promise.reject(new Error('unt.equaled success'))
    })
    .catch(function (error) {
      t.equal(error.code, 'EQUERYMISSING')
    })
})

test('thrown an error if the graphqlUrl isnt given', function (t) {
  return testRequest(t, {
    url: null,
    privateKey: 'foo'
  }, {})
    .then(function () {
      throw new Error('unexpected success')
    })
    .catch(function (e) {
      if (e.code !== 'EURLMISSING') {
        throw new Error('unexpected error ' + e)
      }
    })
})
