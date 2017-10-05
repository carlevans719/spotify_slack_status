// @ts-check

const EventEmitter = require('events')

class WebserverService extends EventEmitter {
  constructor (config) {
    super()

    this._config = config

    this.EVENTS = {
      HOME_ROUTE: 'home_route_hit',
      AUTH_ROUTE: 'auth_route_hit'
    }

    const express = require('express')
    this._app = express()
    this._app.get('/', this.homeRouteCallbacks.bind(this))
    this._app.get('/auth', this.authRouteCallbacks.bind(this))
  }

  homeRouteCallbacks (req, res) {
    this.emit(this.EVENTS.HOME_ROUTE, req, res)
  }

  authRouteCallbacks (req, res) {
    this.emit(this.EVENTS.AUTH_ROUTE, req, res)    
  }

  start () {
    this._app.listen(this._config.port)
  }
}

module.exports.WebserverService = WebserverService
