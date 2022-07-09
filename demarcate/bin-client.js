#!/usr/bin/env -S node

const given = f => f();
const { createWriteStream } = require("fs");
const { basename, join } = require("path");
const { HOST_SETUP_PORT, DEMARCATE_NODE_MODULES } = process.env;
const structured = require("/.demarcate/node_modules/structured-stream");

const toStdio = given((
    stdio = [process.stdin, process.stdout, process.stderr]) =>
    fd => stdio[fd] || (stdio[fd] = createWriteStream(null, { fd })));


(async function ()
{
    const [command, ...args] = process.argv.slice(1);
    // lsof -aU -d 0-999 -p PID
    // then take only 0-last that are consecutive.
    const stdioLength = 4;//process.stdio.length;

    structured({ port: HOST_SETUP_PORT, host: "host.docker.internal"},
    {
        start: ({ write }) =>
            write(command, stdioLength, args.length, ...args),
        stdio: async({ read }) =>
            toStdio(await read.UInt32BE()).write(await read.buffer()),
        exited: async ({ read }) => process.exit(await read.UInt32BE())
    });
})();
