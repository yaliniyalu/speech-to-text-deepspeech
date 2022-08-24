const {PythonShell} = require('python-shell');
const path = require("path");

let inc = 1;
const resolvers = []

let shell = new PythonShell(path.resolve(__dirname, 'server.py'), {mode: "text", pythonPath: process.env.PYTHON_PATH, pythonOptions: ['-u']});

shell.on('message', function (message) {
    try {
        const data = JSON.parse(message)
        const index = resolvers.findIndex(value => value.id === data.id)
        if (index < 0) return

        const values = resolvers.slice(0, index + 1)
        values.splice(-1, 1)[0].resolve(data)

        values.forEach(v => v.reject())
    } catch (e) {
    }
});

shell.on('stderr', console.log);
shell.on('pythonError', console.log);

async function punctuate(text) {
    return new Promise((resolve, reject) => {
        const id = inc ++;
        resolvers.push({id, resolve, reject});
        shell.send(JSON.stringify({text, id}));
    })
}

module.exports = {
    punctuate
}
