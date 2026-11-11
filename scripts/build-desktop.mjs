import { spawnSync } from "node:child_process"

const isWindows = process.platform === "win32"
const npmBin = isWindows ? "npm.cmd" : "npm"

function pathKey(env) {
  return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH"
}

function frontendBuildEnv() {
  const env = {
    ...process.env,
    TAURI_DESKTOP: "1",
  }

  if (!isWindows) {
    return env
  }

  const key = pathKey(env)
  if (env.__VSCMD_PREINIT_PATH) {
    env[key] = env.__VSCMD_PREINIT_PATH
  }

  for (const name of [
    "DevEnvDir",
    "ExtensionSdkDir",
    "INCLUDE",
    "LIB",
    "LIBPATH",
    "UCRTVersion",
    "UniversalCRTSdkDir",
    "VCIDEInstallDir",
    "VCINSTALLDIR",
    "VCToolsInstallDir",
    "VCToolsRedistDir",
    "VCToolsVersion",
    "VisualStudioVersion",
    "VS170COMNTOOLS",
    "VSCMD_ARG_app_plat",
    "VSCMD_ARG_HOST_ARCH",
    "VSCMD_ARG_TGT_ARCH",
    "VSCMD_VER",
    "VSINSTALLDIR",
    "WindowsLibPath",
    "WindowsSDKLibVersion",
    "WindowsSDKVersion",
    "WindowsSdkBinPath",
    "WindowsSdkDir",
    "WindowsSdkVerBinPath",
  ]) {
    delete env[name]
  }

  return env
}

const result = spawnSync(
  isWindows ? "cmd.exe" : npmBin,
  isWindows ? ["/d", "/s", "/c", `${npmBin} run build`] : ["run", "build"],
  {
    stdio: "inherit",
    env: frontendBuildEnv(),
  },
)

if (result.status !== 0) {
  if (result.error) {
    console.error(result.error)
  }
  process.exit(result.status ?? 1)
}
