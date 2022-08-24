const fs = require("fs")
const path = require("path");

if (process.platform === "win32") {
    const search = "var cmd = 'which ' + name;"
    const replace = "var cmd = 'where.exe ' + name;"
    const filePath = path.resolve(__dirname, "node_modules\\sox-audio\\lib\\utils.js");

    let contents = fs.readFileSync(filePath);
    contents = contents.toString().replace(search, replace)
    fs.writeFileSync(filePath, contents)
}
