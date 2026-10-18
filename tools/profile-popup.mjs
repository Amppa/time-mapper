/**
 * TimeMapper - Popup Performance Profiling Tool
 *
 * Runs the popup in Chromium via Puppeteer, collects core web vitals,
 * navigation timings, CDP metrics, long tasks, and exports a Chrome DevTools
 * compatible trace file for flame chart inspection.
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const TRACE_DIR = path.join(ROOT_DIR, 'traces');

/**
 * Accurately extracts the extension ID directly from chrome://extensions shadow DOM.
 */
async function getExtensionIdFromBrowser(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('chrome://extensions', { waitUntil: 'load' });
    const extensionId = await page.evaluate(() => {
      const manager = document.querySelector('extensions-manager');
      if (!manager) return null;
      const itemList = manager.shadowRoot?.querySelector('extensions-item-list');
      const items = itemList?.shadowRoot?.querySelectorAll('extensions-item') || [];
      for (const item of items) {
        const name = item.shadowRoot?.querySelector('#name')?.textContent || '';
        if (name.includes('TimeMapper') || items.length === 1) {
          return item.id;
        }
      }
      return items[0]?.id || null;
    });
    return extensionId;
  } finally {
    await page.close();
  }
}

function formatMs(ms) {
  if (ms === undefined || ms === null || isNaN(ms)) return 'N/A';
  return `${Number(ms).toFixed(2)} ms`;
}

function formatBytes(bytes) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return 'N/A';
  return `${(Number(bytes) / 1024 / 1024).toFixed(2)} MB`;
}

function getRatingBadge(value, goodMax, warnMax) {
  if (value === undefined || value === null || isNaN(value)) return '⚪';
  if (value <= goodMax) return '🟢 [GOOD]';
  if (value <= warnMax) return '🟡 [WARN]';
  return '🔴 [POOR]';
}

