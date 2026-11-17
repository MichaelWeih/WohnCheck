import { chromium } from '@playwright/test';
import fs from 'node:fs';
fs.mkdirSync('artifacts/redesign', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8080');
await page.getByRole('link', { name: /Noch keine WohnCheck|WohnCheck-Bewertungen/ }).first().waitFor({timeout:20000});
const profile=await page.locator('.directory-row').first().getAttribute('href');
for (const width of [390,768,1440]) {
 await page.setViewportSize({width,height:1000});
 for (const [label,url] of [['home','/'],['search','/suche?q=Berlin'],['profile',profile],['login','/login'],['register','/registrieren']]) {
  await page.goto('http://127.0.0.1:8080'+url); await page.waitForTimeout(600);
  const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  console.log(label,width,JSON.stringify(metrics));
  await page.screenshot({path:`artifacts/redesign/${label}-${width}.png`,fullPage:true});
 }
}
console.log('profile',profile,'errors',errors);
await browser.close();

