// @ts-check

const util = require('../lib/util')

class SpotifyService {
  constructor (config, db) {
    const SpotifyWebApi = require('spotify-web-api-node')
    /** @type {*} */
    this.api = new SpotifyWebApi(config.app)
    /** @type {*} */
    this.db = db
  }

  async init () {
    const tokens = await this.getTokens()
    await this.setTokens(tokens.access, tokens.refresh)
    // todo: check if tokens are good
  }

  async generateAndStoreState () {
    const states = await this.db.getOne('spotify.states')

    const state = util.uuid.v4()
    states.push(state)

    await this.db.set('spotify.states', states)

    return state
  }

  async verifyState (state) {
    const states = await this.db.getOne('spotify.states')

    const valid = states.includes(state)

    if (valid) {
      states.splice(states.indexOf(state), 1)
      await this.db.set('spotify.states', states)
    }

    return valid
  }

  async getAuthUri () {
    return this.api.createAuthorizeURL(['user-read-currently-playing'], await this.generateAndStoreState())
  }

  getRedirectUri () {
    // todo: get the hosted uri and return + some path
  }

  async codeToToken (code, state) {
    if (!(await this.verifyState(state))) {
      throw new Error('invalid_state')
    }

    const data = await this.api.authorizationCodeGrant(code)

    await this.setTokens(data.body.access_token, data.body.refresh_token)
  }

  async setTokens (access, refresh) {
    this.accessToken = access
    this.refreshToken = refresh

    this.api.setAccessToken(access)
    this.api.setRefreshToken(refresh)

    await this.db.set('spotify.tokens', {access, refresh})

    this.authed = true    
  }

  async getTokens () {
    return await this.db.getOne('spotify.tokens')
  }

  async getNowPlaying () {
    const getMyCurrentPlayingTrack = util.promisify(this.api.getMyCurrentPlayingTrack)
    const res = await getMyCurrentPlayingTrack.call(this.api, {})

    if (res && res.body && res.body.item) {
      const artists = res.body.item.artists.map((artist) => artist.name).join(' & ')
      const trackName = res.body.item.name

      return artists + ' - ' + trackName
    }
  }
}

module.exports.SpotifyService = SpotifyService
