const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const bool = (v, d = false) => (v == null ? d : /^(1|true|yes|on)$/i.test(String(v)));
const num = (v, d) => (v == null || v === '' ? d : Number(v));

const config = {
  port: num(process.env.PORT, 4000),
  bind: process.env.BIND || '127.0.0.1',
  env: process.env.NODE_ENV || 'production',
  logLevel: process.env.LOG_LEVEL || 'info',

  crm: {
    baseUrl: (process.env.CRM_BACKEND_URL || '').replace(/\/+$/, ''),
    webhookPath: process.env.CRM_WEBHOOK_PATH || '/api/telephony/events',
    webhookApiKey: process.env.WEBHOOK_API_KEY || '',
    webhookHmacSecret: process.env.WEBHOOK_HMAC_SECRET || '',
  },

  // Inbound requests FROM the CRM are verified against these.
  inbound: {
    apiKey: process.env.CRM_API_KEY || '',
    hmacSecret: process.env.CRM_HMAC_SECRET || '',
    toleranceSec: num(process.env.CRM_REQUEST_TOLERANCE_SEC, 300),
  },

  ami: {
    host: process.env.AMI_HOST || '127.0.0.1',
    port: num(process.env.AMI_PORT, 5038),
    user: process.env.AMI_USER || 'crm',
    secret: process.env.AMI_SECRET || '',
    outboundContext: process.env.AMI_OUTBOUND_CONTEXT || 'crm-outbound',
    internalContext: process.env.AMI_INTERNAL_CONTEXT || 'crm-internal',
    transferContext: process.env.AMI_TRANSFER_CONTEXT || 'crm-transfer',
    agentChannelTemplate: process.env.AGENT_CHANNEL_TEMPLATE || 'PJSIP/{ext}',
  },

  // Map a CRM agent (email or id) → a SIP extension. JSON in the env, e.g.
  //   AGENT_EXTENSIONS={"asha@acme.com":"1001","ravi@acme.com":"1002"}
  // If an agentRef is already a bare 3–5 digit number it's used as-is.
  agentExtensions: (() => {
    try {
      return JSON.parse(process.env.AGENT_EXTENSIONS || '{}');
    } catch (e) {
      return {};
    }
  })(),

  vicidial: {
    enabled: bool(process.env.VICIDIAL_ENABLED, false),
    db: {
      host: process.env.VICIDIAL_DB_HOST || '127.0.0.1',
      port: num(process.env.VICIDIAL_DB_PORT, 3306),
      database: process.env.VICIDIAL_DB_NAME || 'asterisk',
      user: process.env.VICIDIAL_DB_USER || 'cron',
      password: process.env.VICIDIAL_DB_PASS || '',
    },
    apiBase: (process.env.VICIDIAL_API_BASE || 'http://127.0.0.1/vicidial').replace(/\/+$/, ''),
    apiUser: process.env.VICIDIAL_API_USER || '',
    apiPass: process.env.VICIDIAL_API_PASS || '',
  },

  recordings: {
    dir: process.env.RECORDINGS_DIR || '/var/spool/asterisk/monitor',
    maxMb: num(process.env.RECORDINGS_MAX_MB, 200),
  },

  queue: {
    dir: process.env.QUEUE_DIR || path.join(__dirname, '../../data/queue'),
    maxAttempts: num(process.env.QUEUE_MAX_ATTEMPTS, 20),
  },

  // SIP provider — placeholders. `sipOutboundEnabled` is the master switch
  // the rest of the service reads; PSTN originate is blocked while false.
  sip: {
    server: process.env.SIP_SERVER || '',
    username: process.env.SIP_USERNAME || '',
    password: process.env.SIP_PASSWORD || '',
    port: process.env.SIP_PORT || '',
    transport: (process.env.SIP_TRANSPORT || '').toLowerCase(),
    authMode: (process.env.SIP_AUTH_MODE || '').toLowerCase(),
    did: process.env.SIP_DID || '',
    codecs: process.env.SIP_CODECS || '',
    nat: process.env.SIP_NAT || '',
    outboundEnabled: bool(process.env.SIP_OUTBOUND_ENABLED, false),
    inboundEnabled: bool(process.env.SIP_INBOUND_ENABLED, false),
  },
};

config.ready = {
  crm: !!(config.crm.baseUrl && config.crm.webhookHmacSecret),
  inbound: !!config.inbound.hmacSecret,
  ami: !!config.ami.secret,
  sipOutbound: config.sip.outboundEnabled && !!config.sip.server,
};

module.exports = config;
