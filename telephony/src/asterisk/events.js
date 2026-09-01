const ami = require('./ami');
const { sendEvent } = require('../crm/client');
const { logger } = require('../lib/logger');

// Translate raw AMI events into the normalised CRM event vocabulary:
//   call.started | call.ringing | call.answered | call.hold |
//   call.ended   | recording.ready | transfer.completed | agent.status
//
// Correlation: we carry CRMCALLID as a channel variable on every
// originated call (set in the dialplan / Originate Variable), and AMI
// echoes it back on channel events as `ChanVariable(CRMCALLID)` when
// available; we also track Uniqueid / Linkedid.

// uniqueid -> { crmCallId, phase }
const calls = new Map();

function pickCrmId(e) {
  return (
    e.CRMCALLID ||
    e['ChanVariable(CRMCALLID)'] ||
    e.Variable ||
    (calls.get(e.Uniqueid) && calls.get(e.Uniqueid).crmCallId) ||
    undefined
  );
}

function base(e) {
  return {
    uniqueid: e.Uniqueid,
    linkedid: e.Linkedid,
    crmCallId: pickCrmId(e),
    channel: e.Channel,
    callerId: e.CallerIDNum,
  };
}

function attach() {
  ami.on('event', async (e) => {
    try {
      switch (e.Event) {
        case 'Newchannel': {
          if (!e.Uniqueid) return;
          const crmCallId = pickCrmId(e);
          calls.set(e.Uniqueid, { crmCallId, phase: 'new' });
          break;
        }

        case 'DialBegin': {
          // outbound leg starting toward the customer
          await sendEvent('call.started', {
            ...base(e),
            phone: e.DialString || e.DestCallerIDNum,
            direction: 'Outbound',
            status: 'dialing',
          });
          break;
        }

        case 'Newstate': {
          const st = (e.ChannelStateDesc || '').toLowerCase();
          if (st === 'ringing' || st === 'ring') {
            await sendEvent('call.ringing', { ...base(e), status: 'ringing' });
          } else if (st === 'up') {
            await sendEvent('call.answered', { ...base(e), status: 'answered' });
          }
          break;
        }

        case 'BridgeEnter': {
          // both legs bridged == answered/connected
          await sendEvent('call.answered', { ...base(e), status: 'answered' });
          break;
        }

        case 'Hold':
          await sendEvent('call.hold', { ...base(e), on: true });
          break;
        case 'Unhold':
          await sendEvent('call.hold', { ...base(e), on: false });
          break;

        case 'Hangup': {
          const info = calls.get(e.Uniqueid) || {};
          await sendEvent('call.ended', {
            ...base(e),
            status: e.Cause === '16' ? 'ANSWER' : 'NO_ANSWER',
            hangupCause: e['Cause-txt'] || e.Cause,
            recordingExpected: !!info.recording,
            recordingReference: info.recordingFile,
          });
          calls.delete(e.Uniqueid);
          break;
        }

        case 'MixMonitorStart': {
          const info = calls.get(e.Uniqueid) || {};
          info.recording = true;
          info.recordingFile = e.File || e.Filename;
          calls.set(e.Uniqueid, info);
          break;
        }

        case 'MixMonitorStop': {
          const info = calls.get(e.Uniqueid) || {};
          await sendEvent('recording.ready', {
            ...base(e),
            reference: info.recordingFile || e.File,
          });
          break;
        }

        case 'AttendedTransfer':
        case 'BlindTransfer': {
          await sendEvent('transfer.completed', {
            ...base(e),
            target: e.TransfereeChannel || e.Extension || e.Exten,
            newUniqueId: e.SecondTransfererUniqueid || e.TransfereeUniqueid,
          });
          break;
        }

        // VICIdial writes agent state to the DB; if AMI carries a custom
        // UserEvent for agent status we forward it too.
        case 'UserEvent': {
          if (e.UserEvent === 'AgentStatus') {
            await sendEvent('agent.status', {
              agentId: e.AgentId || e.CRMAGENTID,
              status: e.Status,
              agentName: e.AgentName,
            });
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      logger.warn({ event: e.Event, err: err.message }, 'AMI event handling error');
    }
  });
}

// Called by the API when it originates a call, so subsequent AMI events
// can be correlated to the CRM call id even before ChanVariable arrives.
function trackOrigination(uniqueid, crmCallId) {
  if (uniqueid) calls.set(uniqueid, { crmCallId, phase: 'originating' });
}

module.exports = { attach, trackOrigination, calls };
