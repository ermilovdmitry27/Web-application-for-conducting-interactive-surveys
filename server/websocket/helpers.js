const WebSocketLib = require("ws");

const WebSocket = WebSocketLib.WebSocket || WebSocketLib;

function sendWsJson(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

function parseWsMessage(rawValue) {
  try {
    return JSON.parse(String(rawValue));
  } catch (_error) {
    return null;
  }
}

function createWsRoomHelpers(wsRooms) {
  function joinWsRoom(ws, roomName) {
    if (!roomName) {
      return;
    }
    if (!ws.rooms) {
      ws.rooms = new Set();
    }
    if (ws.rooms.has(roomName)) {
      return;
    }
    let members = wsRooms.get(roomName);
    if (!members) {
      members = new Set();
      wsRooms.set(roomName, members);
    }
    members.add(ws);
    ws.rooms.add(roomName);
  }

  function leaveWsRoom(ws, roomName) {
    if (!roomName || !ws.rooms?.has(roomName)) {
      return;
    }
    ws.rooms.delete(roomName);
    const members = wsRooms.get(roomName);
    if (!members) {
      return;
    }
    members.delete(ws);
    if (members.size === 0) {
      wsRooms.delete(roomName);
    }
  }

  function leaveAllWsRooms(ws) {
    if (!ws.rooms) {
      return;
    }
    Array.from(ws.rooms).forEach((roomName) => leaveWsRoom(ws, roomName));
  }

  function broadcastToRoom(roomName, payload) {
    const members = wsRooms.get(roomName);
    if (!members || members.size === 0) {
      return;
    }
    members.forEach((client) => {
      sendWsJson(client, payload);
    });
  }

  return {
    joinWsRoom,
    leaveWsRoom,
    leaveAllWsRooms,
    broadcastToRoom,
  };
}

module.exports = {
  sendWsJson,
  parseWsMessage,
  createWsRoomHelpers,
};
