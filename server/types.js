// Shared JSDoc typedefs for ModelHub.
// Imported via `import('/server/types.js')` only for editors; no runtime effect.

/**
 * @typedef {Object} Provider
 * @property {string} name        Unique provider id (e.g. "openai")
 * @property {string} label       Display name
 * @property {string} baseURL     OpenAI-compatible chat/completions base URL
 * @property {string} [authId]    Key into auth.json, or "env:NAME"
 * @property {boolean} [needsKey] Whether an API key is required
 * @property {boolean} [keyOk]    Resolved at runtime
 * @property {string} [keyUrl]    Signup URL
 * @property {Array<{name:string, free?:boolean}>} models
 */

/**
 * @typedef {Object} Model
 * @property {string} id           `${provider}/${name}`
 * @property {string} provider
 * @property {string} label
 * @property {string} name
 * @property {string} baseURL
 * @property {string} [authId]
 * @property {boolean} needsKey
 * @property {boolean} free
 * @property {boolean} keyOk
 * @property {boolean} enabled
 * @property {boolean} healthy
 * @property {number} fails
 * @property {number} failUntil
 * @property {boolean} halfOpen
 * @property {string} lastError
 * @property {number} lastLatencyMs
 * @property {number} requests
 * @property {number} tokens
 * @property {string} day
 * @property {number} dailyReq
 * @property {number} dailyTok
 * @property {number} cost
 * @property {number} dailyCost
 * @property {number} lifetimeFails
 * @property {number} lastTTFTMs
 * @property {number} avgTTFTMs
 * @property {boolean} [verified]
 * @property {number} [lastVerifiedAt]
 */

/**
 * @typedef {Object} EnhancerCfg
 * @property {boolean} enabled
 * @property {string|null} model
 * @property {number} maxChars
 * @property {number} timeoutMs
 * @property {string[]} plugins
 */

/**
 * @typedef {Object} AppState
 * @property {import('node:http').Agent} UA_HTTP
 * @property {import('node:https').Agent} UA_HTTPS
 * @property {Map<string,Model>} modelMap
 * @property {Model[]} models
 * @property {object} config
 * @property {object} auth
 * @property {object} prefs
 * @property {object} pricing
 */

/**
 * @typedef {Object} ChatBody
 * @property {string} model
 * @property {Array<{role:string, content:any}>} messages
 * @property {boolean} [stream]
 * @property {number} [max_tokens]
 * @property {number} [temperature]
 * @property {object} [tools]
 */

module.exports = {};
