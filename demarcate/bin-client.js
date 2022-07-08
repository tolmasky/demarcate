#!/usr/bin/env -S node

const { basename } = require("path");
const { HOST_SETUP_PORT } = process.env;
const framedClient = require("/home/runkitdev/tonic/develop/packages/framed/client");


(async function ()
{
    const [command, ...args] = process.argv.slice(1);

    framedClient({ port: HOST_SETUP_PORT, host: "host.docker.internal"},
    {
        start: ({ write }) => write(command, args.length, ...args),
        stdout: async ({ read }) => process.stdout.write(await read.buffer()),
        stderr: async ({ read }) => process.stderr.write(await read.buffer()),
        exited: async ({ read }) => process.exit(await read.UInt32BE())
    });
})();
