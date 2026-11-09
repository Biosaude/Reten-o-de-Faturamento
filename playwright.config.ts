import {defineConfig} from '@playwright/test';

export default defineConfig({
 testDir:'tests/e2e',fullyParallel:false,workers:1,
 globalSetup:'./scripts/e2e-prepare.ts',
 use:{locale:'pt-BR',serviceWorkers:'block',
  launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']},
  viewport:{width:1920,height:1080},trace:'retain-on-failure'},
});
