// Final executable acceptance, isolated catalog and generated text posts only.
import {chromium,expect} from "@playwright/test";
import {spawn,spawnSync} from "node:child_process";
import {mkdir,readFile,writeFile,access} from "node:fs/promises";
import {resolve} from "node:path";
import {createServer} from "node:net";
import {randomUUID,createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
const project=resolve(import.meta.dirname,"../..");const data=resolve(project,".cache/native-batch-deletion",randomUUID());await mkdir(data,{recursive:true});
const port=await new Promise(done=>{const server=createServer();server.listen(0,"127.0.0.1",()=>{const port=server.address().port;server.close(()=>done(port));});});
const executable=resolve(project,"desktop/src-tauri/target/debug/saveddesk.exe");
const app=spawn(executable,[],{windowsHide:true,stdio:"ignore",env:{...process.env,SAVEDDESK_TEST_DATA_DIR:data,SAVEDDESK_TEST_PIPE_SUFFIX:randomUUID(),WEBVIEW2_USER_DATA_FOLDER:resolve(data,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
let browser,db;
const exists=path=>access(path).then(()=>true,()=>false);
try {
 for(let i=0;i<120;i++){if(app.exitCode!==null)throw new Error("Fixture app exited early");try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{await new Promise(done=>setTimeout(done,250));}}
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible({timeout:30000});
 db=new DatabaseSync(resolve(data,"prototype-catalog.db"));db.exec("PRAGMA busy_timeout=2000");const root=resolve(data,"downloads");
 db.prepare("INSERT INTO download_jobs(id,title,mode,state,destination,created_at,saved,source,account_id,target) VALUES('batch','Batch fixture','new_only','completed',?,'2026-10-07T00:00:00Z',3,'x','fixture','bookmarks')").run(root);
 const posts=[];
 for(const name of ["Keep","Select A","Select B"]){
  const path=resolve(root,name+".txt");await writeFile(path,"Generated batch fixture: "+name);
  const id=Number(db.prepare("INSERT INTO posts(source,account_id,native_id,creator,caption,kind,collection,saved_at,prototype) VALUES('x','fixture',?,?,'Generated local text','text','Batch','2026-10-07T00:00:00Z',0)").run(name,name).lastInsertRowid);
  db.prepare("INSERT INTO media_files(post_id,job_id,path,bytes,file_key) VALUES(?,'batch',?,?,?)").run(id,path,(await readFile(path)).length,name);posts.push({id,path,name});
 }
 await writeFile(resolve(root,"untracked.txt"),"Keep unrelated storage");await page.reload();
 for(const name of ["Select A","Select B"])await page.getByRole("checkbox",{name:"Select post by "+name,exact:true}).click();
 await expect(page.locator("dialog[open]")).toHaveCount(0);await page.getByRole("button",{name:"Delete selected (2)",exact:true}).click();
 const review=page.getByRole("dialog",{name:"Delete 2 selected posts and every saved copy?"});await expect(review).toContainText("2 saved copies, 2 stored files");await expect(review.getByRole("button",{name:"Cancel",exact:true})).toBeFocused();await page.screenshot({path:resolve(data,"review.png"),fullPage:true});
 await review.getByRole("button",{name:"Cancel",exact:true}).click();for(const post of posts)expect(await exists(post.path)).toBe(true);
 await page.getByRole("button",{name:"Delete selected (2)",exact:true}).click();await review.getByRole("button",{name:"Delete permanently"}).click();await expect(review).not.toBeVisible();
 expect(await exists(posts[0].path)).toBe(true);for(const post of posts.slice(1))expect(await exists(post.path)).toBe(false);
 expect(db.prepare("SELECT count(*) n FROM posts").get().n).toBe(1);expect(db.prepare("SELECT count(*) n FROM media_files").get().n).toBe(1);expect(db.prepare("SELECT saved FROM download_jobs WHERE id='batch'").get().saved).toBe(1);
 expect(await readFile(resolve(root,"untracked.txt"),"utf8")).toBe("Keep unrelated storage");expect(await exists(resolve(root,".saveddesk-delete"))).toBe(false);await expect(page.getByRole("checkbox",{name:"Select post by Keep",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Delete selected (0)",exact:true})).toBeDisabled();
 await page.getByRole("button",{name:"Accounts",exact:true}).click();await expect(page.getByRole("heading",{name:"Reddit",exact:true})).toHaveCount(0);await expect(page.getByText("Ready for media links",{exact:true})).toBeVisible();
 expect(errors).toEqual([]);const executableSha256=createHash("sha256").update(await readFile(executable)).digest("hex");
 await writeFile(resolve(data,"acceptance.json"),JSON.stringify({passed:true,executableSha256,checks:["real native checkbox selection","one cancel-first batch review","cancel preserves both files","selected posts and files removed","unselected post/file preserved","untracked file preserved","history counts refreshed","no staging journal left","selection cleared after removal","removed provider absent and Discord media card ready","no browser page errors"]},null,2));console.log("Final native batch acceptance passed. Fixture: "+data);
} finally {db?.close();if(browser)await browser.close();if(app.pid&&app.exitCode===null)spawnSync("taskkill.exe",["/PID",String(app.pid),"/T","/F"],{windowsHide:true});}
