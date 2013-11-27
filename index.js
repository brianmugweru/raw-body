var bytes = require('bytes')

module.exports = function (stream, options, done) {
  if (typeof options === 'function') {
    done = options
    options = {}
  } else if (!options) {
    options = {}
  }

  // convert the limit to an integer
  var limit = null
  if (typeof options.limit === 'number')
    limit = options.limit
  if (typeof options.limit === 'string')
    limit = bytes(options.limit)

  // convert the expected length to an integer
  var length = null
  if (!isNaN(options.length))
    length = parseInt(options.length, 10)

  // check the length and limit options.
  // note: we intentionally leave the stream paused,
  // so users should handle the stream themselves.
  if (limit !== null && length !== null && length > limit) {
    process.nextTick(function () {
      var err = new Error('request entity too large')
      err.type = 'entity.too.large'
      err.status = err.statusCode = 413
      err.length = length
      err.limit = limit
      done(err)
    })
    return defer
  }

  var received = 0
  var buffers = []

  stream.on('data', onData)
  stream.once('end', onEnd)
  stream.once('error', onEnd)
  stream.once('close', cleanup)

  return defer

  // yieldable support
  function defer(fn) {
    done = fn
  }

  function onData(chunk) {
    buffers.push(chunk)
    received += chunk.length

    if (limit !== null && received > limit) {
      if (typeof stream.pause === 'function')
        stream.pause()
      var err = new Error('request entity too large')
      err.type = 'entity.too.large'
      err.status = err.statusCode = 413
      err.received = received
      err.limit = limit
      done(err)
      cleanup()
    }
  }

  function onEnd(err) {
    if (err) {
      done(err)
    } else if (length !== null && received !== length) {
      var state = stream._readableState
      if (!state || state.encoding === null) {
        err = new Error('request size did not match content length')
        err.type = 'request.size.invalid'
        err.status = err.statusCode = 400
        err.received = received
        err.length = length
        done(err)
      } else {
        err = new Error('raw-body expects a buffer stream, but a string chunk was received. please do not set an encoding')
        err.status = 500
        done(err)
      }
      if (typeof stream.pause === 'function')
        stream.pause()
    } else {
      done(null, Buffer.concat(buffers))
    }

    cleanup()
  }

  function cleanup() {
    received = buffers = null

    stream.removeListener('data', onData)
    stream.removeListener('end', onEnd)
    stream.removeListener('error', onEnd)
    stream.removeListener('close', cleanup)
  }
}