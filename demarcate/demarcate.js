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

            // We have to do this whole convoluted thing since we have no idea
            // where npm might actually install the structured-stream package
            // due to deduping.
            {
                from: await toInstalledClientModules(persistentData),
                to: "/.demarcate",
                readonly: true
            },

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


async function toInstalledClientModules(persistent)
{
    const lockfilePath = join(__dirname, "package-lock.json");
    const checksum = toSHA256(read(lockfilePath, "utf-8"));
    const clientModulesPath = join(persistent, "client-modules", checksum);

    if (!exists(clientModulesPath))
    {
        mkdir(clientModulesPath, { recursive: true });

        ["package.json", "package-lock.json"]
            .map(filename => copy(
                join(__dirname, filename),
                join(clientModulesPath, filename)));

        await spawn("npm", ["install"], { cwd: clientModulesPath });
    }

    return clientModulesPath;
}