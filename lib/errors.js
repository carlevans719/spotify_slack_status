// @ts-check

class BaseError extends Error {
  constructor (message) {
    super(message)
    
    this.name = this.constructor.name
    this.message = message

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor)
    } else {
      this.stack = (new Error(message)).stack
    }
  }
}

class InvalidNonceError extends BaseError {
  constructor (nonce) {
    super('Invalid Nonce: ' + nonce)
  }
}

class RequestError extends BaseError {
  constructor (message) {
    super('Request Error: ' + message)
  }
}

module.exports ={
  BaseError,
  InvalidNonceError,
  RequestError
}
