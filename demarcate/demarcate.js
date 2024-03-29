const
{
    copyFileSync: copy,
    existsSync: exists,
    mkdirSync: mkdir,
    readFileSync: read,
    writeFileSync: write
} = require("fs");
const { Readable } = require("stream");
const { dirname, join } = require("path");

const spawn = require("@await/spawn");

const binServer = require("./bin-server");


const docker = Object.fromEntries(
    ["build", "images", "run"]
        .map(command => [command, async (args, ...rest) =>
            ((await spawn("docker", [command, ...args], ...rest))
                .stdout || "")
                .trim()]));

const mkdirp = dirname => (mkdir(dirname, { recursive: true }), dirname);
const ensure = filename =>
    (mkdirp(dirname(filename)) &&
    !exists(filename) &&
    write(filename, "", "utf-8"),
    filename);

const toSHA256 = data => require("crypto")
    .createHash("sha256")
    .update(data)
    .digest("hex");

const PERSISTENT_DATA = join(
    require("os").homedir(),
    "Library",
    "Application Support",
    "dev.demarcate");


module.exports = async function demarcate(
{
    user,
    name,
    bin,
    volumes,
    dockerfile,
    dockerfileContents = read(dockerfile, "utf-8"),
    workspace = dirname(dockerfile)
}, ...rest)
{
    const [major, minor] = process
        .version
        .match(/^v(\d+)\.(\d+).(\d+)/)
        .slice(1)
        .map(version => parseInt(version, 10));

    if (major < 18 || major === 18 && minor < 7)
        throw Error(
            `demarcate requires node version 18.7.0 or higher, ` +
            `but detected node version ${process.version.substr(1)}.`);

    const hash = toSHA256(dockerfileContents);
    const image = `${name}:${hash}`;

    const persistentData = join(PERSISTENT_DATA, name);
    const bashHistoryPath = ensure(join(persistentData, "bash_history.txt"));

    if (await docker.images(["-q", image]) === "")
    {
        console.log(`Building ${image}`);

        await docker.build(
        [
            "-t", image,
            "-f-",
            workspace
        ],
        { input: dockerfileContents, stdio: "inherit" });
    }

    await binServer(
    {
        bin,
        volumes:
        [
            { from: bashHistoryPath, to: `/home/${user}/.bash_history` },

            // This includes our `node_modules` because we use
            // `npm-shrinkwrap.json` instead of `package-lock.json`.
            { from: __dirname, to: "/.demarcate/", readonly: true },

            ...volumes
        ]
    },
        ({ port, volumes }) => docker.run(
        [
            "--rm",
            "-it",
            ...volumes
                .map(({ from, to, readonly = false }) =>
                    ["-v", `${from}:${to}${ readonly ? ":ro" : ""}`])
                .flat(),
            ...(port ? ["--env", `HOST_SETUP_PORT=${port}`] : []),
            image,
            ...rest
        ], { stdio: "inherit", captureStdio: false }));
}
