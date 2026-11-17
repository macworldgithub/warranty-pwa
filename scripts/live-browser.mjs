import { chromium } from '@playwright/test';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
process.stdin.setRawMode?.(true);
const input=createInterface({ input: process.stdin, terminal: false });
console.log('Waiting for test logins on private stdin.');
for await (const line of input) {
  input.close(); const accounts=JSON.parse(line);
  const preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4174','--strictPort'],{stdio:'ignore',windowsHide:true});
  let browser;
  try {
    for(let attempt=0;attempt<60;attempt++) { try {if((await fetch('http://localhost:4174')).ok) break;} catch {} await new Promise(resolve=>setTimeout(resolve,250)); }
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const account of accounts) {
      const context=await browser.newContext({viewport:{width:390,height:844}}); const page=await context.newPage();
      const failures=[];page.on('pageerror',error=>failures.push(error.message));
      await page.goto('http://localhost:4174');await page.getByText('Sign In',{exact:true}).first().click();
      await page.getByPlaceholder('Username or email').fill(account.email);await page.getByPlaceholder('Enter your password').fill(account.password);await page.getByText('Sign In',{exact:true}).last().click();
      await page.getByText('APP MENU',{exact:true}).waitFor({timeout:30000});
      for(const menu of ['Vehicle Inspection','Internal Test Drive','Warranty Capture','Loaners','Hoist Inspections','Profile & settings']) {
        await page.goto('http://localhost:4174');await page.getByText(menu,{exact:true}).click();await page.waitForTimeout(2000);
        const text=await page.locator('body').innerText();
        console.log(JSON.stringify({role:account.roleLabel,screen:menu,runtimeErrors:failures.length,errorBoundary:text.includes('Unable to open the app'),horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)}));
      }
      await context.close();
    }
  } finally {await browser?.close();preview.kill();}
  break;
}
