var afterEach = global.afterEach
var before = global.before
var beforeEach = global.beforeEach
var describe = global.describe
var it = global.it

var expect = require('code').expect
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

describe('graphql-fetch', function () {
  function testRequest (request, response) {
    var encrypt = _encrypt.bind(null, request.cipherAlgorithm || 'aes256', request.privateKey, request.cipherPad || 1024)
    var res = {
      text: sinon.stub().returns(encrypt({
        payload: response.payload
      }))
    }
    sinon.stub(global, 'fetch').resolves(res)
    var graphqlFetch = graphqlFactory(request.url, request.keyID, request.privateKey, request.cipherAlgorithm, request.cipherPad)
    return graphqlFetch(request.query, request.variables, request.opts)
      .then(function (result) {
        expect(result).to.deep.equal(response.payload)
        sinon.assert.calledOnce(global.fetch)
        sinon.assert.calledOnce(res.text)
        sinon.assert.calledWith(global.fetch, request.url, sinon.match(function (opts) {
          expect(opts.body).to.equal(encrypt({
            payload: {
              query: request.query,
              variables: request.variables || {}
            }
          }))
          expect(opts.method).to.equal('POST')
          expect(opts.headers).to.be.an.instanceOf(Headers)
          expect(opts.headers.get('x-cipher')).to.equal(request.cipherAlgorithm || 'aes256')
          expect(opts.headers.get('x-key-id')).to.equal(request.keyID)
          expect(opts.headers.get('content-transfer-encoding')).to.equal('base64')
          expect(opts.headers.get('content-type')).to.equal(opts.headers && opts.headers.get('content-type') || 'application/json')
          if (request.checkOpts) {
            return request.checkOpts(opts) === false ? false : true
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
  }

  before(function () {
    expect(global.fetch).to.exist()
    expect(global.Headers).to.exist()
    expect(global.Response).to.exist()
    expect(global.Request).to.exist()
  })

  it('should make a graphql request', function () {
    return testRequest({
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

  it('should make a graphql request w/ vars and fetch options', function () {
    var headers = new Headers()
    headers.append('authorization', 'abcd')
    headers.append('moreData', 'fancy')
    headers.append('content-type', 'text-html')
    return testRequest({
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
        expect(opts.headers.get('authorization')).to.equal('abcd')
        expect(opts.headers.get('moreData')).to.equal('fancy')
        return true
      }
    }, {
      payload: {
        other: 'fancystuff'
      }
    })
  })

  it('should be rejected without query', function () {
    return testRequest({ url: graphqlUrl, privateKey: 'foo' }, {})
      .then(function () {
        return Promise.reject(new Error('unexpected success'))
      })
      .catch(function (error) {
        expect(error.code).to.equal('EQUERYMISSING')
      })
  })

  it('should thrown an error if the graphqlUrl isnt given', function () {
    try {
      testRequest({ url: null, privateKey: 'foo' }, {})
    } catch (e) {
      if (e.code === 'EURLMISSING') {
        return true
      }
      throw e
    }
    return Promise.reject(new Error('unexpected success'))
  })

  afterEach(function () {
    global.fetch.restore && global.fetch.restore()
  })
})
