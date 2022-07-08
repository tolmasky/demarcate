const { hasOwnProperty } = Object;

const { join, normalize } = require("path");
const { spawn } = require("child_process");
const net = require("net");

const toRead = require("structured-stream/to-read");
const toWrite = require("structured-stream/to-write");

const binClientPath = require.resolve("./bin-client.js");


module.exports = async function binServer({ bin, volumes: inVolumes }, f)
{
    if (!bin || Object.keys(bin).length <= 0)
        return Promise.resolve(f({ volumes: inVolumes, port: false }));

    const handlers = Object.fromEntries(Object
        .entries(bin)
        .map(([key, value]) => [key, value === true ? key : value])
        .map(([key, command]) =>
        [
            `/usr/bin/${key}`,
            typeof command === "function" ?
                toFunctionBin(command) :
                toRemoteBin(command)
        ]));

    const volumes =
    [
        ...Object
            .keys(handlers)
            .map(to => ({ from: binClientPath, to, readonly: true })),
        ...inVolumes
    ];
    const mappings = Object
        .fromEntries(volumes
            .map(({ from, to }) => [normalize(to).replace(/\/+$/, ""), from]));

    const server = net.createServer(
        stream =>
            handle({ handlers, mappings }, stream));

    await new Promise((resolve, reject) =>
        server.listen({ port: 0 }, () => Promise
            .resolve(f({ volumes, port: server.address().port }))
            .then(resolve, reject)));
}

async function handle({ handlers, mappings }, stream)
{
    const read = toRead(stream);
    const write = toWrite(stream);

    const command = await read.string();
    const args = (await read.strings())
        .map(argument => toLocalPath(mappings, argument));

    await handlers[command](stream, write, ...args);
}

function toLocalPath(mappings, argument)
{
    if (!argument.startsWith("/"))
        return argument;

    const path = normalize(argument);

    if (hasOwnProperty.call(mappings, path))
        return mappings[path];

    const prefix = Object
        .keys(mappings)
        .find(prefix => path.startsWith(`${prefix}/`));

    if (!prefix)
        return argument;

    return join(mappings[prefix], path.replace(`${prefix}/`, ""));
}

const toRemoteBin = command => async function (stream, write, ...args)
{
    const process = spawn(command, args);

    stream.on("close", () => kill(process.pid));
    stream.on("error", () => kill(process.pid));

    process.stdout.on("data", data => write("stdout", data));
    process.stderr.on("data", data => write("stderr", data));

    process.on("close", (exitCode, signal) =>
        exitCode !== null && write("exited", exitCode));
}

const toFunctionBin = command => async function (stream, write, ...args)
{
    try
    {
        write("stdout", await command(...args));
        write("exited", 0);
    }
    catch (error)
    {
        write("stderr", error + "");
        write("exited", 1);
    }
}

const kill = pid => require("ps-tree")
    (pid, (error, children) =>
        !error && spawn("kill",
        [
            "-s",
            "SIGINT",
            pid, ...children.map(process => process.PID)
        ]));
