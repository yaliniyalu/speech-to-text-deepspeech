const VAD = require("node-vad");
const DeepSpeech = require("deepspeech");
const portAudio = require("naudiodon");
const Stream = require("stream");
const SoxAudio = require("sox-audio");
const events = require('events');

class SpeechToText extends events.EventEmitter {
    constructor(options) {
        super();

        this.source = options.source;
        this.vadMode = options.vadMode ?? VAD.Mode.VERY_AGGRESSIVE;
        this.silenceThreshold = options.silenceThreshold ?? 200;

        this.englishModel = SpeechToText.createModel(process.env.DEEPSPEECH_MODEL_DIR);
        this.vad = new VAD(this.vadMode);

        this.modelStream = null;
        this.recordedChunks = 0;
        this.silenceStart = null;
        this.recordedAudioLength = 0;
        this.endTimeout = null;
        this.silenceBuffers = [];
        this.firstChunkVoice = false;
    }

    start() {
        this.startMicrophone((results) => {
            this.emit('recognize', results)
        })
        this.emit('start')
    }

    stop() {
        this.stopMicrophone()
        this.emit('stop')
    }

    static createModel(modelDir) {
        let modelPath = modelDir + '.pbmm';
        let scorerPath = modelDir + '.scorer';
        let model = new DeepSpeech.Model(modelPath);
        model.enableExternalScorer(scorerPath);
        return model;
    }

    static getAudioInputDevices() {
        return portAudio.getDevices().filter(value => value.maxInputChannels > 0)
    }

    createStream() {
        this.modelStream = this.englishModel.createStream();
        this.recordedChunks = 0;
        this.recordedAudioLength = 0;
    }

    processAudioStream(data, callback) {
        this.vad.processAudio(data, 16000)
            .then((res) => {
                if (this.firstChunkVoice) {
                    this.firstChunkVoice = false;
                    this.processVoice(data);
                    return;
                }

                switch (res) {
                    case VAD.Event.ERROR:
                        console.log("VAD ERROR");
                        break;
                    case VAD.Event.NOISE:
                        console.log("VAD NOISE");
                        break;
                    case VAD.Event.SILENCE:
                        this.processSilence(data, callback);
                        break;
                    case VAD.Event.VOICE:
                        this.processVoice(data);
                        break;
                    default:
                        console.log('default', res);
                }
            });

        // timeout after 1s of inactivity
        clearTimeout(this.endTimeout);
        this.endTimeout = setTimeout(() => {
            this.resetAudioStream();
        },this.silenceThreshold * 3);
    }

    startMicrophone(callback) {
        if (this.audioStream) {
            console.log('microphone exists');
            return;
        }

        this.createStream();

        const device = SpeechToText.getAudioInputDevices().find(value => value.id === this.source);
        if (!device) {
            console.log('device not found');
            return;
        }

        this.audioStream = new portAudio.AudioIO({
            inOptions: {
                channelCount: device.maxInputChannels,
                sampleFormat: portAudio.SampleFormat16Bit,
                sampleRate: device.defaultSampleRate,
                deviceId: device.id,
                closeOnError: true
            }
        });

        const file = require('fs').createWriteStream(__dirname + '/audio.raw');
        const writable = new Stream.Writable();
        writable.write = (chunk) => {
            file.write(chunk)
            this.processAudioStream(chunk, (results) => {
                callback(results);
            });
        }

        this.soxAudio = SoxAudio()
            .input(this.audioStream)
            .inputSampleRate(device.defaultSampleRate)
            .inputEncoding('signed')
            .inputBits(portAudio.SampleFormat16Bit)
            .inputChannels(device.maxInputChannels)
            .inputFileType('raw')

            .output(writable)
            .outputSampleRate(16000)
            .outputEncoding('signed')
            .outputBits(16)
            .outputChannels(1)
            .outputFileType('wav');

        this.soxAudio.run()
        this.audioStream.start();
    }

    stopMicrophone() {
        this.audioStream?.quit();
        this.audioStream = null;
        this.soxAudio = null;
        this.resetAudioStream();
    }

    resetAudioStream() {
        clearTimeout(this.endTimeout);
        this.intermediateDecode();
        this.recordedChunks = 0;
        this.silenceStart = null;
    }

    processSilence(data, callback) {
        if (this.recordedChunks > 0) { // recording is on
            this.emit('speech-pause') // silence detected while recording

            this.feedAudioContent(data);

            if (this.silenceStart === null) {
                this.silenceStart = new Date().getTime();
            }
            else {
                let now = new Date().getTime();
                if (now - this.silenceStart > this.silenceThreshold) {
                    this.silenceStart = null;
                    this.emit('speech-end')
                    let results = this.intermediateDecode();
                    if (results) {
                        if (callback) {
                            callback(results);
                        }
                    }
                }
            }
        }
        else {
            this.emit('silence') // silence detected while not recording
            this.bufferSilence(data);
        }
    }

    bufferSilence(data) {
        // VAD has a tendency to cut the first bit of audio data from the start of a recording
        // so keep a buffer of that first bit of audio and in addBufferedSilence() reattach it to the beginning of the recording
        this.silenceBuffers.push(data);
        if (this.silenceBuffers.length >= 3) {
            this.silenceBuffers.shift();
        }
    }

    addBufferedSilence(data) {
        let audioBuffer;
        if (this.silenceBuffers.length) {
            this.silenceBuffers.push(data);
            let length = 0;
            this.silenceBuffers.forEach(function (buf) {
                length += buf.length;
            });
            audioBuffer = Buffer.concat(this.silenceBuffers, length);
            this.silenceBuffers = [];
        }
        else audioBuffer = data;
        return audioBuffer;
    }

    processVoice(data) {
        this.silenceStart = null;
        if (this.recordedChunks === 0) {
            this.emit('speech-start') // recording started
        }
        else {
            this.emit('speech') // still recording
        }
        this.recordedChunks++;

        data = this.addBufferedSilence(data);
        this.feedAudioContent(data);

        this.emit('intermediate', this.modelStream?.intermediateDecode())
    }

    finishStream() {
        if (this.modelStream) {
            let start = new Date();
            let text = this.modelStream.finishStream();
            if (text) {
                let recogTime = new Date().getTime() - start.getTime();
                return {
                    text,
                    recogTime,
                    audioLength: Math.round(this.recordedAudioLength)
                };
            }
        }
        this.silenceBuffers = [];
        this.modelStream = null;
    }

    intermediateDecode() {
        let results = this.finishStream();
        this.createStream();
        return results;
    }

    feedAudioContent(chunk) {
        this.recordedAudioLength += (chunk.length / 2) * (1 / 16000) * 1000;
        this.modelStream.feedAudioContent(chunk);
    }
}

module.exports = SpeechToText;
