// @ts-check

class SlackService {
  constructor (config, db) {
    const { WebClient } = require('@slack/client')
    this.api = new WebClient(config.token)

    this.emojis = config.emojis || this._getDefaultEmojis()
  }

  _getDefaultEmojis () {
    const emojis = [
      ':headphones:',
      ':musical_keyboard:',
      ':musical_note:',
      ':musical_score:',
      ':guitar:'
    ]

    return emojis
  }

  randomEmoji () {
    const idx = Math.floor(Math.random() * (this.emojis.length + 1))
    return this.emojis[idx]
  }

  clearStatus () {
    return this.setStatus()
  }

  setStatus (text = '', emoji = this.randomEmoji()) {
    this.api['users.profile'].set({
      profile: {
        status_text: text,
        status_emoji: emoji
      }
    })
  }
}

module.exports.SlackService = SlackService
