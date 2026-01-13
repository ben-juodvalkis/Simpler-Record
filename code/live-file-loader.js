const maxApi = require("max-api");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

// Debug mode - off by default, send "debug" message to toggle
let debugEnabled = false;

// Debug logging helper
function debug(message, data = null) {
    if (!debugEnabled) return;

    const timestamp = new Date().toISOString();
    if (data !== null) {
        maxApi.post(`[DEBUG ${timestamp}] ${message}:`, JSON.stringify(data));
    } else {
        maxApi.post(`[DEBUG ${timestamp}] ${message}`);
    }
}

// Toggle debug mode
maxApi.addHandler("debug", () => {
    debugEnabled = !debugEnabled;
    maxApi.post(`Debug mode ${debugEnabled ? "enabled" : "disabled"}`);
});

// Convert Mac HFS-style path (Volume:path:to:file) to POSIX path (/Volumes/Volume/path/to/file)
// Only applies on macOS - Windows paths are left unchanged
function convertHFSPathToPosix(filepath) {
    debug("convertHFSPathToPosix called with", filepath);

    // Skip conversion on Windows - paths like C:\Users\... should not be modified
    if (process.platform === "win32") {
        debug("Windows platform detected, skipping HFS conversion");
        return filepath;
    }

    // Check if this looks like an HFS path (contains colon but doesn't start with /)
    // Windows drive letters (C:) are already handled above
    if (filepath.includes(":") && !filepath.startsWith("/")) {
        debug("Detected HFS-style path");

        // Split on first colon to get volume name
        const colonIndex = filepath.indexOf(":");
        const volumeName = filepath.substring(0, colonIndex);
        const restOfPath = filepath.substring(colonIndex + 1);

        debug("Volume name", volumeName);
        debug("Rest of path", restOfPath);

        // Construct POSIX path: /Volumes/VolumeName/rest/of/path
        const posixPath = `/Volumes/${volumeName}${restOfPath}`;
        debug("Converted to POSIX path", posixPath);

        return posixPath;
    }

    debug("Path appears to already be POSIX format");
    return filepath;
}

function findAbletonWindows() {
    debug("findAbletonWindows() called");

    const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
    debug("ProgramData path", programData);

    const abletonDir = path.join(programData, "Ableton");
    debug("Ableton directory path", abletonDir);

    try {
        if (!fs.existsSync(abletonDir)) {
            debug("Ableton directory does not exist, returning null");
            return null;
        }
        debug("Ableton directory exists");

        // Find all Live installations, sort descending to get newest first
        const allDirs = fs.readdirSync(abletonDir);
        debug("All directories in Ableton folder", allDirs);

        const liveDirs = allDirs
            .filter(d => d.startsWith("Live "))
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        debug("Filtered and sorted Live directories", liveDirs);

        for (const dir of liveDirs) {
            debug("Checking Live installation", dir);

            const programDir = path.join(abletonDir, dir, "Program");
            debug("Program directory path", programDir);

            if (!fs.existsSync(programDir)) {
                debug("Program directory does not exist, skipping");
                continue;
            }
            debug("Program directory exists");

            // Find the executable in the Program folder
            const programContents = fs.readdirSync(programDir);
            debug("Program directory contents", programContents);

            const exeFile = programContents
                .find(f => f.startsWith("Ableton Live") && f.endsWith(".exe"));
            debug("Found executable", exeFile || "none");

            if (exeFile) {
                const fullPath = path.join(programDir, exeFile);
                debug("Returning Ableton executable path", fullPath);
                return fullPath;
            }
        }
        debug("No Ableton executable found in any installation");
    } catch (e) {
        debug("Error in findAbletonWindows", { error: e.message, stack: e.stack });
        return null;
    }
    return null;
}

maxApi.addHandler("load", (filepath) => {
    debug("load handler triggered");
    debug("Received filepath", filepath);

    // Convert HFS-style paths (Volume:path) to POSIX paths (/Volumes/Volume/path)
    const convertedPath = convertHFSPathToPosix(filepath);
    const normalized = path.resolve(convertedPath);
    debug("Normalized filepath", normalized);

    // Check if file exists
    const fileExists = fs.existsSync(normalized);
    debug("File exists check", fileExists);
    if (!fileExists) {
        debug("WARNING: File does not exist at normalized path");
    }

    let command;
    debug("Detected platform", process.platform);

    if (process.platform === "win32") {
        debug("Using Windows code path");
        const abletonPath = findAbletonWindows();
        debug("Ableton path result", abletonPath);

        if (abletonPath) {
            command = `"${abletonPath}" "${normalized}"`;
            debug("Constructed Windows command", command);
        } else {
            debug("ERROR: Ableton Live not found on Windows");
            maxApi.outlet("error", "Ableton Live not found");
            return;
        }
    } else {
        // macOS: use bundle identifier (works for all Live versions)
        debug("Using macOS code path");
        command = `open -b com.ableton.live "${normalized}"`;
        debug("Constructed macOS command", command);
    }

    debug("Executing command...");
    exec(command, (error, stdout, stderr) => {
        if (error) {
            debug("Command execution FAILED", {
                errorMessage: error.message,
                errorCode: error.code,
                stdout: stdout,
                stderr: stderr
            });
            maxApi.outlet("error", error.message);
        } else {
            debug("Command execution SUCCEEDED", { stdout: stdout, stderr: stderr });
            debug("Sending 'done' outlet with path", normalized);
            maxApi.outlet("done", normalized);
        }
    });
});
