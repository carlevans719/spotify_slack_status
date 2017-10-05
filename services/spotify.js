// @ts-check

const { EventEmitter } = require('events')
const util = require('../lib/util')
const errors = require('../lib/errors')

class SpotifyService extends EventEmitter {
  constructor (config, db) {
    super()

    this.STATES = {
      INITIALISING: 'init',
      READY: 'ready',
      MISSING_ACCESS_TOKEN: 'missing_access_token',
      MISSING_APP_INFO: 'missing_app_info'
    }
    this._state = this.STATES.INITIALISING
    
    this.DB_KEYS = {
      TOKENS: 'spotify.access_tokens',
      APP_INFO: 'spotify.app_info',
      NONCES: 'spotify.nonces'
    }

    this.EVENTS = {
      STATE_CHANGED: 'state_change',
      NOW_PLAYING_CHANGED: 'now_playing_changed'
    }
    
    this.REQUIRED_SCOPES = ['user-read-currently-playing']
    
    this.errors = errors

    const SpotifyWebApi = require('spotify-web-api-node')
    /** @type {*} */ this.api = new SpotifyWebApi(config.app)
    /** @type {*} */ this._config = config
    /** @type {*} */ this.db = db

    this.on(this.EVENTS.STATE_CHANGED, (newState) => {
      if (newState === this.STATES.READY) {
        this.startPollingApi()
      } else {
        this.stopPollingApi()
      }
    })
  }

  /**
   * Perform startup actions like authorization with the API
   *
   * @description
   * 1. look for access_token
   *   a. valid? status === 'ready'
   *   b. fixed with refresh? status === 'ready'
   * 
   * 2. look for clientId + clientSecret
   *   a. present? status === 'missing_access_token'
   *   b. missing? status === 'missing_app_info'
   * 
   * @memberof SpotifyService
   */
  async init () {
    // 1.
    const tokens = await this.db.getOne(this.DB_KEYS.TOKENS)
    if (tokens) {
      try {
        // 1a.
        return await this.setTokens(tokens)
      } catch (ex) {
        console.error(ex.message)
        try {
          await this.refreshTokens()
          return await this.setTokens(tokens)
        } catch (ex_1) {
          console.error(ex_1.message)
          await this.db.remove(this.DB_KEYS.TOKENS)
          // fall through to #2
        }
      }
    }

    // 2.
    const appInfo = await this.db.getOne(this.DB_KEYS.APP_INFO)
    this._appInfo = appInfo || {}
    if (appInfo) {
      // 2a.
      return await this.setState(this.STATES.MISSING_ACCESS_TOKEN)
    } else {
      // 2b.
      return await this.setState(this.STATES.MISSING_APP_INFO)
    }
  }

  /**
   * Set the Service's State
   * 
   * @param {string} state The new state
   * @memberof SpotifyService
   */
  async setState (state) {
    const oldState = this._state
    this._state = state

    if (state !== oldState) {
      this.emit(this.EVENTS.STATE_CHANGED, state)
    }
  }

  /**
   * Get the Service's State
   * 
   * @returns {Promise<string>} The state
   * @memberof SpotifyService
   */
  async getState () {
    return this._state
  }

  /**
   * Set the Service's appInfo (clientId, clientSecret & recirectUri)
   *
   * @param {{clientId: string, clientSecret: string, redirectUri: string}} appInfo The app info
   * @memberof SpotifyService
   */
  async setAppInfo (appInfo) {
    if (typeof appInfo !== 'object' || !appInfo) {
      return
    }

    const currentAppInfo = await this.getAppInfo()
    if (currentAppInfo.clientId !== appInfo.clientId ||
      currentAppInfo.clientSecret !== appInfo.clientSecret ||
      currentAppInfo.redirectUri !== appInfo.redirectUri) {
        await this.db.remove(this.DB_KEYS.TOKENS)
        this._appInfo = appInfo
        this.api.setRedirectURI(appInfo.redirectUri)
        this.api.setClientId(appInfo.clientId)
        this.api.setClientSecret(appInfo.clientSecret)
        await this.db.set(this.DB_KEYS.APP_INFO, appInfo)
        await this.setState(this.STATES.MISSING_ACCESS_TOKEN)
    }
  }

  /**
   * Get the cached appInfo
   *
   * @returns {Promise<{clientId: string, clientSecret: string, redirectUri: string}>} The app info
   * @memberof SpotifyService
   */
  async getAppInfo () {
    return this._appInfo
  }

