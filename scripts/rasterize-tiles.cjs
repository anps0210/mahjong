// Run after generate-tiles.py. Requires Playwright and its Chromium browser.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:280,height:400},deviceScaleFactor:1});
  for(const [suit,count] of [['m',9],['p',9],['s',9],['z',7]])for(let n=1;n<=count;n++){
   const file=resolve(__dirname,`../public/tiles/${suit}${n}`);
   await page.goto(pathToFileURL(file+'.svg').href);
   await page.evaluate(()=>{const s=document.querySelector('svg');s.setAttribute('width','280');s.setAttribute('height','400');s.style.background='#fff';document.documentElement.style.background='#fff';});
   await page.screenshot({path:file+'.png',omitBackground:false});
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
