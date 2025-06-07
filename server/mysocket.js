const expressWs = require('express-ws');
const WebSocket = require('ws');

// const log4js = require('log4js');
// const logger = log4js.getLogger();
// logger.level = 'debug';
const logger = require('./logger');

const meetings = {};

function attachWebSocket(app) {
    expressWs(app);
    app.ws('/meeting/:id', function (ws, req) {
        const meetingId = req.params.id;
        console.log('socket connected', meetingId);

        if (!meetings[meetingId]) {
            meetings[meetingId] = [];
        }

        meetings[meetingId].push(ws);

        ws.on('message', function (msg) {
            console.log('socket received:', msg);

            // if blob, convert to string
            if (msg instanceof Buffer) {
                msg = msg.toString();
                console.log('converted to string:', msg);
            }
            meetings[meetingId].forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(msg);
                }
            });
        });

        ws.on('close', function () {
            console.log('socket closed');
            let index = meetings[meetingId].indexOf(ws);
            if (index >= 0) {
                meetings[meetingId].splice(index, 1);
            }
        });
    });
}

module.exports = {
    attachWebSocket
};