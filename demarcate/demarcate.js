const
{
    existsSync: exists,
    mkdirSync: mkdir,
    readFileSync: read,
    writeFileSync: write
} = require("fs");
const { dirname, join } = require("path");

const spawn = require("@await/spawn");

const binServer = require("./bin-server");


const docker = Object.fromEntries(
    ["build", "images", "run"]
        .map(command => [command, async (args, ...rest) =>
            (await spawn("docker", [command, ...args], ...rest))
                .stdout
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
    dockerfile
})
{
    const hash = toSHA256(read(dockerfile, "utf-8"));
    const image = `${name}:${hash}`;

    const persistentData = join(PERSISTENT_DATA, name);
    const bashHistoryPath = ensure(join(persistentData, "bash_history.txt"));

    if (await docker.images(["-q", image]) === "")
    {
        console.log(`Building ${image}`);

        await docker.build(["-t", image, dirname(dockerfile)]);
    }

    await binServer(
    {
        bin,
        volumes: 
        [
            { from: bashHistoryPath, to: `/home/${user}/.bash_history` },
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
            "--env", `HOST_SETUP_PORT=${port}`,
            image
        ], { stdio: "inherit", captureStdio: false }));
}
