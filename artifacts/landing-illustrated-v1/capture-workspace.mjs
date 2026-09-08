// Captures the actual workspace UI using fictional fixtures; no production account/data.
import { chromium, expect } from '/Users/xmedavid/dev/dbvnfc/web/node_modules/@playwright/test/index.mjs';
import { fileURLToPath } from 'node:url';
const out=fileURLToPath(new URL('source/workspace-preview.png',import.meta.url));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1,colorScheme:'dark',reducedMotion:'reduce'});
const user={id:'u',name:'Guide',email:'guide@example.test',role:'operator',createdAt:'2026-01-01'};
const token=`header.${Buffer.from(JSON.stringify({exp:4102444800})).toString('base64url')}.signature`;
const game={id:'g',name:'Costa de Lavos adventure',status:'live',description:'',createdBy:'u',operatorIds:['u'],enforceBaseOrder:false,uniformAssignment:true,broadcastEnabled:false,broadcastCode:null,tileSource:'voyager',unlockTrigger:'COMPLETED',startDate:new Date(Date.now()-1620000).toISOString(),endDate:null,defaultCheckInMethod:'QR',defaultCheckInRadiusM:15,tutorialScenario:null,tutorialExpiresAt:null};
const bases=[['Beach trail',40.0907,-8.8762],['Village square',40.0926,-8.8743],['Coastal path',40.0896,-8.8721],['Dune lookout',40.0879,-8.8761]].map(([name,lat,lng],i)=>({id:`b${i+1}`,gameId:'g',name,description:'Explore this stop together.',lat,lng,sequenceNumber:i+1,nfcLinked:true,hidden:false,checkInMethod:'QR',checkInRadiusM:null}));
const challenges=['Find the trail','Capture the view','Solve the clue','Discover the oak'].map((title,i)=>({id:`c${i+1}`,gameId:'g',title,description:'',content:'<p>Explore together.</p>',completionContent:'',answerType:'text',autoValidate:false,points:10,locationBound:false,requirePresenceToSubmit:false}));
// Keep public demo captures inside the user's chosen, non-personal demo area.
if(bases.some(b=>b.lat<40.08||b.lat>40.10||b.lng< -8.89||b.lng> -8.86))throw Error('Screenshot fixtures must remain in Costa de Lavos.');
const teams=[{id:'t1',gameId:'g',name:'Oak patrol',joinCode:'OAK0001',color:'#e2b559'},{id:'t2',gameId:'g',name:'Pine crew',joinCode:'PINE001',color:'#64a1b6'}];
await page.routeWebSocket('**/ws-native**',ws=>{ws.onMessage(m=>{if(String(m).startsWith('CONNECT'))ws.send('CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0');});});
await page.route('**/api/**',route=>{const p=new URL(route.request().url()).pathname;if(!p.startsWith('/api/'))return route.continue();let json=[];
if(p.startsWith('/api/auth/'))json={accessToken:token,user};
else if(p==='/api/workspaces')json={personal:{tier:'pro',status:'active',activeGames:1},organizations:[]};
else if(p.startsWith('/api/quota/'))json={limits:{maxActiveGames:null},usage:{currentActiveGames:1}};
else if(p==='/api/users/me/tutorials')json=[{scenarioId:'introduction',status:'skipped',currentStep:null,gameId:null,startedAt:'2026-09-06T09:00:00Z',completedAt:null}];
else if(p==='/api/games')json=[game];else if(p==='/api/games/g')json=game;
else if(p.endsWith('/bases'))json=bases;else if(p.endsWith('/challenges'))json=challenges;else if(p.endsWith('/teams'))json=teams;
else if(p.endsWith('/assignments'))json=bases.map((b,i)=>({id:`a${i}`,gameId:'g',baseId:b.id,challengeId:`c${i+1}`,teamId:null}));
else if(p.endsWith('/monitoring/dashboard'))json={totalTeams:2,totalBases:4,totalChallenges:4,pendingSubmissions:1,completedSubmissions:5,totalSubmissions:8,startDate:game.startDate};
else if(p.endsWith('/monitoring/leaderboard'))json=teams.map((t,i)=>({teamId:t.id,teamName:t.name,color:t.color,points:30-i*10,completedChallenges:3-i}));
else if(p.endsWith('/monitoring/activity'))json=[{id:'e1',type:'check_in',message:'Oak patrol arrived at Village square',teamId:'t1',baseId:'b2',timestamp:new Date().toISOString()},{id:'e2',type:'approval',message:'Pine crew completed Find the trail',teamId:'t2',timestamp:new Date(Date.now()-60000).toISOString()},{id:'e3',type:'submission',message:'Oak patrol sent an answer',teamId:'t1',timestamp:new Date(Date.now()-120000).toISOString()}];
else if(p.endsWith('/completeness'))json={complete:true,errors:[]};
return route.fulfill({json});});
await page.goto('http://127.0.0.1:5173/login');

await page.getByTestId('login-email').fill(user.email);await page.getByTestId('login-password').fill('fixture-only');await page.getByTestId('login-submit').click();
await expect(page).toHaveURL(/dashboard$/);await page.goto('http://127.0.0.1:5173/game/g');
await expect(page.getByText(game.name).first()).toBeVisible();
await page.waitForTimeout(8000);
await page.getByRole('button',{name:'Command',exact:true}).last().click();
await expect(page.getByTestId('stats-bar')).toBeVisible();await page.getByRole('button',{name:'Leaderboard',exact:false}).click();await page.mouse.move(640,420);await page.mouse.wheel(0,110);await page.waitForTimeout(2000);
await page.screenshot({path:out});
await browser.close();
