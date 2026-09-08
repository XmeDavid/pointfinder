import {chromium} from '../../../web/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'});
 page.on('pageerror',e=>console.log('ERROR',e.message));
 await page.goto('http://127.0.0.1:5174/');
 await page.getByTestId('onboarding-scene').waitFor();
 await page.waitForFunction(()=>document.querySelector('[data-testid="onboarding-scene"]')?.dataset.state==='ready',undefined,{timeout:30000});
 await new Promise(r=>setTimeout(r,6000));
 await page.screenshot({path:new URL('phone-world.png',import.meta.url).pathname,fullPage:true});
 console.log('SCENE',await page.getByTestId('onboarding-scene').evaluate(el=>({...el.dataset})));
 await page.getByTestId('onboarding-skip').click();
 for(let i=0;i<6;i++){await new Promise(r=>setTimeout(r,2000)); console.log('AFTER SKIP',await page.getByTestId('onboarding-scene').evaluate(el=>({...el.dataset})));}
 await page.screenshot({path:new URL('phone-compass.png',import.meta.url).pathname,fullPage:true});
 console.log('COMPASS',await page.getByTestId('onboarding-scene').evaluate(el=>({...el.dataset})));
}finally{await browser.close()}
