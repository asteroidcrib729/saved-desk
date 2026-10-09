// Development fixtures use a private build-time environment, never bundled media tools.
import {spawnSync} from 'node:child_process';
import {writeFile,stat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
export async function configureFixtureTools(project,data) {
 const target=resolve(data);
 if(!target.startsWith(resolve(project,'.cache')+sep))throw Error('Fixture tool settings must stay inside the isolated project cache.');
 const python=resolve(project,'.venv/Scripts/python.exe');
 let ffmpeg=process.env.SAVEDDESK_FFMPEG;
 if(!ffmpeg){
  const result=spawnSync(python,['-I','-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{windowsHide:true,encoding:'utf8',timeout:10000});
  if(result.status!==0)throw Error('Install backend[development] in the private build environment for media fixtures.');
  ffmpeg=result.stdout.trim();
 }
 if(!(await stat(python)).isFile()||!(await stat(ffmpeg)).isFile())throw Error('Fixture executables are unavailable.');
 await writeFile(resolve(target,'external-tools.json'),JSON.stringify({galleryPython:python,ffmpeg}));
 return ffmpeg;
}

// Freeze native fixture payloads so Cargo/Tauri staging cannot mutate a running test.
export async function stageFixtureApp(project, data, name = "saveddesk-fixture.exe") {
  const { cp, mkdir, readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const { createHash } = await import("node:crypto");
  if (!/^saveddesk-[a-z-]+\.exe$/.test(name)) throw Error("Invalid fixture executable name");
  const from = resolve(project, "desktop/src-tauri/target/debug");
  const directory = resolve(data, "application");
  await mkdir(directory, { recursive: true });
  for (const entry of ["saveddesk.exe", "saveddesk-native-host.exe", "worker", "browser-connector", "licenses", "maintenance"]) {
    await cp(resolve(from, entry), resolve(directory, entry === "saveddesk.exe" ? name : entry), { recursive: true, force: false, errorOnExist: true });
  }
  const executable = resolve(directory, name);
  return { executable, host: resolve(directory, "saveddesk-native-host.exe"), sha256: createHash("sha256").update(await readFile(executable)).digest("hex") };
}
