import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function inspectSettingHelp(page:Page,name:string){
 const button=page.getByRole("button",{name:`About ${name}`,exact:true});await button.scrollIntoViewIfNeeded();
 const box=await button.locator("xpath=../..").boundingBox();await button.click();
 const popup=page.getByRole("dialog",{name:`About ${name}`,exact:true});await expect(popup).toBeVisible();await expect(popup.getByRole("button",{name:"Close information",exact:true})).toBeFocused();
 expect(await button.locator("xpath=../..").boundingBox()).toEqual(box);await expect(popup.locator(".setting-explanation")).not.toBeEmpty();
 await popup.getByRole("button",{name:"Close information",exact:true}).click();await expect(popup).toHaveCount(0);await expect(button).toBeFocused();
}

// Only this test page supplies an in-memory native bridge. No browser sessions,
// owner catalog, downloads or network platform APIs are accessed.
async function fixture(page: Page, options: { active?: boolean; repairBlocked?: boolean; slowSettings?: boolean; portraitPreviews?: boolean; emptyFiles?: boolean; missingFiles?:boolean; videoFiles?:boolean; videoPlayback?:"original"|"cached"; paginated?:boolean; allPlatforms?:boolean; approvedSessions?:boolean } = {}) {
  await page.addInitScript(options => {
    const qa = { auth:{clientId:"",state:"setup_required",displayName:null as string|null,accountKey:null as string|null,expiresAt:null as number|null,grantedScopes:[] as string[],message:""},authCalls:[] as string[], snapshots: 0, queries: 0, previews: 0, saves: 0, inFlight: 0, maxInFlight: 0, saved: 10, dateFormats: 0,
      downloadRequests:[] as unknown[],queuedModes:[] as string[],downloadExisting:0,prepareCalls:0,deletions:[] as unknown[], deletionTarget:null as any, deletionFail:false,deletedJobs:false,providerSetup:[] as string[],compatibilityHeld:false,repairBlocked: !!options.repairBlocked, active: options.active ?? true, toolSettings:{galleryPython:"",ffmpeg:""}, readinessCalls:0, readinessHeld:false, openedSource:null,scale:1,setupState:"ready", settings: { downloadFolder: "C:\\Fixture", lowResource: true, quality: "original", profile: "original", advanced:{encoder:"auto",preset:"superfast",crf:23,audioBitrate:128} } };
    (window as any).__qa = qa;
    const aspectPreviews=[[24,240],[320,24]].map(([width,height],index)=>{
      const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
      const context=canvas.getContext("2d")!;context.fillStyle=index?"#df8c3b":"#26c6b1";context.fillRect(0,0,width,height);
      return canvas.toDataURL("image/png");
    });
    Intl.DateTimeFormat = new Proxy(Intl.DateTimeFormat, { construct(target,args) { qa.dateFormats++; return Reflect.construct(target,args); } });
    const items = Array.from({ length: options.paginated?150:100 }, (_, index) => ({ id: (options.paginated?150:100)-index, source: options.allPlatforms?["youtube","facebook","instagram","discord","tiktok","pinterest","x"][index%7]:index % 2 ? "x" : "instagram", nativeId: String((options.paginated?150:100)-index), creator: `Creator ${(options.paginated?150:100)-index}`, caption: `Saved caption ${(options.paginated?150:100)-index}`, kind: "image", collection: "Collection "+"long name ".repeat(12), savedAt: "2026-10-05T00:00:00Z", available: true, prototype: false }));
    (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    (window as any).__TAURI_INTERNALS__ = {
      metadata:{currentWindow:{label:"main"},currentWebview:{label:"main"}},
      transformCallback: (callback:unknown) => { (qa as any).workerEvent=callback;return 1; },
      convertFileSrc: (value:string) => options.videoFiles?"http://savedmedia.localhost/"+encodeURIComponent(value): "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      async invoke(command: string, args: any = {}) {

        if (command === "get_authentication") return {providers:[{source:"facebook",identityFlow:"optional",privateMedia:"excluded",requirement:"Public video and Reel links need no new OAuth registration. Private content is outside the supported scope."},{source:"tiktok",identityFlow:"optional",privateMedia:"excluded",requirement:"Public video and photo links need no Login Kit setup. Private content is outside the supported scope."},{source:"pinterest",identityFlow:"public_links",privateMedia:"excluded",requirement:"Public pin and board links need no developer app or OAuth setup. Secret boards are outside the supported scope."},{source:"discord",identityFlow:"optional",privateMedia:"attachment_link",requirement:"Fresh CDN attachment links already work without sign-in."}],google:{...qa.auth}};
        if (command === "configure_google_identity"){qa.authCalls.push(command);if(!args.clientId.endsWith(".apps.googleusercontent.com"))throw new Error("Enter a Google Desktop OAuth client ID.");qa.auth.clientId=args.clientId;qa.auth.state="not_connected";qa.auth.message="Desktop client configured.";return;}
        if (command === "begin_google_identity"){qa.authCalls.push(command);qa.auth.state="waiting_for_browser";qa.auth.message="Complete Google sign-in in your browser.";return;}
        if (command === "cancel_google_identity"){qa.authCalls.push(command);qa.auth.state=qa.auth.accountKey?"identity_verified":"not_connected";qa.auth.message="Sign-in cancelled. Any previous identity was kept.";return;}
        if (command === "check_google_identity"){qa.authCalls.push(command);qa.auth.message="Google identity checked. This grants no private-media capability.";return;}
        if (command === "disconnect_google_identity"){qa.authCalls.push(args.revoke?"revoke_google":"disconnect_google");qa.auth.accountKey=null;qa.auth.displayName=null;qa.auth.state="not_connected";qa.auth.message="Google identity disconnected locally.";return;}
        if (command === "reset_google_identity"){qa.authCalls.push(command);qa.auth.clientId="";qa.auth.state="setup_required";qa.auth.accountKey=null;qa.auth.displayName=null;return;}
        if (command === "import_google_identity"){qa.authCalls.push(command);qa.auth.clientId="123-imported.apps.googleusercontent.com";qa.auth.state="not_connected";return true;}
        if (command === "get_external_tools") return {...qa.toolSettings};
        if (command === "choose_external_tool") return "C:\\FixtureTools\\python.exe";
        if (command === "save_external_tools") {qa.toolSettings={...args.config};return {...qa.toolSettings};}
        if (command === "repair_library") { while(qa.repairBlocked) await new Promise(resolve => setTimeout(resolve, 50)); return { relinked: 0, available: 100, missing: 0, ambiguous: 0 }; }
        if (command === "get_snapshot") { qa.snapshots++; return { total: items.length, images: items.length, videos: 0, native: true, liveDownloads: true, browserConnection: true, settings: { ...qa.settings }, collections: [], accounts: [{ source: "instagram", accountId: "42", username: "fixture", browser: "chrome", state: "connected", message: "" },...(options.approvedSessions?["youtube","facebook","tiktok","pinterest"].map(source=>({source,accountId:"fixture-browser",username:"",browser:"chrome",state:"session_ready",message:""})):[])], jobs: qa.deletedJobs?[]:[{ id: "job", collection:true, title: "A long download title ".repeat(15), state: qa.active ? "running" : "completed", saved: qa.saved, skipped: 0, failed: 0, mode: "new_only", createdAt: "2026-10-05T00:00:00Z" }] }; }
        if (command === "query_library") { qa.queries++; (qa as any).lastQuery=args.query; const matches=items.filter(item => (!args.query.source || item.source===args.query.source) && (!args.query.kind || item.kind===args.query.kind) && (!args.query.search || item.caption.toLowerCase().includes(args.query.search.toLowerCase()))); const remaining=matches.filter(item=>args.query.cursor===null||item.id<args.query.cursor);const shown=remaining.slice(0,100);return { items: shown, total: matches.length, nextCursor: remaining.length>100?shown[99].id:null }; }
        if (command === "thumbnails") { qa.previews++; await new Promise(resolve => setTimeout(resolve,100)); return Object.fromEntries(args.ids.map((id:number) => [id, options.portraitPreviews?aspectPreviews[id%2]:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="])); }
        if(command==="prepare_deletion"){if(qa.active)throw new Error("Pause or finish downloads before deleting saved content.");qa.deletionTarget=args.target;return {token:"delete-token",files:2,storedFiles:4,bytes:4096,downloads:args.target.kind==="collection"?2:args.target.kind==="download"?1:0,unavailable:0,outsideFolder:0};}
        if(command==="delete_saved_content"){if(qa.deletionFail)throw new Error("The files changed. Review deletion again; nothing was deleted.");qa.deletions.push(args.token);if(qa.deletionTarget.kind==="post"){const index=items.findIndex(item=>item.id===qa.deletionTarget.id);if(index>=0)items.splice(index,1);}else if(qa.deletionTarget.kind==="posts"){for(let index=items.length-1;index>=0;index--)if(qa.deletionTarget.id.includes(items[index].id))items.splice(index,1);}else if(["download","collection"].includes(qa.deletionTarget.kind))qa.deletedJobs=true;return;}
        if(command==="get_player_preferences")return JSON.parse(localStorage.getItem("saveddesk.video.volume")??"null");
        if(command==="save_player_preferences")return;
        if(command==="firefox_profiles")return [{id:"isolated",name:"Isolated QA profile"}];
        if (command === "prepare_download") {qa.downloadRequests.push(args.request);return {token:"public-draft",existing:qa.downloadExisting,collection:args.request.source==="youtube"&&args.request.target.includes("playlist"),title:args.request.title||"Public content"};}
        if (command === "start_download") {qa.queuedModes.push(args.mode);return "public-job";}
        if (command === "prepare_video") {qa.prepareCalls++;while(args.force&&qa.compatibilityHeld)await new Promise(resolve=>setTimeout(resolve,50));return true;}
        if (command === "post_files") return options.emptyFiles?[]:[0,1].map(index=>({ id:args.id+index*1000,name:index?"second-photo.png":"photo.png",jobId:"job",bytes:67,quality:"original",profile:"original",available:!options.missingFiles,playback:!index?options.videoPlayback:undefined,kind:options.videoFiles&&!index?"video":"image" }));
        if (command === "plugin:webview|set_webview_zoom") {qa.scale=args.value;return;}
        if (command === "open_source_post") { qa.openedSource=args.id;return; }
        if (command === "check_readiness") { qa.readinessCalls++;while(qa.readinessHeld)await new Promise(resolve=>setTimeout(resolve,50));return {freeBytes:2*1024*1024*1024,checks:[{id:"folder",label:"Save folder",state:qa.setupState,message:qa.setupState==="blocked"?"Reconnect the drive or choose a folder.":"Your selected folder is available and writable.",action:qa.setupState==="blocked"?"folder":"none"},{id:"worker",label:"Download engine",state:"pending",message:"A download is using the engine. Check again when it finishes.",action:"none"},{id:"connector",label:"Browser connection",state:"warning",message:"Set up the connector for this browser in Accounts.",action:"accounts"}]}; }

        if (command === "save_settings") { qa.saves++; qa.inFlight++; qa.maxInFlight=Math.max(qa.maxInFlight,qa.inFlight); await new Promise(resolve => setTimeout(resolve, options.slowSettings ? 300 : 0)); qa.settings={...args.settings}; qa.inFlight--; return; }
        if (command === "plugin:dialog|open") return "C:\\NewFixture";
        if (command === "plugin:event|listen") return 1;
        if (command === "plugin:event|unlisten") return;
        throw new Error("Unexpected test command: "+command);
      }
    };
  }, options);
  await page.goto("/");
  await expect(page.getByTestId("library-list").locator("article").first()).toBeVisible();
}

test.afterEach(async ({page},info) => { if(info.status!==info.expectedStatus) await page.screenshot({path:info.outputPath("failure.png"),fullPage:true}); });

const qa = (page: Page, key: string) => page.evaluate(key => (window as any).__qa[key], key);

test("download polling keeps the scrolled library and its thumbnails stable", async ({ page }) => {
  await fixture(page);
  const list = page.getByTestId("library-list");
  await list.evaluate(element => { element.scrollTop=1408; });
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(1408);
  await expect(list.locator(".content-thumbnail img")).toHaveCount(18);
  const snapshots=await qa(page,"snapshots");
  const previews=await qa(page,"previews");
  await expect.poll(() => qa(page,"snapshots"), {timeout:6000}).toBeGreaterThan(snapshots+1);
  await page.waitForTimeout(350);
  expect(await list.evaluate(element => element.scrollTop)).toBe(1408);
  expect(await qa(page,"previews")).toBe(previews);
  const queries=await qa(page,"queries");
  await page.evaluate(() => { (window as any).__qa.saved++; });
  await expect.poll(()=>qa(page,"queries"),{timeout:6000}).toBeGreaterThan(queries);
  expect(await list.evaluate(element=>element.scrollTop)).toBe(1408);
  expect(await qa(page,"previews")).toBe(previews);
});

test("a slow folder repair does not hold up the initial snapshot", async ({page}) => {
  await fixture(page,{repairBlocked:true,active:false});
  await expect.poll(() => qa(page,"snapshots"),{timeout:1500}).toBeGreaterThan(0);
  await page.evaluate(() => { (window as any).__qa.repairBlocked=false; });
});

test("navigation starts at the top and stops hidden library work", async ({page}) => {
  await fixture(page);
  await page.locator("main").evaluate(element=>{element.scrollTop=300;});
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  expect(await page.locator("main").evaluate(element=>element.scrollTop)).toBe(0);
  const queries=await qa(page,"queries");const previews=await qa(page,"previews");
  await expect.poll(()=>qa(page,"snapshots"),{timeout:6000}).toBeGreaterThan(2);
  await page.waitForTimeout(300);
  expect(await qa(page,"queries")).toBe(queries);
  expect(await qa(page,"previews")).toBe(previews);
});

test("global keyboard shortcuts do not stack dialogs over the media viewer", async ({page}) => {
  await fixture(page,{active:false});
  const trigger=page.getByRole("button",{name:"View saved files"}).first();await trigger.click();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await page.keyboard.press("Control+n");
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("rapid settings changes preserve all selected values", async ({page}) => {
  await fixture(page,{active:false,slowSettings:true});
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByRole("combobox",{name:/^Video quality/}).selectOption("720");
  await page.getByRole("combobox",{name:/^Output profile/}).selectOption("compatible_mp4");
  await expect.poll(()=>qa(page,"inFlight")).toBe(0);
  await expect(page.getByRole("combobox",{name:/^Video quality/})).toHaveValue("720");
  await expect(page.getByRole("combobox",{name:/^Output profile/})).toHaveValue("compatible_mp4");
  expect(await qa(page,"maxInFlight")).toBe(1);
});

test("populated minimum-size screens and long labels stay inside the viewport", async ({page},info) => {
  await page.setViewportSize({width:760,height:520});await fixture(page,{active:false});
  for (const screen of ["Library","Downloads","Accounts","Settings"]) {
    await page.getByRole("button",{name:screen,exact:true}).click();
    expect(await page.locator("main").evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath(`${screen}.png`)});
  }
});

test("search and filter changes reset the viewport and find the latest input",async ({page}) => {
  await fixture(page,{active:false});
  const list=page.getByTestId("library-list");await list.evaluate(element=>{element.scrollTop=1408;});
  await page.getByRole("textbox",{name:"Search your library"}).fill("Saved caption 9");
  await expect(list.locator("article")).toHaveCount(11);
  expect(await list.evaluate(element=>element.scrollTop)).toBe(0);
  await page.getByRole("textbox",{name:"Search your library"}).fill("Saved caption 100");
  await expect(list.locator("article")).toHaveCount(1);await expect(list).toContainText("Creator 100");
  await page.getByRole("textbox",{name:"Search your library"}).fill("");
  await page.getByRole("button",{name:"Videos",exact:true}).click();
  await expect(page.getByRole("heading",{name:"No matching content"})).toBeVisible();
  await page.getByRole("button",{name:"All content",exact:true}).click();
  await expect(list.locator("article")).toHaveCount(18);
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByRole("textbox",{name:"Search your library"}).fill("Saved caption 100");
  await expect(page.getByRole("heading",{name:"Library",exact:true})).toBeVisible();
  await expect(list.locator("article")).toHaveCount(1);
});

test("scrolling reuses date formatters and caps mounted rows",async ({page}) => {
  await fixture(page,{active:false});
  const before=await qa(page,"dateFormats");
  await page.getByTestId("library-list").evaluate(async element=>{
    for(let index=1;index<=24;index++) { element.scrollTop=index*90; await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())); }
  });
  expect(await qa(page,"dateFormats")).toBe(before);
  expect(await page.getByTestId("library-list").locator("article").count()).toBeLessThanOrEqual(18);
});


test("setup checks run on request and show recovery actions without background probes",async ({page})=>{
  await fixture(page,{active:false});
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  const panel=page.locator("section").filter({has:page.getByRole("heading",{name:"Check your setup",exact:true})});
  expect(await qa(page,"readinessCalls")).toBe(0);
  await page.evaluate(()=>{(window as any).__qa.setupState="blocked";});
  await panel.getByRole("button",{name:"Check setup",exact:true}).click();
  await expect(panel).toContainText("Some checks need attention before downloading.");
  await expect(panel).toContainText("Not checked");
  await expect(panel).toContainText("2.00 GiB");
  await expect(panel.getByRole("button",{name:"Choose folder",exact:true})).toBeVisible();
  expect(await qa(page,"readinessCalls")).toBe(1);
  await page.setViewportSize({width:760,height:520});
  expect(await page.locator("main").evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await panel.getByRole("button",{name:"View accounts",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Your connected accounts",exact:true})).toBeVisible();
});

test("setup results expire when the folder changes during a slow check",async ({page})=>{
  await fixture(page,{active:false});await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.evaluate(()=>{(window as any).__qa.readinessHeld=true;});
  await page.getByRole("button",{name:"Check setup",exact:true}).click();
  await expect(page.getByRole("button",{name:"Checking setup...",exact:true})).toBeDisabled();
  await page.locator(".folder-setting").getByRole("button",{name:"Choose folder",exact:true}).click();
  await expect(page.locator(".folder-setting code")).toContainText("NewFixture");
  await page.evaluate(()=>{(window as any).__qa.readinessHeld=false;});
  await expect(page.getByRole("button",{name:"Check setup",exact:true})).toBeEnabled();
  await expect(page.locator(".readiness-checks")).toHaveCount(0);
  expect(await qa(page,"readinessCalls")).toBe(1);
});

test("media keyboard controls navigate copies, bound zoom and open only a post ID",async ({page})=>{
  await fixture(page,{active:false});await page.getByRole("button",{name:"View saved files"}).first().click();
  const dialog=page.locator("dialog[open]");
  await expect(dialog).toContainText("1 of 2");
  await page.keyboard.press("ArrowRight");await expect(dialog).toContainText("2 of 2");
  await page.keyboard.press("Alt+ArrowLeft");await expect(dialog).toContainText("1 of 2");
  await page.keyboard.press("+");await expect(dialog.getByText("150%",{exact:true})).toBeVisible();
  await page.keyboard.press("0");await expect(dialog.getByText("100%",{exact:true})).toBeVisible();
  await page.keyboard.press("-");await expect(dialog.getByText("100%",{exact:true})).toBeVisible();
  await dialog.getByRole("button",{name:"Open original post in browser",exact:true}).click();
  expect(await qa(page,"openedSource")).toBe(100);
  await page.keyboard.press("Escape");await expect(page.locator("dialog[open]")).toHaveCount(0);
});


test("portrait and wide thumbnails stay inside their rows before and after hover and scrolling",async ({page},info)=>{
  await fixture(page,{active:false,portraitPreviews:true});
  const list=page.getByTestId("library-list");
  await expect(list.locator(".content-thumbnail img")).toHaveCount(18);
  const overflow=()=>list.evaluate(element=>Array.from(element.querySelectorAll<HTMLImageElement>(".content-thumbnail img")).flatMap(image=>{
    const box=image.getBoundingClientRect(),tile=image.parentElement!.getBoundingClientRect(),row=image.closest("article")!.getBoundingClientRect();
    return box.width>52.5||box.height>56.5||box.left<tile.left-0.5||box.right>tile.right+0.5||box.top<tile.top-0.5||box.bottom>tile.bottom+0.5||box.top<row.top-0.5||box.bottom>row.bottom+0.5
      ?[{width:box.width,height:box.height,natural:[image.naturalWidth,image.naturalHeight],rowHeight:row.height}]:[];
  }));
  await expect.poll(()=>list.locator(".content-thumbnail img").evaluateAll(images=>images.slice(0,4).every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  await page.mouse.move(0,0);
  await page.screenshot({path:info.outputPath("thumbnails-before-hover.png")});
  expect(await overflow()).toEqual([]);
  await list.locator("article").first().hover();
  expect(await overflow()).toEqual([]);
  await page.screenshot({path:info.outputPath("thumbnails-after-hover.png")});
  await list.evaluate(element=>{element.scrollTop=1408;});
  await expect(list.locator(".content-thumbnail img")).toHaveCount(18);
  await page.mouse.move(0,0);
  expect(await overflow()).toEqual([]);
  await page.setViewportSize({width:760,height:520});
  expect(await overflow()).toEqual([]);
});


test("fullscreen has screen-edge navigation and top-right image exit",async ({page},info)=>{
  await fixture(page,{active:false});await page.getByRole("button",{name:"View saved files"}).first().click();
  const dialog=page.locator("dialog[open]");const controls=page.getByRole("group",{name:"Fullscreen viewer controls"});
  const full=()=>page.evaluate(()=>document.fullscreenElement?.className??null);
  await expect(controls).toBeHidden();
  await dialog.getByRole("button",{name:"Fullscreen",exact:true}).click();
  await expect.poll(full).toBe("media-stage");await expect(controls).toBeVisible();await expect(page.locator(".fullscreen-counter")).toHaveCount(0);
  await expect(controls.getByRole("button",{name:"Close fullscreen",exact:true})).toBeFocused();
  for(const key of ["Tab","Tab","Tab","Shift+Tab","Shift+Tab"]){await page.keyboard.press(key);expect(await page.evaluate(()=>document.fullscreenElement!.contains(document.activeElement))).toBe(true);}

  const boxes=await controls.evaluate(element=>{const box=(name:string)=>element.querySelector<HTMLElement>(`button[aria-label="${name}"]`)!.getBoundingClientRect().toJSON();return {previous:box("Previous"),next:box("Next"),close:box("Close fullscreen"),width:innerWidth,height:innerHeight};});
  expect(boxes.previous.left).toBeLessThan(24);expect(boxes.next.right).toBeGreaterThan(boxes.width-24);
  expect(Math.abs(boxes.previous.y+boxes.previous.height/2-boxes.height/2)).toBeLessThan(2);
  expect(boxes.close.top).toBeLessThan(24);expect(boxes.close.right).toBeGreaterThan(boxes.width-24);
  expect(boxes.close.width).toBe(40);expect(boxes.close.height).toBe(40);
  await expect(controls.getByRole("button",{name:"Previous",exact:true})).toBeDisabled();
  await controls.getByRole("button",{name:"Next",exact:true}).click();
  await expect(controls).toContainText("2 of 2 - second-photo.png");
  expect(await full()).toBe("media-stage");
  await expect(controls.getByRole("button",{name:"Next",exact:true})).toBeDisabled();
  await controls.getByRole("button",{name:"Previous",exact:true}).click();
  await expect(controls).toContainText("1 of 2 - photo.png");
  await page.screenshot({path:info.outputPath("fullscreen-carousel.png")});
  await controls.getByRole("button",{name:"Close fullscreen",exact:true}).click();
  await expect.poll(full).toBe(null);await expect(dialog).toBeVisible();
  await expect(controls).toBeHidden();await expect(dialog.getByRole("button",{name:"Fullscreen",exact:true})).toBeFocused();
  await dialog.getByRole("button",{name:"Fullscreen",exact:true}).click();
  await expect.poll(full).toBe("media-stage");await page.keyboard.press("Escape");
  await expect.poll(full).toBe(null);await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"Close",exact:true}).click();await expect(page.locator("dialog[open]")).toHaveCount(0);
});


test("Escape still closes a post without an available fullscreen stage",async ({page})=>{
  await fixture(page,{active:false,emptyFiles:true});
  await page.getByRole("button",{name:"View saved files"}).first().click();
  await expect(page.locator("dialog[open]")).toContainText("No saved copies are recorded");
  await page.keyboard.press("Escape");await expect(page.locator("dialog[open]")).toHaveCount(0);
});


test("keyboard browsing reaches every virtualized post and restores focus after viewing",async({page})=>{
  await fixture(page,{active:false});const list=page.getByTestId("library-list");
  const first=list.getByRole("button",{name:"View saved files"}).first();await first.focus();
  await expect(first).toHaveAccessibleDescription(/Creator 100.*Saved caption 100/);
  await page.keyboard.press("End");await expect(list.locator('button[data-index="99"]')).toBeFocused();
  expect(await list.locator("article").count()).toBeLessThanOrEqual(18);
  await page.keyboard.press("Enter");await expect(page.getByRole("heading",{name:"Creator 1",exact:true})).toBeVisible();
  await page.keyboard.press("Escape");await expect(list.locator('button[data-index="99"]')).toBeFocused();
  await page.keyboard.press("Home");await expect(list.locator('button[data-index="0"]')).toBeFocused();
  await page.keyboard.press("Tab");await expect(list.getByRole("checkbox",{name:"Select post by Creator 99",exact:true})).toBeFocused();
  await page.keyboard.press("Tab");await expect(list.getByRole("button",{name:"Delete post by Creator 99",exact:true})).toBeFocused();
  await page.keyboard.press("Tab");await expect(list.locator('button[data-index="1"]')).toBeFocused();
  for(let i=2;i<=30;i++)await page.keyboard.press("ArrowDown");
  await expect(list.locator('button[data-index="30"]')).toBeFocused();
  await page.keyboard.press("PageDown");await expect(list.locator('button[data-index="34"]')).toBeFocused();
  await page.keyboard.press("PageUp");await expect(list.locator('button[data-index="30"]')).toBeFocused();
});

test("search reset, contextual row clicks, and navigation headings are usable",async({page})=>{
  await fixture(page,{active:false});const search=page.getByRole("textbox",{name:"Search your library"});
  await search.fill("no-match");await expect(page.getByRole("heading",{name:"No matching content"})).toBeVisible();
  await page.getByRole("button",{name:"Clear search",exact:true}).click();await expect(search).toBeFocused();await expect(search).toHaveValue("");
  await page.getByRole("button",{name:"Videos",exact:true}).click();await expect(page.getByRole("heading",{name:"No matching content"})).toBeVisible();
  await page.getByRole("button",{name:"Clear search and filters",exact:true}).click();await expect(search).toBeFocused();
  await expect(page.getByTestId("library-list").locator("article").first()).toBeVisible();
  const copy=await page.getByTestId("library-list").locator(".content-copy").first().boundingBox();await page.mouse.click(copy!.x+copy!.width/2,copy!.y+copy!.height/2);await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Escape");await page.getByRole("button",{name:"Settings",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Settings",exact:true})).toBeFocused();
});

test("help is discoverable, traps modal shortcuts, and returns focus",async({page})=>{
  await fixture(page,{active:false});const help=page.getByRole("button",{name:"Help & shortcuts",exact:true});await help.click();
  await expect(page.getByRole("dialog",{name:"Help & shortcuts"})).toBeVisible();await expect(page.getByRole("button",{name:"Close help"})).toBeFocused();
  await page.keyboard.press("Control+n");await expect(page.locator("dialog[open]")).toHaveCount(1);
  await page.keyboard.press("Escape");await expect(page.locator("dialog[open]")).toHaveCount(0);await expect(help).toBeFocused();
  await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce"});await help.click();await expect(page.getByRole("button",{name:"Close help"})).toBeVisible();
});

test("compact layouts keep search, help, filters and dialogs reachable",async({page})=>{
  await page.setViewportSize({width:640,height:360});await fixture(page,{active:false});
  expect(await page.locator("main").evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await expect(page.getByRole("button",{name:"Help & shortcuts",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Help & shortcuts",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Help & shortcuts"});expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");await page.getByRole("button",{name:"View saved files"}).first().click();
  await expect(page.getByRole("button",{name:"Close",exact:true})).toBeVisible();
});


for(const width of [1366,760,640,380])test(`automated accessibility audit across screens and dialogs at ${width}px`,async({page},info)=>{
  test.setTimeout(90000);await page.setViewportSize({width,height:width===1366?768:width===380?260:520});await fixture(page,{active:false});
  const reports=[];
  for(const name of ["Library","Instagram","X (F.K.A. Twitter)","Downloads","Accounts","Settings"]){
    await page.getByRole("button",{name,exact:true}).click();await expect(page.getByRole("heading",{name,exact:true})).toBeVisible();
    if(name!=="Library")await expect(page.getByRole("heading",{name,exact:true})).toBeFocused();
    expect(await page.locator("main").evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
    if(name==="Library"&&width===380){
      const rows=await page.getByTestId("library-list").locator("article").evaluateAll(rows=>rows.map(row=>{const r=row.getBoundingClientRect(),b=row.querySelector("button")!.getBoundingClientRect();return b.top>=r.top&&b.bottom<=r.bottom;}));expect(rows.every(Boolean)).toBe(true);
    }
    const report=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22a","wcag22aa"]).analyze();reports.push({screen:name,violations:report.violations,incomplete:report.incomplete});
  }
  await page.getByRole("button",{name:"Library",exact:true}).click();await page.getByRole("button",{name:"View saved files"}).first().click();
  let report=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22a","wcag22aa"]).analyze();reports.push({screen:"Media dialog",violations:report.violations,incomplete:report.incomplete});
  await page.keyboard.press("Escape");await page.getByRole("button",{name:"Help & shortcuts",exact:true}).click();
  report=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22a","wcag22aa"]).analyze();reports.push({screen:"Help dialog",violations:report.violations,incomplete:report.incomplete});
  await info.attach("accessibility-audit.json",{body:JSON.stringify(reports,null,2),contentType:"application/json"});
  expect(reports.flatMap(report=>report.violations.map(violation=>({screen:report.screen,id:violation.id,impact:violation.impact,nodes:violation.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})))).toEqual([]);
});


test("interface size shortcuts and preference restore consistently",async({page})=>{
  await fixture(page,{active:false});await page.getByRole("button",{name:"Settings",exact:true}).click();
  const size=page.getByLabel("Interface size",{exact:true});await size.selectOption("1.5");
  await expect.poll(()=>qa(page,"scale")).toBe(1.5);await expect(size).toHaveValue("1.5");
  await page.keyboard.press("Control+=");await expect(size).toHaveValue("1.75");
  await page.keyboard.press("Control+-");await expect(size).toHaveValue("1.5");
  await page.reload();await expect.poll(()=>qa(page,"scale")).toBe(1.5);
  await page.keyboard.press("Control+0");await expect.poll(()=>qa(page,"scale")).toBe(1);
  expect(await page.evaluate(()=>localStorage.getItem("saveddesk-interface-scale"))).toBe("1");
});


test("missing-file recovery opens the correct settings without scanning automatically",async({page})=>{
  await fixture(page,{active:false,missingFiles:true});await page.getByRole("button",{name:"View saved files"}).first().click();
  await expect(page.locator("dialog[open]")).toContainText("Missing or moved files?");
  await expect(page.getByRole("button",{name:"View file",exact:true}).first()).toBeDisabled();
  await page.getByRole("button",{name:"Open save location settings"}).click();await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Settings",exact:true})).toBeFocused();await expect(page.getByRole("button",{name:"Find moved files"})).toBeVisible();
});


test("sidebar toggles persistently without hover or focus expansion and rails retain scrolling",async({page})=>{
  await fixture(page,{active:false});const sidebar=page.locator(".sidebar-shell");
  await expect(sidebar.locator(".collections-scroll,.nav-count,.sidebar-mode")).toHaveCount(0);
  await page.getByRole("button",{name:"Collapse sidebar",exact:true}).click();await expect(sidebar).toHaveClass(/collapsed/);
  await page.locator(".sidebar-toggle").hover();await expect(sidebar).toHaveClass(/collapsed/);
  await page.getByRole("button",{name:"Library",exact:true}).focus();await expect(sidebar).toHaveClass(/collapsed/);
  await expect.poll(async()=>(await qa(page,"settings")).sidebarExpanded).toBe(false);
  await page.reload();await expect(sidebar).toHaveClass(/collapsed/);
  await page.getByRole("button",{name:"Expand sidebar",exact:true}).click();await page.mouse.move(600,200);await expect(sidebar).toHaveClass(/pinned/);
  await expect.poll(async()=>(await qa(page,"settings")).sidebarExpanded).toBe(true);await page.reload();await expect(sidebar).toHaveClass(/pinned/);
  const list=page.getByTestId("library-list");const rail=page.getByRole("scrollbar",{name:"Saved posts: vertical scrollbar"});
  await expect(rail).toBeVisible();await rail.focus();await page.keyboard.press("End");
  await expect.poll(()=>list.evaluate(e=>e.scrollTop)).toBeGreaterThan(8000);
  expect(await list.locator("article").count()).toBeLessThanOrEqual(18);
  await page.keyboard.press("Home");await expect.poll(()=>list.evaluate(e=>e.scrollTop)).toBe(0);
  const bounds=await rail.boundingBox();if(!bounds)throw new Error("Missing scrollbar");
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+14);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+200);await page.mouse.up();
  await expect.poll(()=>list.evaluate(e=>e.scrollTop)).toBeGreaterThan(1000);
  expect(await list.evaluate(e=>getComputedStyle(e).scrollbarWidth)).toBe("none");
});

test("closing a mouse-opened post leaves no row border; header and panel spacing are bounded",async({page})=>{
  await fixture(page,{active:false});
  const trigger=page.getByRole("button",{name:"View saved files"}).first();await trigger.click();await page.getByRole("button",{name:"Close",exact:true}).click();
  await expect(trigger).toBeFocused();expect(await trigger.evaluate(e=>getComputedStyle(e.closest("article")!).outlineStyle)).toBe("none");
  await page.keyboard.press("Control+f");expect(await page.getByRole("textbox",{name:"Search your library"}).evaluate(e=>getComputedStyle(e).outlineStyle)).toBe("none");
  const gap=await page.locator(".topbar-actions").evaluate(e=>{const [a,b]=[...e.children].map(c=>c.getBoundingClientRect());return b.left-a.right;});expect(gap).toBe(8);
  expect(await page.locator(".library-keyboard-help").evaluate(e=>parseFloat(getComputedStyle(e).paddingLeft))).toBeGreaterThanOrEqual(16);
  await expect(page.locator("footer.activity-bar")).toHaveCount(0);await expect(page.getByText("Ready when you are",{exact:true})).toHaveCount(0);
  await expect(page.locator("aside .sidebar-mode")).toHaveCount(0);
});


test("compatible playback appends an ID-scoped route without encoding its separator",async({page})=>{
  await page.route("http://savedmedia.localhost/**",route=>route.fulfill({status:404,body:""}));
  await fixture(page,{active:false,videoFiles:true});await page.getByRole("button",{name:"View saved files"}).first().click();
  await expect(page.locator("video")).toHaveAttribute("src","http://savedmedia.localhost/100/playback");
});


test("switching files during compatible playback preparation cannot restore the previous video",async({page})=>{
  await page.route("http://savedmedia.localhost/**",route=>route.fulfill({status:404,body:""}));
  await fixture(page,{active:false,videoFiles:true});await page.getByRole("button",{name:"View saved files"}).first().click();
  await expect(page.locator("video")).toHaveAttribute("src","http://savedmedia.localhost/100/playback");
  await page.evaluate(()=>{(window as any).__qa.compatibilityHeld=true;});
  await page.getByRole("button",{name:"Use compatible playback",exact:true}).click();
  await expect(page.getByText("Preparing compatible playback. Creating a playback copy can take time; the original is preserved.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Next file",exact:true}).click();
  await expect(page.locator(".image-viewport img")).toHaveAttribute("src","http://savedmedia.localhost/1100");
  await page.evaluate(()=>{(window as any).__qa.compatibilityHeld=false;});await page.waitForTimeout(150);
  await expect(page.locator("video")).toHaveCount(0);await expect(page.locator(".image-viewport img")).toHaveAttribute("src","http://savedmedia.localhost/1100");
});


test("fullscreen playback errors overlay the frame without shrinking the video",async({page})=>{
  await page.route("http://savedmedia.localhost/**",route=>route.fulfill({status:404,body:""}));
  await fixture(page,{active:false,videoFiles:true});await page.getByRole("button",{name:"View saved files"}).first().click();
  await expect(page.locator("dialog .error-banner")).toContainText("This video could not be played");
  await page.getByRole("button",{name:"Enter fullscreen",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.className)).toBe("media-stage");
  expect(await page.locator(".fullscreen-error-scroll").evaluate(e=>getComputedStyle(e).position)).toBe("absolute");
  await expect.poll(()=>page.locator(".media-stage").getAttribute("data-fullscreen-motion")).toBe(null);
  const difference=await page.locator("video").evaluate(v=>{const stage=v.closest(".media-stage")!.getBoundingClientRect(),video=v.getBoundingClientRect();return Math.abs(stage.width-video.width)+Math.abs(stage.height-video.height);});expect(difference).toBeLessThan(1);
  await page.keyboard.press("Escape");
});


test("settings actions align with fields and cards retain readable spacing",async({page},info)=>{
  await fixture(page,{active:false});await page.getByRole("button",{name:"Settings",exact:true}).click();
  const setup=page.locator("section").filter({has:page.getByRole("heading",{name:"Check your setup",exact:true})});
  const selector=await setup.getByRole("combobox",{name:"Browser to check"}).boundingBox();
  const check=await setup.getByRole("button",{name:"Check setup",exact:true}).boundingBox();
  expect(check!.x).toBeGreaterThan(selector!.x+selector!.width);
  expect(Math.abs(check!.y+check!.height-selector!.y-selector!.height)).toBeLessThan(2);
  const folder=page.locator("section").filter({has:page.getByRole("heading",{name:"Save location",exact:true})});
  const choose=await folder.getByRole("button",{name:"Choose folder",exact:true}).boundingBox();
  const find=await folder.getByRole("button",{name:"Find moved files",exact:true}).boundingBox();
  expect(Math.abs(choose!.y-find!.y)).toBeLessThan(2);
  expect(await page.locator(".settings-panel").evaluateAll(cards=>cards.every(card=>{
    const title=card.querySelector("h2")!,rect=card.getBoundingClientRect(),heading=title.getBoundingClientRect();
    return heading.left-rect.left>=20&&heading.top-rect.top>=20;
  }))).toBe(true);
  await page.getByRole("button",{name:"Advanced video settings",exact:true}).click();
  await page.getByRole("button",{name:"About Output profile",exact:true}).click();
  await expect(page.getByText(/Both profiles keep only the playable MP4/)).toBeVisible();
  await page.getByRole("combobox",{name:"Interface size",exact:true}).selectOption("1.25");
  await expect.poll(()=>qa(page,"scale")).toBe(1.25);
  await page.mouse.move(900,200);await page.screenshot({path:info.outputPath("settings-organised.png")});
});

test("accounts guidance and actions remain readable at wide and compact sizes",async({page},info)=>{
  await fixture(page,{active:false});
  for(const width of [1366,760,380]){
    await page.setViewportSize({width,height:900});
    if(width<1000&&await page.getByRole("button",{name:"Collapse sidebar",exact:true}).count())await page.getByRole("button",{name:"Collapse sidebar",exact:true}).click();
    await page.getByRole("button",{name:"Accounts",exact:true}).click();await page.mouse.move(width-20,200);
    await expect(page.getByRole("heading",{name:"Your connected accounts",exact:true})).toBeVisible();
    await page.getByRole("combobox",{name:"Browser",exact:true}).selectOption("chrome");
    const guide=page.getByText("First time? Set up the browser connector",{exact:true});await guide.click();
    await expect(page.getByRole("button",{name:"Set up connector and open its folder",exact:true})).toBeVisible();
    expect(await page.locator("main").evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    expect(await page.locator(".account-card").evaluateAll(cards=>cards.every(card=>{
      const r=card.getBoundingClientRect(),title=card.querySelector(".account-title")!.getBoundingClientRect();
      const actions=card.querySelector(".control-actions")!.getBoundingClientRect();
      return title.left-r.left>=16&&actions.top-title.bottom>=16&&card.scrollWidth<=card.clientWidth;
    }))).toBe(true);
    await page.screenshot({path:info.outputPath(`accounts-${width}.png`)});
    await page.getByRole("button",{name:"Settings",exact:true}).click();
    expect(await page.locator("main").evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  }
});


test("collapsed sidebar remains centered and still on hover, and only icon clicks animate it",async({page},info)=>{
  await fixture(page,{active:false});await page.getByRole("button",{name:"Collapse sidebar",exact:true}).click();
  const sidebar=page.locator(".sidebar-shell");await expect(sidebar).toHaveClass(/collapsed/);await page.waitForTimeout(300);
  const shell=await sidebar.boundingBox(),mark=await page.locator(".sidebar-toggle").boundingBox();expect(Math.abs(mark!.x+mark!.width/2-shell!.x-shell!.width/2)).toBeLessThan(1);
  const before=await page.getByRole("button",{name:"Library",exact:true}).locator("svg").boundingBox();
  await page.mouse.move(35,200);await page.waitForTimeout(400);await expect(sidebar).toHaveClass(/collapsed/);expect(await page.locator(".sidebar-scroll").evaluate(e=>e.getBoundingClientRect().width)).toBe(72);
  const after=await page.getByRole("button",{name:"Library",exact:true}).locator("svg").boundingBox();expect(after).toEqual(before);
  await page.getByRole("button",{name:"Expand sidebar",exact:true}).click();await expect(sidebar).toHaveClass(/expanded/);await page.mouse.move(600,200);await page.waitForTimeout(400);await expect(sidebar).toHaveClass(/expanded/);
  await expect(sidebar.locator(".scroll-x")).toHaveCount(0);await page.getByRole("button",{name:"Collapse sidebar",exact:true}).click();await expect(sidebar).toHaveClass(/collapsed/);
  await page.screenshot({path:info.outputPath("persistent-sidebar.png")});await page.emulateMedia({reducedMotion:"reduce"});expect(await page.locator(".sidebar-scroll").evaluate(e=>getComputedStyle(e).transitionDuration)).toBe("0s");
});


for(const playback of ["original","cached"] as const) test(`initial ${playback} video opens without a second native decision call; manual preparation still works`,async({page})=>{
  await page.route("http://savedmedia.localhost/**",route=>route.fulfill({status:404,body:""}));
  await fixture(page,{active:false,videoFiles:true,videoPlayback:playback});
  await page.getByRole("button",{name:"View saved files"}).first().click();
  const expected=playback==="cached"?"/100/playback":"/100";
  await expect(page.locator("video")).toHaveAttribute("src",`http://savedmedia.localhost${expected}`);
  expect(await qa(page,"prepareCalls")).toBe(0);
  await page.getByRole("button",{name:"Use compatible playback",exact:true}).click();
  await expect.poll(()=>qa(page,"prepareCalls")).toBe(1);
  await expect(page.locator("video")).toHaveAttribute("src","http://savedmedia.localhost/100/playback");
});


test("left-click toggles once across player background without hijacking controls",async({page})=>{
  await fixture(page,{active:false,videoFiles:true,videoPlayback:"original"});
  await page.getByRole("button",{name:"View saved files"}).first().click();
  const video=page.locator("video");await expect(video).toBeVisible();
  await video.evaluate(element=>{
    const v=element as HTMLVideoElement;
    let paused=true;
    Object.defineProperty(v,"paused",{get:()=>paused});
    v.play=async()=>{paused=false;v.dispatchEvent(new Event("play"));};
    v.pause=()=>{paused=true;v.dispatchEvent(new Event("pause"));};
  });
  for(const target of [video,page.locator(".video-controls")]){
    await target.click({button:"left",position:{x:3,y:3}});
    expect(await video.evaluate(v=>(v as HTMLVideoElement).paused)).toBe(false);
    await target.click({button:"left",position:{x:3,y:3}});
    expect(await video.evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
  }
  await page.getByRole("button",{name:"Play video",exact:true}).click({button:"right"});
  expect(await video.evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
  await page.getByRole("slider",{name:"Video volume",exact:true}).click({button:"right"});
  expect(await video.evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
  await page.getByRole("button",{name:"Play video",exact:true}).click();
  expect(await video.evaluate(v=>(v as HTMLVideoElement).paused)).toBe(false);
  await page.getByRole("button",{name:"Pause video",exact:true}).click();
  expect(await video.evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
  await video.click({button:"right"});expect(await video.evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
  await video.dispatchEvent("contextmenu",{button:0});
  expect(await video.evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
  await video.focus();await page.keyboard.press("Space");expect(await video.evaluate(v=>(v as HTMLVideoElement).paused)).toBe(false);
  await page.keyboard.press("Space");expect(await video.evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
  // Middle click can enter browser autoscroll, which consumes subsequent keys.
  await video.click({button:"middle"});expect(await video.evaluate(v=>(v as HTMLVideoElement).paused)).toBe(true);
});

test("fullscreen animates media and preserves modal layout and scroll",async({page})=>{
  await fixture(page,{active:false});await page.getByRole("button",{name:"View saved files"}).first().click();
  const stage=page.locator(".media-stage"),slot=page.locator(".media-stage-slot"),viewport=page.locator(".media-dialog .dialog-scroll>.scroll-viewport");
  const before=await slot.boundingBox();const scroll=await viewport.evaluate(v=>v.scrollTop);
  await page.evaluate(()=>{
    (window as any).__motionFrames=[];
    document.addEventListener("fullscreenchange",()=>{
      let count=0;
      const sample=()=>{const stage=document.querySelector(".media-stage")!,img=stage.querySelector("img")!;(window as any).__motionFrames.push({full:!!document.fullscreenElement,transform:getComputedStyle(img).transform,animations:img.getAnimations().length,scroll:document.querySelector(".media-dialog .dialog-scroll>.scroll-viewport")!.scrollTop});if(++count<20)requestAnimationFrame(sample);};
      requestAnimationFrame(sample);
    });
  });
  await page.getByRole("button",{name:"Fullscreen",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await expect.poll(()=>stage.getAttribute("data-fullscreen-motion")).toBe(null);
  expect(await viewport.evaluate(v=>v.scrollTop)).toBe(scroll);
  const during=await slot.boundingBox();expect(Math.abs(during!.height-before!.height)).toBeLessThan(1);
  await page.keyboard.press("Escape");await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  await expect.poll(()=>stage.getAttribute("data-fullscreen-motion")).toBe(null);
  expect(await viewport.evaluate(v=>v.scrollTop)).toBe(scroll);
  const frames=await page.evaluate(()=>(window as any).__motionFrames);
  expect(frames.some((f:any)=>f.full&&f.animations&&f.transform!=="none")).toBe(true);
  expect(frames.some((f:any)=>!f.full&&f.animations&&f.transform!=="none")).toBe(true);
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.getByRole("button",{name:"Fullscreen",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  expect(await stage.getAttribute("data-fullscreen-motion")).toBe(null);
  expect(await stage.locator("img").evaluate(i=>i.getAnimations().length)).toBe(0);
  await page.getByRole("button",{name:"Close fullscreen",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
});


test("fullscreen holds dialog geometry through viewport resize then releases it",async({page})=>{
  await fixture(page,{active:false});await page.getByRole("button",{name:"View saved files"}).first().click();
  const dialog=page.locator(".media-dialog"),slot=page.locator(".media-stage-slot");
  const before=await dialog.boundingBox(),slotBefore=await slot.boundingBox();
  await page.getByRole("button",{name:"Fullscreen",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await page.setViewportSize({width:1280,height:720});
  expect(await dialog.boundingBox()).toEqual(before);expect(await slot.boundingBox()).toEqual(slotBefore);
  await page.setViewportSize({width:1366,height:768});
  await page.keyboard.press("Escape");await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  await expect.poll(()=>dialog.getAttribute("data-fullscreen-shell")).toBe(null);
  expect(await dialog.evaluate(d=>d.style.getPropertyValue("--viewer-height"))).toBe("");
  expect(await dialog.boundingBox()).toEqual(before);
});

test("rejected fullscreen cannot leave the dialog locked or backdrop darkened",async({page})=>{
  await fixture(page,{active:false});await page.getByRole("button",{name:"View saved files"}).first().click();
  await page.locator(".media-stage").evaluate(stage=>{stage.requestFullscreen=async()=>{throw new Error("Fullscreen request rejected for test");};});
  await page.getByRole("button",{name:"Fullscreen",exact:true}).click();
  await expect(page.locator(".media-dialog .error-banner")).toContainText("Fullscreen request rejected for test");
  expect(await page.locator(".media-dialog").getAttribute("data-fullscreen-shell")).toBe(null);
  expect(await page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  expect(await page.locator(".media-dialog").evaluate(d=>Number(getComputedStyle(d,"::backdrop").opacity))).toBeCloseTo(187/255,5);
  await page.getByRole("button",{name:"Close",exact:true}).click();await expect(page.locator("dialog[open]")).toHaveCount(0);
});


test("public platforms queue without fake account connections and removed sources are absent",async({page})=>{
  await fixture(page,{active:false});
  await page.getByRole("button",{name:"Add download",exact:true}).click();
  const dialog=page.locator("dialog[open]");const platform=dialog.getByRole("combobox",{name:"Platform",exact:true});
  await expect(platform.locator("option")).toHaveCount(7);
  await platform.selectOption("x");await expect(dialog.getByText("Connect your X account before downloading.")).toBeVisible();
  for(const source of ["youtube","facebook","tiktok","pinterest","discord"]){
    await platform.selectOption(source);await expect(dialog.getByRole("button",{name:"Start download",exact:true})).toBeDisabled();
    await expect(dialog.getByRole("textbox",{name:source==="discord"?"Media attachment link":"Post or collection link",exact:true})).toBeVisible();
    await expect(dialog.getByRole("button",{name:"View accounts",exact:true})).toHaveCount(0);
  }
  await expect(platform.locator('option[value="spotify"],option[value="reddit"]')).toHaveCount(0);
  await platform.selectOption("youtube");
  await page.evaluate(()=>{(window as any).__qa.downloadExisting=1;});
  await dialog.getByRole("textbox",{name:"Post or collection link",exact:true}).fill("https://www.youtube.com/playlist?list=PL123456789012");
  await dialog.getByRole("button",{name:"Start download",exact:true}).click();
  await expect(dialog.getByRole("heading",{name:"You have saved this collection before"})).toBeVisible();
  await dialog.getByRole("button",{name:"Download new items",exact:true}).click();await expect(dialog).toHaveCount(0);
});

test("platform filtering queries the library and can be cleared",async({page})=>{
  await fixture(page,{active:false});
  await page.getByRole("combobox",{name:"Library platform",exact:true}).selectOption("youtube");
  await expect(page.getByRole("heading",{name:"No matching content"})).toBeVisible();
  await page.getByRole("button",{name:"Clear search and filters",exact:true}).click();
  await expect(page.getByTestId("library-list").locator("article").first()).toBeVisible();
  await expect(page.getByRole("combobox",{name:"Library platform",exact:true})).toHaveValue("");
});

test("all new download forms remain accessible and contained at a narrow viewport",async({page})=>{
  await page.setViewportSize({width:380,height:800});await fixture(page,{active:false});
  await page.getByRole("button",{name:"Add download",exact:true}).click();
  const dialog=page.locator("dialog[open]");
  for(const source of ["youtube","facebook","tiktok","pinterest","discord"]){
    await dialog.getByRole("combobox",{name:"Platform",exact:true}).selectOption(source);
    const result=await new AxeBuilder({page}).include("dialog[open]").analyze();expect(result.violations,source).toEqual([]);
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),source).toBe(true);
  }
});

test("live progress shows measured bytes without inventing a collection percentage", async ({page})=>{
  await fixture(page);await page.goto("/");await page.getByRole("button",{name:"Downloads",exact:true}).click();
  await expect(page.locator("progress")).toHaveCount(1);
  await expect(page.locator("progress")).not.toHaveAttribute("value");
  await page.evaluate(()=>{(window as any).__qa.workerEvent({payload:{event:"download_progress",job_id:"job",data:{phase:"downloading",received:50,total:100}}});});
  await expect(page.locator("progress")).toHaveAttribute("value","50");
  await expect(page.getByText("Current file: 50 B of 100 B (50%)")).toBeVisible();
  await page.evaluate(()=>{(window as any).__qa.workerEvent({payload:{event:"download_progress",job_id:"job",data:{phase:"processing",received:0,total:null}}});});
  await expect(page.getByText("Checking and preparing the downloaded file")).toBeVisible();
  await expect(page.locator("progress")).not.toHaveAttribute("value");
  await page.getByRole("button",{name:"Library",exact:true}).click();await page.getByRole("button",{name:"Downloads",exact:true}).click();
  await expect(page.getByText("Checking and preparing the downloaded file")).toBeVisible();
  await page.evaluate(()=>{(window as any).__qa.workerEvent({payload:{event:"item_completed",job_id:"job",data:{}}});});
  await expect(page.getByText("Finding the next item or waiting for the platform")).toBeVisible();
});
test("browser-session connectors distinguish approved sessions from verified identities",async({page})=>{
  await fixture(page);await page.goto("/");await page.getByRole("button",{name:"Accounts",exact:true}).click();
  for(const name of ["Instagram","X","YouTube","Facebook","TikTok","Pinterest"])await expect(page.getByRole("heading",{name,exact:true})).toBeVisible();
  await expect(page.getByText("Private Reddit downloads need an approved API application",{exact:false})).toHaveCount(0);
});
test("video repeat toggles the native loop and is remembered for the next opening",async({page})=>{
  await fixture(page,{videoFiles:true});await page.goto("/");await page.getByRole("button",{name:"View saved files",exact:true}).first().click();
  const repeat=page.getByRole("button",{name:"Repeat video",exact:true});await expect(repeat).toHaveAttribute("aria-pressed","false");
  await repeat.click();await expect(repeat).toHaveAttribute("aria-pressed","true");await expect.poll(()=>page.locator("dialog[open] video").evaluate((video:HTMLVideoElement)=>video.loop)).toBe(true);
  await page.getByRole("button",{name:"Close",exact:true}).click();await page.getByRole("button",{name:"View saved files",exact:true}).first().click();
  await expect(repeat).toHaveAttribute("aria-pressed","true");await repeat.click();await expect.poll(()=>page.locator("dialog[open] video").evaluate((video:HTMLVideoElement)=>video.loop)).toBe(false);
});

test("post deletion requires review and cancel never deletes",async({page})=>{
  await fixture(page,{active:false});await page.getByRole("button",{name:"Delete post by Creator 100",exact:true}).click();
  const confirm=page.getByRole("dialog",{name:"Delete this post and every saved copy?"});await expect(confirm).toContainText("2 saved copies, 4 stored files");
  await confirm.getByRole("button",{name:"Cancel",exact:true}).click();expect(await qa(page,"deletions")).toEqual([]);
  await page.getByRole("button",{name:"Delete post by Creator 100",exact:true}).click();await confirm.getByRole("button",{name:"Delete permanently"}).click();
  await expect(confirm).not.toBeVisible();await expect(page.getByRole("button",{name:"Delete post by Creator 100",exact:true})).toHaveCount(0);expect(await qa(page,"deletions")).toEqual(["delete-token"]);
});
test("download and collection deletion show distinct scopes",async({page})=>{
  await fixture(page,{active:false});await page.getByRole("button",{name:"Downloads",exact:true}).click();
  await page.getByRole("button",{name:"Delete download",exact:true}).click();let confirm=page.getByRole("dialog",{name:"Delete this download and its saved files?"});await expect(confirm).toContainText("1 download history entry");await confirm.getByRole("button",{name:"Cancel",exact:true}).click();
  await page.getByRole("button",{name:"Delete collection",exact:true}).click();confirm=page.getByRole("dialog",{name:"Delete this collection and all its downloads?"});await expect(confirm).toContainText("2 download history entries");await confirm.getByRole("button",{name:"Delete permanently"}).click();await expect(page.getByRole("heading",{name:"No downloads yet"})).toBeVisible();
});
test("saved file deletion is accessible from the viewer and closes playback safely",async({page})=>{
  await fixture(page,{active:false,videoFiles:true});await page.getByRole("button",{name:"View saved files"}).first().click();const viewer=page.getByRole("dialog",{name:"Creator 100",exact:true});await viewer.getByRole("button",{name:"Delete file",exact:true}).first().click();
  const confirm=page.getByRole("dialog",{name:"Delete this saved file?"});await expect(confirm).toBeVisible();await expect(confirm.getByRole("button",{name:"Cancel",exact:true})).toBeFocused();await confirm.getByRole("button",{name:"Delete permanently"}).click();await expect(confirm).not.toBeVisible();await expect(viewer).not.toBeVisible();expect(await qa(page,"deletions")).toEqual(["delete-token"]);
});
test("active downloads and changed files cannot be deleted",async({page})=>{
  await fixture(page);await page.getByRole("button",{name:"Delete post by Creator 100",exact:true}).click();const confirm=page.getByRole("dialog",{name:"Delete this post and every saved copy?"});await expect(confirm.getByRole("alert")).toContainText("Pause or finish");await expect(confirm.getByRole("button",{name:"Delete permanently"})).toBeDisabled();await confirm.getByRole("button",{name:"Close",exact:true}).click();
  await page.evaluate(()=>{(window as any).__qa.active=false;(window as any).__qa.deletionFail=true;});await page.getByRole("button",{name:"Delete post by Creator 100",exact:true}).click();await confirm.getByRole("button",{name:"Delete permanently"}).click();await expect(confirm.getByRole("alert")).toContainText("files changed");await expect(confirm.getByRole("button",{name:"Delete permanently"})).toBeDisabled();expect(await qa(page,"deletions")).toEqual([]);
});


test("batch selection supports shift ranges, one review, cancel and selected-only deletion",async({page})=>{
  await fixture(page,{active:false});
  const first=page.getByRole("checkbox",{name:"Select post by Creator 100",exact:true});
  await first.click();await page.getByRole("checkbox",{name:"Select post by Creator 97",exact:true}).click({modifiers:["Shift"]});
  await expect(page.getByRole("button",{name:"Delete selected (4)",exact:true})).toBeEnabled();await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.getByRole("button",{name:"Delete selected (4)",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Delete 4 selected posts and every saved copy?"});
  await expect(dialog.getByRole("button",{name:"Cancel",exact:true})).toBeFocused();expect(await qa(page,"deletionTarget")).toEqual({kind:"posts",id:[97,98,99,100]});
  await dialog.getByRole("button",{name:"Cancel",exact:true}).click();expect(await qa(page,"deletions")).toEqual([]);await expect(first).toBeChecked();
  await page.getByRole("button",{name:"Delete selected (4)",exact:true}).click();await dialog.getByRole("button",{name:"Delete permanently"}).click();
  await expect(first).toHaveCount(0);await expect(page.getByRole("checkbox",{name:"Select post by Creator 96",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Delete selected (0)",exact:true})).toBeDisabled();expect(await qa(page,"deletions")).toEqual(["delete-token"]);
});

test("batch selection includes virtualized rows and clears on filters and search",async({page})=>{
  await fixture(page,{active:false});await page.getByRole("button",{name:"Select this page",exact:true}).click();
  await expect(page.getByRole("button",{name:"Delete selected (100)",exact:true})).toBeEnabled();
  const list=page.getByTestId("library-list");await list.evaluate(el=>{el.scrollTop=1408;});await expect(list.locator("input[type=checkbox]").first()).toBeChecked();expect(await list.locator("article").count()).toBeLessThanOrEqual(18);
  await page.getByRole("button",{name:"Delete selected (100)",exact:true}).click();expect((await qa(page,"deletionTarget")).id).toHaveLength(100);
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await page.getByRole("combobox",{name:"Library platform",exact:true}).selectOption("instagram");await expect(page.getByRole("button",{name:"Delete selected (0)",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Select this page",exact:true}).click();await page.getByRole("textbox",{name:"Search your library"}).fill("Saved caption 100");
  await expect(list.locator("article")).toHaveCount(1);await expect(page.getByRole("button",{name:"Delete selected (0)",exact:true})).toBeDisabled();
});

test("batch keyboard selection and failed review preserve content",async({page})=>{
  await fixture(page,{active:false});const checkbox=page.getByRole("checkbox",{name:"Select post by Creator 100",exact:true});await checkbox.focus();await page.keyboard.press("Space");await expect(checkbox).toBeChecked();
  await page.keyboard.press("Control+a");await expect(page.getByRole("button",{name:"Delete selected (100)",exact:true})).toBeEnabled();
  await page.keyboard.press("Escape");await expect(checkbox).not.toBeChecked();await page.keyboard.press("Space");
  await page.evaluate(()=>{(window as any).__qa.active=true;});await page.keyboard.press("Delete");const dialog=page.getByRole("dialog",{name:"Delete 1 selected post and every saved copy?"});await expect(dialog.getByRole("alert")).toContainText("Pause or finish");await expect(dialog.getByRole("button",{name:"Delete permanently"})).toBeDisabled();
  await dialog.getByRole("button",{name:"Close",exact:true}).click();await expect(checkbox).toBeChecked();expect(await qa(page,"deletions")).toEqual([]);
  await page.evaluate(()=>{(window as any).__qa.active=false;(window as any).__qa.deletionFail=true;});await page.getByRole("button",{name:"Delete selected (1)",exact:true}).click();await dialog.getByRole("button",{name:"Delete permanently"}).click();await expect(dialog.getByRole("alert")).toContainText("files changed");expect(await qa(page,"deletions")).toEqual([]);
});

test("removed Reddit has no setup action and Discord media links remain ready",async({page})=>{
  await fixture(page,{active:false});await page.getByRole("button",{name:"Accounts",exact:true}).click();
  await expect(page.getByText("API approval needed",{exact:true})).toHaveCount(0);await expect(page.getByRole("heading",{name:"Reddit",exact:true})).toHaveCount(0);await expect(page.getByText("Ready for media links",{exact:true})).toBeVisible();
  await page.getByText("Copy a Discord media link",{exact:true}).click();await expect(page.locator('.account-card').filter({has:page.getByRole('heading',{name:'Discord',exact:true})})).toContainText("A message/channel link is different");
  await expect(page.getByRole("button",{name:"Request Reddit API access",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Download Discord media",exact:true}).click();const dialog=page.locator("dialog[open]");await expect(dialog.getByRole("combobox",{name:"Platform",exact:true})).toHaveValue("discord");await expect(dialog.getByRole("textbox",{name:"Media attachment link",exact:true})).toBeVisible();await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
  const result=await new AxeBuilder({page}).include(".account-card:has(.provider-guide)").analyze();expect(result.violations).toEqual([]);
});


test("batch selection clears when changing library pages",async({page})=>{
  await fixture(page,{active:false,paginated:true});await page.getByRole("button",{name:"Select this page",exact:true}).click();await expect(page.getByRole("button",{name:"Delete selected (100)",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"Next page",exact:true}).click();await expect(page.getByRole("checkbox",{name:"Select post by Creator 50",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Delete selected (0)",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Select this page",exact:true}).click();await expect(page.getByRole("button",{name:"Delete selected (50)",exact:true})).toBeEnabled();await page.getByRole("button",{name:"Back to newest",exact:true}).click();await expect(page.getByRole("checkbox",{name:"Select post by Creator 150",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Delete selected (0)",exact:true})).toBeDisabled();
});


test("Discord media links queue without account setup and preserve duplicate review",async({page})=>{
 await fixture(page,{active:false});await page.getByRole("button",{name:"Accounts",exact:true}).click();await page.getByRole("button",{name:"Download Discord media",exact:true}).click();
 const dialog=page.locator("dialog[open]");await expect(dialog).toContainText("No account connection or server setup is needed");await expect(page.getByRole("button",{name:"Open Discord Developer Portal",exact:true})).toHaveCount(0);
 const link="https://cdn.discordapp.com/attachments/111/222/voice.wav?ex=abcd&is=1234&hm=123abc";await dialog.getByRole("textbox",{name:"Media attachment link",exact:true}).fill(link);await dialog.getByRole("button",{name:"Start download",exact:true}).click();await expect(dialog).toHaveCount(0);
 expect((await qa(page,"downloadRequests"))[0]).toMatchObject({source:"discord",target:link});
 await page.getByRole("button",{name:"Download Discord media",exact:true}).click();await page.evaluate(()=>{(window as any).__qa.downloadExisting=1;});await dialog.getByRole("textbox",{name:"Media attachment link",exact:true}).fill(link.replace("abcd","abce"));await dialog.getByRole("button",{name:"Start download",exact:true}).click();await expect(dialog.getByRole("heading",{name:"You have saved this post before"})).toBeVisible();await dialog.getByRole("button",{name:"Download new items",exact:true}).click();expect(await qa(page,"queuedModes")).toEqual(["new_only","new_only"]);
});


test("seven sidebar platform sections filter saved posts in the requested order",async({page},info)=>{
 await fixture(page,{active:false,allPlatforms:true});
 const labels=["YouTube","Facebook","Instagram","Discord","TikTok","Pinterest","X (F.K.A. Twitter)"];
 const sources=["youtube","facebook","instagram","discord","tiktok","pinterest","x"];
 await expect(page.locator("#sidebar-navigation button")).toHaveText(["Library",...labels,"Downloads"]);
 for(let i=0;i<labels.length;i++){
  await page.getByRole("button",{name:labels[i],exact:true}).click();
  await expect(page.getByRole("heading",{name:labels[i],exact:true})).toBeVisible();
  await expect.poll(async()=>((await qa(page,"lastQuery")) as any)?.source).toBe(sources[i]);
  await expect(page.getByTestId("library-list").locator("article").first()).toBeVisible();
 }
 await page.getByRole("button",{name:"Collapse sidebar",exact:true}).click();await page.mouse.move(800,300);
 await expect(page.locator(".sidebar-shell")).toHaveClass(/collapsed/);
 expect(await page.locator(".sidebar").evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath("seven-platform-sidebar.png")});
});

test("volume and mute persist between posts, reloads and keyboard adjustments",async({page})=>{
 await fixture(page,{active:false,videoFiles:true,videoPlayback:"original"});
 const open=async()=>{await page.getByRole("button",{name:"View saved files",exact:true}).first().click();await expect(page.locator("video")).toBeVisible();};
 await open();const slider=page.getByRole("slider",{name:"Video volume",exact:true});
 await slider.focus();await slider.press("Home");await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("saveddesk.video.volume")!)?.volume)).toBe(0);
 await page.locator("video").focus();await page.keyboard.press("ArrowUp");
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("saveddesk.video.volume")!)?.volume)).toBeCloseTo(.1,5);
 await page.getByRole("button",{name:"Mute video",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("saveddesk.video.volume")!)?.muted)).toBe(true);
 await page.getByRole("button",{name:"Close",exact:true}).click();await open();
 await expect.poll(()=>page.locator("video").evaluate(v=>({volume:(v as HTMLVideoElement).volume,muted:(v as HTMLVideoElement).muted}))).toEqual({volume:.1,muted:true});
 await page.getByRole("button",{name:"Close",exact:true}).click();await page.reload();await open();
 await expect(page.getByRole("button",{name:"Unmute video",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Unmute video",exact:true}).click();await expect(slider).toHaveValue("10");
 await slider.press("End");await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("saveddesk.video.volume")!)?.volume)).toBe(1);
});

test("all rendered input variants have no focus borders or shadow overlays",async({page})=>{
 await fixture(page,{active:false,videoFiles:true,videoPlayback:"original"});const audited=new Set<string>();
 async function audit(context:string){
  const controls=page.locator('input:visible,select:visible,textarea:visible,button:visible,summary:visible,[role="scrollbar"]:visible');
  await page.keyboard.press("Tab");
  const results=await controls.evaluateAll(elements=>elements.filter(el=>!el.matches(":disabled")).map(el=>{
   const element=el as HTMLElement;element.blur();const before=getComputedStyle(element),border=[before.borderTopWidth,before.borderTopColor];element.focus();
   if(!element.isConnected)return null;const after=getComputedStyle(element);return {type:element.tagName+":"+(element instanceof HTMLInputElement?element.type:element.getAttribute("type")??""),label:element.getAttribute("aria-label")??element.textContent?.slice(0,30),outline:after.outlineStyle,shadow:after.boxShadow,border,focusedBorder:[after.borderTopWidth,after.borderTopColor]};
  }));
  for(const result of results){if(!result)continue;expect(result.outline,context+":"+result.label).toBe("none");expect(result.shadow,context+":"+result.label).toBe("none");expect(result.focusedBorder[0],context+":"+result.label).toBe(result.border[0]);if(parseFloat(result.border[0])>0)expect(result.focusedBorder[1],context+":"+result.label).toBe(result.border[1]);audited.add(result.type);}
 }
 await audit("library");await page.getByRole("button",{name:"Settings",exact:true}).click();await page.getByRole("button",{name:"Advanced video settings",exact:true}).click();await audit("settings");
 await page.getByRole("button",{name:"Accounts",exact:true}).click();await audit("accounts");await page.getByRole("combobox",{name:"Browser",exact:true}).selectOption("firefox");await expect(page.getByRole("combobox",{name:"Firefox profile",exact:true})).toBeVisible();await audit("firefox-profile");
 await page.getByRole("button",{name:"Add download",exact:true}).click();
 for(const source of ["youtube","facebook","instagram","discord","tiktok","pinterest","x"]){await page.getByRole("combobox",{name:"Platform",exact:true}).selectOption(source);await expect(page.getByRole("dialog").getByRole("button",{name:"Advanced video settings",exact:true})).toHaveCount(0);await audit("download:"+source);}
 await page.getByRole("button",{name:"Cancel",exact:true}).click();await page.getByRole("button",{name:"Library",exact:true}).click();
 await page.getByRole("button",{name:"View saved files",exact:true}).first().click();await audit("video");await page.getByRole("button",{name:"Close",exact:true}).click();
 await page.getByRole("button",{name:"Help & shortcuts",exact:true}).click();await audit("help");await page.getByRole("button",{name:"Close help",exact:true}).click();
 await page.getByRole("button",{name:"Delete post by Creator 100",exact:true}).click();await audit("deletion");
 expect([...audited]).toEqual(expect.arrayContaining(["INPUT:checkbox","INPUT:range","INPUT:text","SELECT:","BUTTON:","SUMMARY:"]));
});


test("advanced video defaults persist rapid changes, explain every choice, and reset together",async({page})=>{
  await fixture(page,{active:false,slowSettings:true});await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByRole("button",{name:"Advanced video settings",exact:true}).click();
  await page.getByRole("combobox",{name:"Encoding method",exact:true}).selectOption("software");
  await page.getByRole("combobox",{name:"Software encoding speed",exact:true}).selectOption("slow");
  await page.getByRole("combobox",{name:"Software video quality",exact:true}).selectOption("18");
  await page.getByRole("combobox",{name:"Converted audio bitrate",exact:true}).selectOption("256");
  await expect.poll(async()=>(await qa(page,"settings")).advanced).toEqual({encoder:"software",preset:"slow",crf:18,audioBitrate:256});
  for(const name of ["Video quality","Output profile","Encoding method","Software encoding speed","Software video quality","Converted audio bitrate"])await inspectSettingHelp(page,name);
  await page.getByRole("button",{name:"Library",exact:true}).click();await page.getByRole("button",{name:"Settings",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"Converted audio bitrate",exact:true})).toHaveValue("256");
  await page.getByRole("button",{name:"Restore default video settings",exact:true}).click();
  await expect.poll(async()=>(await qa(page,"settings")).advanced).toEqual({encoder:"auto",preset:"superfast",crf:23,audioBitrate:128});
  expect(await qa(page,"maxInFlight")).toBe(1);
});

test("downloads capture Settings advanced defaults and survive confirmation polling",async({page})=>{
  await fixture(page,{active:true});await page.getByRole("button",{name:"Settings",exact:true}).click();await page.getByRole("button",{name:"Advanced video settings",exact:true}).click();
  await page.getByRole("combobox",{name:"Software video quality",exact:true}).selectOption("18");await expect.poll(async()=>(await qa(page,"settings")).advanced.crf).toBe(18);
  await page.evaluate(()=>{(window as any).__qa.downloadExisting=1;});
  await page.getByRole("button",{name:"Add download",exact:true}).click();const dialog=page.getByRole("dialog");
  await expect(dialog.getByRole("button",{name:"Advanced video settings",exact:true})).toHaveCount(0);await expect(dialog.getByRole("combobox",{name:"Encoding method",exact:true})).toHaveCount(0);
  await dialog.getByRole("button",{name:"Start download",exact:true}).click();await expect(dialog.getByRole("button",{name:"Download new items",exact:true})).toBeVisible();
  const requests=await qa(page,"downloadRequests");expect(requests[0].advanced).toEqual({encoder:"auto",preset:"superfast",crf:18,audioBitrate:128});
  await expect.poll(()=>qa(page,"snapshots"),{timeout:6000}).toBeGreaterThan(2);await expect(dialog.getByRole("button",{name:"Download new items",exact:true})).toBeVisible();
  await dialog.getByRole("button",{name:"Download new items",exact:true}).click();expect((await qa(page,"settings")).advanced.encoder).toBe("auto");
});

test("selection checkboxes and configuration switches retain keyboard behavior without focus borders",async({page})=>{
  await fixture(page,{active:false});const first=page.getByRole("checkbox",{name:"Select post by Creator 100",exact:true});await first.focus();await page.keyboard.press("Space");await expect(first).toBeChecked();
  await page.getByRole("checkbox",{name:"Select post by Creator 98",exact:true}).click({modifiers:["Shift"]});await expect(page.getByRole("button",{name:"Delete selected (3)",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"Settings",exact:true}).click();const mode=page.getByRole("switch",{name:/Low-resource mode/});await expect(mode).toBeChecked();await mode.focus();await page.keyboard.press("Space");await expect(mode).not.toBeChecked();
  await expect.poll(async()=>(await qa(page,"settings")).lowResource).toBe(false);
  const styles=await mode.evaluate(input=>{const s=getComputedStyle(input),track=input.nextElementSibling!,thumb=track.firstElementChild!;return {outline:s.outlineStyle,shadow:s.boxShadow,track:getComputedStyle(track).borderRadius,width:track.getBoundingClientRect().width,thumb:thumb.getBoundingClientRect().width};});
  expect(styles).toMatchObject({outline:"none",shadow:"none",width:40,thumb:18});expect(parseInt(styles.track)).toBeGreaterThan(20);await expect(page.getByRole("checkbox")).toHaveCount(0);
});

for(const width of [1366,760,380])test(`expanded advanced explanations and switches are accessible at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:800});await fixture(page,{active:false});await page.getByRole("button",{name:"Settings",exact:true}).click();await page.mouse.move(width-20,20);if(width<1000)await expect(page.locator(".sidebar-shell")).not.toHaveClass(/expanded/);await page.getByRole("button",{name:"Advanced video settings",exact:true}).click();
  for(const name of ["Video quality","Output profile","Encoding method","Software encoding speed","Software video quality","Converted audio bitrate"])await inspectSettingHelp(page,name);
  expect(await page.locator("main").evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const audit=await new AxeBuilder({page}).analyze();expect(audit.violations).toEqual([]);
  await page.getByRole("combobox",{name:"Software video quality",exact:true}).focus();expect(await page.getByRole("combobox",{name:"Software video quality",exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle)).toBe("none");
  await page.screenshot({path:info.outputPath("advanced-settings.png"),fullPage:true});
});


test("download info popup is accessible, contained and dismisses without closing its parent",async({page},info)=>{
 await page.setViewportSize({width:380,height:800});await fixture(page,{active:false});await page.getByRole("button",{name:"Add download",exact:true}).click();
 const parent=page.getByRole("dialog",{name:"Add download",exact:true});await expect(parent.locator(".dialog-icon")).toHaveCount(0);await expect(parent.getByRole("button",{name:"Advanced video settings",exact:true})).toHaveCount(0);
 const trigger=parent.getByRole("button",{name:"About Video quality",exact:true});await trigger.focus();await page.keyboard.press("Enter");
 const popup=page.getByRole("dialog",{name:"About Video quality",exact:true});await expect(popup).toBeVisible();const box=await popup.boundingBox();expect(box!.width).toBeLessThanOrEqual(348);expect(box!.x).toBeGreaterThanOrEqual(16);
 const audit=await new AxeBuilder({page}).analyze();expect(audit.violations).toEqual([]);await page.screenshot({path:info.outputPath("download-info-popup.png")});
 await page.keyboard.press("Escape");await expect(popup).toHaveCount(0);await expect(parent).toBeVisible();await expect(trigger).toBeFocused();
 await inspectSettingHelp(page,"Output profile");await parent.getByRole("button",{name:"Cancel",exact:true}).click();expect(await qa(page,"downloadRequests")).toEqual([]);
});


for(const width of [1366,760,380])test(`full visual control and spacing audit at ${width}px`,async({page},info)=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:900});await fixture(page,{active:false,allPlatforms:true,approvedSessions:true});
 const report:{screen:string;buttons:number;selects:number}[]=[];
 async function audit(label:string){
  const readButtons=()=>page.locator("button:visible").evaluateAll(nodes=>nodes.filter(node=>node.isConnected).map(node=>{const b=node.getBoundingClientRect(),s=getComputedStyle(node),walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let current;const text=[];
   while(current=walker.nextNode()){const parent=current.parentElement;if(!current.textContent?.trim()||!parent||getComputedStyle(parent).visibility==="hidden")continue;const range=document.createRange();range.selectNodeContents(current);for(const r of range.getClientRects())text.push({left:r.left,right:r.right,top:r.top,bottom:r.bottom});}
   return {info:node.classList.contains("setting-info"),name:node.getAttribute("aria-label")??node.textContent?.trim(),height:b.height,border:parseFloat(s.borderTopWidth),style:s.borderTopStyle,textFits:text.every(r=>r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1)};
  }));
  // Inspect settled geometry, including sidebar label fade/collapse transitions.
  await expect.poll(async()=>(await readButtons()).every(button=>button.textFits),{message:label+": visible button text must fit after transitions"}).toBe(true);
  const buttons=await readButtons();
  for(const button of buttons){expect(button.height,label+":"+button.name).toBeCloseTo(40,0);if(button.info){expect(button.border).toBe(0);expect(button.style).toBe("none");}else{expect(button.border,label+":"+button.name).toBeGreaterThanOrEqual(1);expect(button.style,label+":"+button.name).toBe("solid");}expect(button.textFits,label+":"+button.name).toBe(true);}
  const selects=await page.locator("select:visible").evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return {label:n.getAttribute("aria-label")??(n as HTMLSelectElement).labels?.[0]?.textContent,height:n.getBoundingClientRect().height,right:parseFloat(s.paddingRight),appearance:s.appearance,arrow:s.backgroundImage};}));
  for(const select of selects){expect(select.height,label+":"+select.label).toBeCloseTo(40,0);expect(select.right,label+":"+select.label).toBeGreaterThanOrEqual(40);expect(select.appearance).toBe("none");expect(select.arrow).toContain("svg");}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label).toBe(true);expect(await page.locator("main").evaluate(e=>e.scrollWidth<=e.clientWidth),label).toBe(true);
  report.push({screen:label,buttons:buttons.length,selects:selects.length});await page.screenshot({path:info.outputPath(label.replaceAll(" ","-")+".png")});
 }
 for(const screen of ["Library","YouTube","Facebook","Instagram","Discord","TikTok","Pinterest","X (F.K.A. Twitter)","Downloads","Accounts","Settings"]){
  await page.getByRole("button",{name:screen,exact:true}).click();if(screen==="Settings"){await page.getByRole("button",{name:"Advanced video settings",exact:true}).click();for(const name of ["Video quality","Output profile","Encoding method","Software encoding speed","Software video quality","Converted audio bitrate"])await inspectSettingHelp(page,name);}
  if(screen==="Accounts"){
   const cards=await page.locator(".connected-accounts > .account-card").evaluateAll(nodes=>nodes.map(n=>({name:n.querySelector("h3")?.textContent,top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom})));expect(cards.map(c=>c.name)).toEqual(["Instagram","X","YouTube","Facebook","TikTok","Pinterest","Discord"]);
   for(let i=1;i<cards.length;i++)expect(cards[i].top-cards[i-1].bottom).toBeGreaterThanOrEqual(20);
   expect(await page.locator(".account-privacy").evaluate(n=>!!(n.compareDocumentPosition(document.querySelector(".connected-accounts")!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  }
  const source=({Library:null,YouTube:"youtube",Facebook:"facebook","Instagram":"instagram",Discord:"discord",TikTok:"tiktok",Pinterest:"pinterest","X (F.K.A. Twitter)":"x"} as Record<string,string|null>)[screen];
  if(source!==undefined){await expect.poll(async()=>(await qa(page,"lastQuery")).source).toBe(source);await expect(page.locator(".library-section")).toHaveAttribute("aria-busy","false");}
  await audit(screen);
 }
 await page.getByRole("button",{name:"Add download",exact:true}).click();const dialog=page.getByRole("dialog");await expect(dialog.getByRole("button",{name:"Advanced video settings",exact:true})).toHaveCount(0);await audit("Download dialog");await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
 await page.getByRole("button",{name:"Library",exact:true}).click();
 // Wait for the unfiltered result instead of opening a stale row from the prior platform.
 await expect.poll(async()=>(await qa(page,"lastQuery")).source).toBe(null);
 await expect(page.locator(".library-section")).toHaveAttribute("aria-busy","false");
 const newest=page.getByTestId("library-list").locator("article").filter({has:page.getByRole("button",{name:"Delete post by Creator 100",exact:true})});
 await newest.getByRole("button",{name:"View saved files",exact:true}).click();await audit("Image viewer");await page.getByRole("button",{name:"Close",exact:true}).click();
 await page.getByRole("button",{name:"Help & shortcuts",exact:true}).click();await audit("Help dialog");await page.getByRole("button",{name:"Close help",exact:true}).click();
 await page.getByRole("button",{name:"Delete post by Creator 100",exact:true}).click();await audit("Deletion dialog");await page.getByRole("button",{name:"Cancel",exact:true}).click();
 await info.attach("visual-control-audit.json",{body:JSON.stringify(report,null,2),contentType:"application/json"});
});

for(const width of [1366,760,380])test(`search keeps fixed geometry, info has no border and actions are padded at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:800});await fixture(page,{active:false});await expect.poll(async()=>(await page.locator(".sidebar-shell").boundingBox())!.width).toBe(width>900?240:72);const search=page.getByRole("textbox",{name:"Search your library"});
 const before=await page.locator(".search-field").boundingBox(),inputBefore=await search.boundingBox();await search.fill("Saved caption 100");await expect(page.getByRole("button",{name:"Clear search",exact:true})).toBeVisible();expect(await page.locator(".search-field").boundingBox()).toEqual(before);expect(await search.boundingBox()).toEqual(inputBefore);
 await page.getByRole("button",{name:"Clear search",exact:true}).click();expect(await page.locator(".search-field").boundingBox()).toEqual(before);expect(await search.boundingBox()).toEqual(inputBefore);
 await page.getByRole("button",{name:"Settings",exact:true}).click();const advanced=page.getByRole("button",{name:"Advanced video settings",exact:true});expect(await advanced.evaluate(b=>parseFloat(getComputedStyle(b).paddingLeft))).toBeGreaterThanOrEqual(14);
 const trigger=page.getByRole("button",{name:"About Video quality",exact:true});await trigger.scrollIntoViewIfNeeded();const normal=await trigger.evaluate(b=>({border:getComputedStyle(b).borderTopWidth,color:getComputedStyle(b).color,cursor:getComputedStyle(b).cursor}));expect(normal.border).toBe("0px");expect(normal.cursor).toBe("pointer");await trigger.hover();expect(await trigger.evaluate(b=>getComputedStyle(b).color)).not.toBe(normal.color);
 await trigger.click();const popup=page.getByRole("dialog",{name:"About Video quality",exact:true});await expect(popup).toBeVisible();await page.mouse.click(2,2);await expect(popup).toHaveCount(0);await expect(trigger).toBeFocused();
 await page.getByRole("button",{name:"Help & shortcuts",exact:true}).click();const close=page.getByRole("button",{name:"Close help",exact:true});await expect(close.locator("svg")).toHaveCount(1);expect(await close.innerText()).toBe("");const box=await close.boundingBox();expect(box!.height).toBe(40);expect(box!.width).toBe(40);await page.screenshot({path:info.outputPath("help-icon-close.png")});await close.click();
});


test("external tool selection persists without overflowing its settings card",async({page})=>{
 await fixture(page,{active:false});
 await page.getByRole("button",{name:"Settings",exact:true}).click();
 const panel=page.locator(".external-tools-panel");
 await expect(panel.getByRole("heading",{name:"Download tools"})).toBeVisible();
 await panel.getByRole("button",{name:"Choose Gallery Python environment",exact:true}).click();
 await expect(panel.locator("code").first()).toHaveText("C:\\FixtureTools\\python.exe");
 expect(await page.evaluate(()=>(window as any).__qa.toolSettings)).toEqual({galleryPython:"C:\\FixtureTools\\python.exe",ffmpeg:""});
 await panel.getByRole("button",{name:"Clear Gallery Python environment",exact:true}).click();
 await expect(panel.locator("code").first()).toHaveText("Not selected");
 await panel.locator("summary").click();
 await page.setViewportSize({width:800,height:720});
 expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});

test("Google identity setup validates input, imports natively and cancels pending sign-in",async({page})=>{
 await fixture(page,{active:false});await page.getByRole("button",{name:"Accounts",exact:true}).click();
 const panel=page.locator(".identity-panel");await expect(panel.getByText("Developer setup required",{exact:true})).toBeVisible();
 await expect(panel.getByRole("button",{name:"Sign in with Google",exact:true})).toBeDisabled();
 await panel.getByText("Configure Google Desktop sign-in",{exact:true}).click();
 await panel.getByRole("textbox",{name:"Google Desktop client ID"}).fill("wrong");
 await panel.getByRole("button",{name:"Save client ID",exact:true}).click();await expect(panel.getByRole("alert")).toContainText("Google Desktop OAuth client ID");
 await panel.getByRole("button",{name:"Import Desktop OAuth JSON",exact:true}).click();
 await expect(panel.getByRole("textbox",{name:"Google Desktop client ID"})).toHaveValue("123-imported.apps.googleusercontent.com");
 await panel.getByRole("button",{name:"Sign in with Google",exact:true}).click();
 await expect(panel.getByText("Waiting for browser",{exact:true})).toBeVisible();
 await panel.getByRole("button",{name:"Cancel Google sign-in",exact:true}).click();
 await expect(panel.getByText("Not connected",{exact:true})).toBeVisible();
 expect(await qa(page,"authCalls")).toContain("cancel_google_identity");
});
test("verified Google identity stays independent of private capability and revoke needs confirmation",async({page})=>{
 await fixture(page,{active:false,approvedSessions:true});await page.getByRole("button",{name:"Accounts",exact:true}).click();
 const panel=page.locator(".identity-panel");await panel.getByText("Configure Google Desktop sign-in",{exact:true}).click();await panel.getByRole("button",{name:"Import Desktop OAuth JSON",exact:true}).click();await panel.getByRole("button",{name:"Sign in with Google",exact:true}).click();
 await page.evaluate(()=>{Object.assign((window as any).__qa.auth,{state:"identity_verified",accountKey:"google:fixture",displayName:"Fixture Google",expiresAt:2000000000,grantedScopes:["openid","profile"]});});
 await expect(panel.getByText("Verified: Fixture Google",{exact:true})).toBeVisible();
 await expect(panel).toContainText("Facebook, TikTok and Pinterest support public share links only");
 await expect(page.getByText("Legacy browser approval",{exact:true})).toHaveCount(4);
 await panel.getByRole("button",{name:"Check or refresh identity",exact:true}).click();await expect(panel).toContainText("This grants no private-media capability");
 await panel.getByRole("button",{name:"Revoke Google access",exact:true}).click();const dialog=page.getByRole("dialog",{name:"Revoke Google access?"});
 await expect(dialog.getByRole("button",{name:"Cancel revocation",exact:true})).toBeFocused();await expect(dialog).toContainText("all grants");
 await dialog.getByRole("button",{name:"Cancel revocation",exact:true}).click();await expect(panel.getByRole("button",{name:"Revoke Google access",exact:true})).toBeFocused();expect(await qa(page,"authCalls")).not.toContain("revoke_google");
 await panel.getByRole("button",{name:"Revoke Google access",exact:true}).click();await dialog.getByRole("button",{name:"Revoke and disconnect",exact:true}).click();await expect(panel.getByText("Not connected",{exact:true})).toBeVisible();expect(await qa(page,"authCalls")).toContain("revoke_google");
});
for(const width of [760,1366])test(`authentication setup is accessible and contained at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await fixture(page,{active:false});await page.getByRole("button",{name:"Accounts",exact:true}).click();
 const panel=page.locator(".identity-panel");await panel.getByText("Configure Google Desktop sign-in",{exact:true}).click();
 await expect(panel.getByRole("textbox",{name:"Google Desktop client ID"})).toBeVisible();
 expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 const audit=await new AxeBuilder({page}).include(".identity-panel").analyze();expect(audit.violations).toEqual([]);
 await panel.screenshot({path:info.outputPath(`authentication-${width}.png`)});
});

test("local Google setup reset is explicit and leaves legacy accounts visible",async({page})=>{
 await fixture(page,{active:false,approvedSessions:true});await page.getByRole("button",{name:"Accounts",exact:true}).click();
 const panel=page.locator(".identity-panel");await panel.getByText("Configure Google Desktop sign-in",{exact:true}).click();await panel.getByRole("button",{name:"Import Desktop OAuth JSON",exact:true}).click();
 await panel.getByRole("button",{name:"Reset Google identity setup",exact:true}).click();
 const popup=page.getByRole("dialog",{name:"Reset Google identity setup?"});await expect(popup).toContainText("Remote Google grants are not revoked");await popup.getByRole("button",{name:"Cancel reset",exact:true}).click();await expect(panel.getByRole("button",{name:"Reset Google identity setup",exact:true})).toBeFocused();expect(await qa(page,"authCalls")).not.toContain("reset_google_identity");
 await panel.getByRole("button",{name:"Reset Google identity setup",exact:true}).click();await popup.getByRole("button",{name:"Reset local setup",exact:true}).click();await expect(panel.getByText("Developer setup required",{exact:true})).toBeVisible();await expect(page.getByText("Legacy browser approval",{exact:true})).toHaveCount(4);
});

test("Watch Later short playlist ID reaches native preparation with browser guidance",async({page})=>{
 await fixture(page,{active:false,approvedSessions:true});await page.goto("/");
 await page.getByRole("button",{name:"Add download",exact:true}).click();
 const dialog=page.locator("dialog[open]");
 await dialog.getByRole("combobox",{name:"Platform",exact:true}).selectOption("youtube");
 await dialog.getByRole("textbox",{name:"Post or collection link",exact:true}).fill("https://www.youtube.com/playlist?list=WL");
 await expect(dialog).toContainText("Watch Later and Liked videos need a YouTube browser approval");
 await dialog.getByRole("button",{name:"Start download",exact:true}).click();
 await expect(dialog).toHaveCount(0);
 expect((await qa(page,"downloadRequests"))[0]).toMatchObject({source:"youtube",target:"https://www.youtube.com/playlist?list=WL"});
});


test("public-only provider guidance removes private promises and Pinterest developer setup",async({page})=>{
 await fixture(page,{active:false});
 await page.getByRole("button",{name:"Accounts",exact:true}).click();
 const identities=page.locator(".identity-readiness");
 await expect(identities).not.toContainText("secret-read");
 await expect(identities).not.toContainText("registration_required");
 await expect(identities).toContainText("Public pin and board links need no developer app or OAuth setup");
 await page.getByRole("button",{name:"Add download",exact:true}).click();
 const dialog=page.locator("dialog[open]");
 for(const source of ["facebook","tiktok","pinterest"]){
   await dialog.getByRole("combobox",{name:"Platform",exact:true}).selectOption(source);
   await expect(dialog).toContainText("outside the supported scope");
   await expect(dialog).not.toContainText("for secret boards your account can access");
   await expect(dialog).not.toContainText("For sign-in-required posts");
   await expect(dialog).not.toContainText("For private or sign-in-required content");
 }
});
