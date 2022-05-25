#!/usr/bin/env -S node --no-warnings

const { basename } = require("path");
const { HOST_SETUP_PORT } = process.env;


(async function ()
{
    const args = process.argv.slice(1);
    const { exitCode, stdout, stderr } = await remote(HOST_SETUP_PORT, args);

    if (stdout.length > 0)
        process.stdout.write(stdout);
    
    if (stderr.length > 0)
        process.stderr.write(stderr);

    if (exitCode > 0)
        process.exit(exitCode);
})();

async function remote (port, [command, ...args])
{
    const URL = `http://host.docker.internal:${port}/`;
    const { result, value } = await (await fetch(URL,
    {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, arguments: args })    
    })).json();

    if (result === "resolved")
        return value;

    if (hasOwnProperty.call(value, "value"))
        throw value.value;

    throw Object.assign(Error(value.error.message), value.error);
};
