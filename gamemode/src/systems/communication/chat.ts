// ── Chat System ───────────────────────────────────────────────────────────────
// Sends chat messages to players via a gamemode property (ff_chatMsg).
// Initialises the chat widget inside the browser via a makeEventSource that
// listens for the 'front-loaded' browser message, then forwards every
// 'cef::chat:send' message back to the server as a customEvent.
//
// The server-side handler for mp['cef::chat:send'] is registered in index.ts.

import { safeSet } from '../../core/mpUtil'
import type { Mp, Store } from '../../types'

const CHAT_MSG_PROP = 'ff_chatMsg'

// Runs in the Skyrim Platform JS runtime (NOT the browser) when ff_chatMsg is
// set on the owner's actor.  Uses ctx.sp.browser.executeJavaScript to inject
// the message into the browser's window.chatMessages and refresh the widget.
// Runs in the SP runtime on every game tick while ff_chatMsg is set.
// Only fires executeJavaScript once per unique message value (ctx.state.last dedup).
// Calls the pre-defined window._ffChatPush helper to keep the IPC payload tiny.
const UPDATE_OWNER_JS = `
  if (ctx.value === undefined || ctx.value === null) return;
  if (ctx.state.last === ctx.value) return;
  ctx.state.last = ctx.value;
  ctx.sp.browser.executeJavaScript('window._ffChatPush(' + JSON.stringify(String(ctx.value)) + ')');
`.trim()

// Runs once per client in the Skyrim Platform JS runtime (NOT the browser).
// Defines window._ffChatPush in the browser (so UPDATE_OWNER_JS IPC is tiny),
// sets up the chat widget, and wires the send path back to the server.
const EVENT_SOURCE_JS = `
  var initChatJs =
    'window._ffChatPush = function(msg) {' +
    '  if (!Array.isArray(window.chatMessages)) window.chatMessages = [];' +
    '  window.chatMessages.push(msg);' +
    '  while (window.chatMessages.length > 50) window.chatMessages.shift();' +
    '  var ws = window.skyrimPlatform.widgets.get();' +
    '  var found = false;' +
    '  for (var i = 0; i < ws.length; i++) {' +
    '    if (ws[i] && ws[i].type === "chat") {' +
    '      var copy = ws.slice();' +
    '      copy[i] = Object.assign({}, copy[i], { messages: window.chatMessages.slice() });' +
    '      window.skyrimPlatform.widgets.set(copy);' +
    '      found = true; break;' +
    '    }' +
    '  }' +
    '  if (!found) {' +
    '    window.skyrimPlatform.widgets.set([{type:"chat",messages:window.chatMessages.slice(),' +
    '      send:function(t){window.skyrimPlatform.sendMessage("cef::chat:send",t);},' +
    '      placeholder:"",isInputHidden:false}]);' +
    '  }' +
    '  if (typeof window.scrollToLastMessage === "function") window.scrollToLastMessage();' +
    '};' +
    'if (!Array.isArray(window.chatMessages)) window.chatMessages = [];' +
    'window.skyrimPlatform.widgets.set([{type:"chat",messages:window.chatMessages,' +
    '  send:function(t){window.skyrimPlatform.sendMessage("cef::chat:send",t);},' +
    '  placeholder:"",isInputHidden:false}]);';
  ctx.sp.browser.executeJavaScript(initChatJs);
  ctx.sp.on('browserMessage', function(event) {
    var key = event.arguments[0];
    if (key === 'front-loaded') {
      ctx.sp.browser.executeJavaScript(initChatJs);
    }
    if (key === 'cef::chat:send') {
      ctx.sendEvent(event.arguments[1]);
    }
  });
`.trim()

export function init(mp: Mp): void {
  mp.makeProperty(CHAT_MSG_PROP, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: UPDATE_OWNER_JS,
    updateNeighbor: '',
  })

  mp.makeEventSource('cef_chat_send', EVENT_SOURCE_JS)

  console.log('[chat] property and event source registered')
}

export function broadcast(mp: Mp, store: Store, message: string): void {
  for (const player of store.getAll()) {
    safeSet(mp, player.actorId, CHAT_MSG_PROP, message)
  }
}

export function sendToPlayer(mp: Mp, store: Store, userId: number, message: string): void {
  const player = store.get(userId)
  if (!player) return
  safeSet(mp, player.actorId, CHAT_MSG_PROP, message)
}
