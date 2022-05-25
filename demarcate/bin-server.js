const { hasOwnProperty } = Object;

const { join, normalize } = require("path");
const http = require("http");

const spawn = require("@await/spawn");

const binClientPath = require.resolve("./bin-client.js");

const toScript = command =>
    typeof command === "function" ?
        command :
        async (...arguments) =>
            await spawn(command, arguments, { rejectOnExitCode: false });


module.exports = async function binServer({ bin, volumes: inVolumes }, f)
{
    if (!bin || Object.keys(bin).length <= 0)
        return Promise.resolve(f({ volumes: inVolumes, port: false }));

    const handlers = Object.fromEntries(Object
        .entries(bin)
        .map(([key, value]) =>
            [`/usr/bin/${key}`, toScript(value === true ? key : value)]));

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

    const server = http.createServer(
        (request, response) =>
            handle({ handlers, mappings }, request, response));

    await new Promise((resolve, reject) =>
        server.listen(() => Promise
            .resolve(f({ volumes, port: server.address().port }))
            .then(resolve, reject)));
}

function handle({ handlers, mappings }, request, response)
{
    const chunks = [];

    request.on("data", data => chunks.push(data.toString()))
    request.on("end", async function ()
    {
        const respond = (result, value) =>
            (response.statusCode = 200,
            response.end(JSON.stringify({ result, value })));

        try
        {
            const remote = JSON.parse(chunks.join(""));
            const handler = handlers[remote.command];
            const value =
                await handler(...remote
                    .arguments
                    .map(argument => toLocalPath(mappings, argument)));

            return respond("resolved", value);
        }
        catch (error)
        {
            respond("rejected",
                error instanceof Error ?
                    { error: { message: error.message, stack: error.stack } } :
                    { value: error });
        }
    });
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
