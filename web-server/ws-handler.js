const SpeechToText = require("../speech-to-text");
const VAD = require("node-vad");
const { punctuate } = require('../punctuation-server/punctuation')

const device = SpeechToText.getAudioInputDevices()[0]
let options = {
    source: device.id,
    vadMode: VAD.Mode.AGGRESSIVE,
    silenceThreshold: 200
}

let stt = null;
function startStt(_options) {
    options = _options;

    stt = new SpeechToText(_options);
    stt
        .on('recognize', results => {
            punctuate(results.text).then(result => {
                broadcast('recognized', result.text)
            })
        })
        .on('intermediate', results => broadcast('intermediate-result', results))
        .on('speech-start', _ => broadcast('speech-start'))
        .on('speech-end', _ => broadcast('speech-end'))
        .on('speech-pause', _ => broadcast('speech-pause'))
        .on('speech', _ => broadcast('speech'))
        .on('silence', _ => broadcast('silence'))
        .on('start', _ => broadcast('start'))
        .on('stop', _ => broadcast('stop'))
    stt.start();
}

function stopStt() {
    if (!stt) return;

    stt.stop();
    stt = null;
}

function broadcast(message, data = null) {
    ws.getWss().clients.forEach(client => client.send(JSON.stringify({message, data})))
}

let ws = null;

function wsHandler(_ws) {
    ws = _ws;

    return {
        process(data) {
            switch (data.message) {
                case 'start':
                    stopStt()
                    startStt(data.data)
                    break;

                case 'stop':
                    stopStt()
                    break;
            }
        },
        handleStatusReq(req, res) {
            res.send({
                options,
                isActive: stt !== null,
                devices: SpeechToText.getAudioInputDevices()
            })
        }
    }
}

module.exports = wsHandler;

