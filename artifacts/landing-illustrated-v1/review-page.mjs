import { chromium, expect } from '/Users/xmedavid/dev/dbvnfc/web/node_modules/@playwright/test/index.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out=fileURLToPath(new URL('review/',import.meta.url));mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const [width,language,theme] of [[1280,'en','dark'],[390,'en','light'],[768,'pt','dark'],[1600,'en','light'],[390,'de','dark']]){
  await page.setViewportSize({width,height:900});
  await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(l=>localStorage.setItem('pointfinder-lang',l),language);await page.reload();
  await expect(page.locator('img[src*="illustrated/hero"]')).toBeAttached();
  await page.evaluate(async()=>{for(const img of document.images){img.loading='eager';await img.decode().catch(()=>{});}await document.fonts.ready;});
  await page.screenshot({path:`${out}homepage-${width}-${language}-${theme}.png`,fullPage:true});
  await page.screenshot({path:`${out}hero-${width}-${language}-${theme}.png`});
  if(width===1280)await page.locator('#organizers').screenshot({path:`${out}organizers-${width}.png`});
  const sizes=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)}));
  if(sizes.scroll>sizes.width||sizes.broken.length)throw Error(JSON.stringify(sizes));
}
if(errors.length)throw Error(errors.join('\n'));
console.log('PASS: five desktop/tablet/phone/language/theme visual cases, all images loaded, no overflow or JavaScript errors.');
await browser.close();