  /**
   * Cache the supplied tokens, store them in the db and update the api
   *
   * @param {{access: string, refresh: string}} tokens 
   * @memberof SpotifyService
   */
  async setTokens (tokens) {
    if (typeof tokens !== 'object' || !tokens) {
      return
    }

    const currentTokens = await this.getTokens()
    if (currentTokens.access !== tokens.access ||
      currentTokens.refresh !== tokens.refresh) {
        this.api.setAccessToken(tokens.access)
        this.api.setRefreshToken(tokens.refresh)

        // Will throw if the tokens are bad
        await this.getNowPlaying()

        this._tokens = tokens
        await this.db.remove(this.DB_KEYS.TOKENS)
        await this.db.set(this.DB_KEYS.TOKENS, tokens)

        return await this.setState(this.STATES.READY)
    }
  }

  /**
   * Get the cached access & refresh tokens
   *
   * @returns {Promise<{access: string, refresh: string}>}
   * @memberof SpotifyService
   */
  async getTokens () {
    return this._tokens || {access: null, refresh: null}
  }

  /**
   * Refresh the access tokens
   *
   * @memberof SpotifyService
   */
  async refreshTokens () {
    const data = await this.api.refreshAccessToken()

    if (data && data.body) {
      const refreshToken = this.getTokens()
        ? (await this.getTokens()).refresh
        : data.body.refreshToken

      this.setTokens({
        access: data.body.access_token,
        refresh: refreshToken
      })
    }
  }

  /**
   * Generates a new nonce and stores it in the database
   *
   * @returns {Promise<string>} the nonce
   * @memberof SpotifyService
   */
  async getNewNonce () {
    const doc = await this.db.getOne(this.DB_KEYS.NONCES) || {nonces: []}
    const { nonces } = doc

    const newNonce = util.uuid.v4()
    nonces.push(newNonce)

    await this.db.set(this.DB_KEYS.NONCES, {nonces})

    return newNonce
  }

  /**
   * Verifies that a given nonce is known to this Service
   *
   * @param {string} nonce The nonce to check
   * @returns {Promise<boolean>} true on success
   * @memberof SpotifyService
   */
  async verifyNonce (nonce) {
    const doc = await this.db.getOne(this.DB_KEYS.NONCES) || {nonces: []}
    const { nonces } = doc

    const isValid = nonces.includes(nonce)

    if (isValid) {
      nonces.splice(nonces.indexOf(nonce), 1)
      await this.db.set(this.DB_KEYS.NONCES, {nonces})
    } else {
      console.log(nonces)
      throw new this.errors.InvalidNonceError(nonce)
    }

    return isValid
  }

  /**
   * Get a URI which the user can authorise this app with
   *
   * @returns {Promise<string>} The uri
   * @memberof SpotifyService
   */
  async getAuthUri () {
    return this.api.createAuthorizeURL(this.REQUIRED_SCOPES, await this.getNewNonce())
  }

  /**
   * Convert a code to access and refresh tokens
   * 
   * @param {string} code the access code
   * @param {string} state the nonce
   * @memberof SpotifyService
   */
  async codeToTokens (code, state) {
    await this.verifyNonce(state)

    const data = await this.api.authorizationCodeGrant(code)

    await this.setTokens({
      access: data.body.access_token,
      refresh: data.body.refresh_token
    })
  }

  /**
   * Get the currently playing tract
   *
   * @returns {Promise<string>}
   * @memberof SpotifyService
   */
  async getNowPlaying () {
    const getMyCurrentPlayingTrack = util.promisify(this.api.getMyCurrentPlayingTrack)

    let res
    try {
      res = await getMyCurrentPlayingTrack.call(this.api, {})
    } catch (ex) {
      console.error(ex.message)

      try {
        await this.refreshTokens()
        res = await getMyCurrentPlayingTrack.call(this.api, {})
      } catch (ex_1) {
        console.error(ex_1.message)
        this.setState(this.STATES.MISSING_ACCESS_TOKEN)
        throw new this.errors.RequestError(ex.message)
      }
    }

    if (res && res.body && res.body.item) {
      const artists = res.body.item.artists.map((artist) => artist.name).join(' & ')
      const trackName = res.body.item.name

      const track = artists + ' - ' + trackName
      console.log(track)
      if (this._nowPlaying !== track) {
        this._nowPlaying = track
        this.emit(this.EVENTS.NOW_PLAYING_CHANGED, track)
      }

      return track
    }
  }

  async startPollingApi () {
    this._timer = setInterval(
      this.getNowPlaying.bind(this),
      this._config.pollInterval
    )
  }

  async stopPollingApi () {
    clearInterval(this._timer)
    this._timer = null
  }
}

module.exports.SpotifyService = SpotifyService
