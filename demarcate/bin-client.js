#!/usr/bin/env -S node

const { basename, join } = require("path");
const { HOST_SETUP_PORT, DEMARCATE_NODE_MODULES } = process.env;
const structured =
    require("/.demarcate/node_modules/structured-stream/client");


(async function ()
{
    const [command, ...args] = process.argv.slice(1);

    structured({ port: HOST_SETUP_PORT, host: "host.docker.internal"},
    {
        start: ({ write }) => write(command, args.length, ...args),
        stdout: async ({ read }) => process.stdout.write(await read.buffer()),
        stderr: async ({ read }) => process.stderr.write(await read.buffer()),
        exited: async ({ read }) => process.exit(await read.UInt32BE())
    });
})();
