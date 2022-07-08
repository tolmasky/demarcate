const { hasOwnProperty } = Object;

const { join, normalize } = require("path");
const net = require("net");
const toRead = require("framed/to-read");
const toWrite = require("framed/to-write");

const { spawn } = require("child_process");

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
        connection =>
            handle({ handlers, mappings }, connection));

    await new Promise((resolve, reject) =>
        server.listen({ port: 0 }, () => Promise
            .resolve(f({ volumes, port: server.address().port }))
            .then(resolve, reject)));
}

async function handle({ handlers, mappings }, connection)
{
    const read = toRead(connection);
    const write = toWrite(connection);

    const command = await read.string();
    const args = (await read.strings())
        .map(argument => toLocalPath(mappings, argument));

    await handlers[command](write, ...args);
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

const toRemoteBin = command => async function (write, ...args)
{
    const process = spawn(command, args);

    process.stdout.on("data", data => write("stdout", data));
    process.stderr.on("data", data => write("stderr", data));

    process.on("close", exitCode => write("exited", exitCode));
}

const toFunctionBin = command => async function (write, ...args)
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