async function runProfiler() {
  if (!fs.existsSync(TRACE_DIR)) {
    fs.mkdirSync(TRACE_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const traceFile = `popup-profile-${timestamp}.trace.json`;
  const tracePath = path.join(TRACE_DIR, traceFile);

  console.log('🚀 Launching Chromium to profile TimeMapper popup...');
  console.log(`📂 Extension directory: ${ROOT_DIR}`);

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--disable-extensions-except=${ROOT_DIR}`,
      `--load-extension=${ROOT_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-default-apps'
    ]
  });

  try {
    const extensionId = await getExtensionIdFromBrowser(browser);
    if (!extensionId) {
      throw new Error('Failed to retrieve Extension ID from chrome://extensions.');
    }

    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
    console.log(`🌐 Resolved Popup URL: ${popupUrl}\n`);

    const page = await browser.newPage();
    const cdp = await page.target().createCDPSession();
    await cdp.send('Performance.enable');

    // Register PerformanceObserver for longtask detection
    await page.evaluateOnNewDocument(() => {
      window.__longTasks = [];
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__longTasks.push({
              name: entry.name,
              startTime: entry.startTime,
              duration: entry.duration
            });
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        // Fallback if unsupported
      }
    });

    console.log('⏱️  Starting Chrome Trace recording...');
    await page.tracing.start({
      path: tracePath,
      screenshots: true,
      categories: [
        'devtools.timeline',
        'v8',
        'blink.user_timing',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame'
      ]
    });

    const startEpoch = Date.now();
    await page.goto(popupUrl, { waitUntil: 'networkidle0' });

    // Allow render loop and microtasks to complete
    await new Promise(r => setTimeout(r, 600));

    await page.tracing.stop();
    const totalElapsed = Date.now() - startEpoch;
    console.log(`✅ Trace recorded successfully! (${totalElapsed} ms total)\n`);

    // Extract metrics
    const metrics = await page.metrics();
    const inPageData = await page.evaluate(() => {
      const navEntries = performance.getEntriesByType('navigation');
      const nav = navEntries.length > 0 ? navEntries[0] : null;

      const paintEntries = performance.getEntriesByType('paint');
      const fp = paintEntries.find(p => p.name === 'first-paint')?.startTime;
      const fcp = paintEntries.find(p => p.name === 'first-contentful-paint')?.startTime;

      return {
        nav: nav ? {
          dns: nav.domainLookupEnd - nav.domainLookupStart,
          tcp: nav.connectEnd - nav.connectStart,
          ttfb: nav.responseStart - nav.requestStart,
          download: nav.responseEnd - nav.responseStart,
          domInteractive: nav.domInteractive,
          domContentLoaded: nav.domContentLoadedEventEnd,
          loadEvent: nav.loadEventEnd
        } : null,
        fp,
        fcp,
        longTasks: window.__longTasks || [],
        elementCount: document.getElementsByTagName('*').length,
        cityPins: document.querySelectorAll('.city-pin').length,
        timelineRows: document.querySelectorAll('.timeline-row').length
      };
    });

    // Output Report
    console.log('===============================================================');
    console.log('                TIMEMAPPER POPUP PROFILE REPORT                ');
    console.log('===============================================================');

    console.log('\n--- 1. First Paint & Visual Milestones ---');
    console.table([
      { Metric: 'First Paint (FP)', Value: formatMs(inPageData.fp), Status: getRatingBadge(inPageData.fp, 100, 250) },
      { Metric: 'First Contentful Paint (FCP)', Value: formatMs(inPageData.fcp), Status: getRatingBadge(inPageData.fcp, 150, 300) },
      { Metric: 'DOM Content Loaded (DCL)', Value: formatMs(inPageData.nav?.domContentLoaded), Status: getRatingBadge(inPageData.nav?.domContentLoaded, 200, 400) },
      { Metric: 'Load Complete (onload)', Value: formatMs(inPageData.nav?.loadEvent), Status: getRatingBadge(inPageData.nav?.loadEvent, 300, 600) }
    ]);

    console.log('\n--- 2. Main Thread Execution & Rendering Cost (CDP) ---');
    console.table([
      { Metric: 'Script Execution Duration', Value: formatMs(metrics.ScriptDuration * 1000) },
      { Metric: 'Layout Duration', Value: formatMs(metrics.LayoutDuration * 1000) },
      { Metric: 'Recalculate Style Duration', Value: formatMs(metrics.RecalcStyleDuration * 1000) },
      { Metric: 'Total Task Duration', Value: formatMs(metrics.TaskDuration * 1000) },
      { Metric: 'JS Heap Used', Value: formatBytes(metrics.JSHeapUsedSize) },
      { Metric: 'Total DOM Nodes in Popup', Value: inPageData.elementCount }
    ]);

    console.log('\n--- 3. Long Tasks Breakdown (>50ms blocking main thread) ---');
    if (!inPageData.longTasks || inPageData.longTasks.length === 0) {
      console.log('🟢 No blocking long tasks detected! Main thread was responsive throughout startup.');
    } else {
      console.log(`⚠️  Detected ${inPageData.longTasks.length} long task(s):`);
      console.table(inPageData.longTasks.map(t => ({
        'Start Time': formatMs(t.startTime),
        'Duration': formatMs(t.duration),
        'Status': '🔴 Blocking'
      })));
    }

    console.log('\n--- 4. Rendered State Snapshot ---');
    console.log(`- City Pins Rendered: ${inPageData.cityPins}`);
    console.log(`- Timeline Rows Rendered: ${inPageData.timelineRows}`);

    console.log('\n===============================================================');
    console.log('📊 Trace File saved:');
    console.log(`   ${tracePath}`);
    console.log('\n💡 Next Steps to Inspect Flame Chart:');
    console.log('   1. Open Google Chrome and go to "about:blank".');
    console.log('   2. Open DevTools (F12) -> switch to the "Performance" panel.');
    console.log('   3. Click the "Load profile..." icon (or drag-and-drop the trace file above).');
    console.log('   4. Check the "Main" track to pinpoint exact functions causing delays.');
    console.log('===============================================================\n');

  } finally {
    await browser.close();
  }
}

runProfiler().catch(err => {
  console.error('❌ Profiler failed:', err);
  process.exit(1);
});
