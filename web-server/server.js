require('dotenv').config()

const express = require('express')
const open = require('open');
const wsHandler = require("./ws-handler");
const path = require("path");

const app = express()
const port = 6272
const expressWs = require('express-ws')(app);
const handler = wsHandler(expressWs)

app.use('/', express.static(path.resolve(__dirname, "static")))

app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, "static/index.html"))
})

app.get('/status', handler.handleStatusReq)

app.ws('/', function(ws, req) {
    ws.on('message', e => handler.process(JSON.parse(e)));
});

app.listen(port, () => {
    console.log(`app listening on port ${port}`)
    open(`http://127.0.0.1:${port}`);
})
