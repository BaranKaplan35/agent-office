// Makes the README media in docs/media with a headless Chrome (see cdp.mjs).
//
//   node scripts/capture/media.mjs shots  <base>            office-day, office-evening, clarification
//   node scripts/capture/media.mjs report <base> <taskId> <agent name>   report.png
//   node scripts/capture/media.mjs record <base>            records a mock task timeline (JSON)
//   node scripts/capture/media.mjs gif    <base>            frames from the timeline → office.gif
//
// <base> is a running AgentOffice, e.g. http://localhost:3101 (a mock-mode server for
// everything except `report`, which wants a real task). `gif` needs ffmpeg (FFMPEG or PATH).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'media');
const WORK = join(ROOT, 'scripts', 'capture', '.work');
const FPS = 15;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [command, base = 'http://localhost:3101', ...rest] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

/** Open the app with per-viewer settings already stored, then load `query`. */
async function openApp(page, { team, theme = 'light', query = '', taskId = null }) {
  await page.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: theme },
      { name: 'prefers-reduced-motion', value: 'no-preference' },
    ],
  });
  await page.goto(`${base}/`);
  await page.eval(`(() => {
    localStorage.setItem('agent-office.lang', 'en');
    localStorage.setItem('agent-office.quality', 'high');
    localStorage.setItem('agent-office.motion', 'full');
    localStorage.setItem('agent-office.session', ${JSON.stringify(JSON.stringify({ teamId: team, taskId }))});
  })()`);
  await page.goto(`${base}/${query}`);
  await page.waitFor(`!!document.querySelector('.office.is-3d canvas')`);
}

/** Office card only, without the page around it. */
const officeClip = (page) => page.box('.office');

async function shots() {
  const page = await launch();
  try {
    await openApp(page, { team: 'maker-lesson-studio', theme: 'light', query: '?hour=11' });
    await sleep(6000);
    writeFileSync(join(OUT, 'office-day.png'), await page.screenshot(await officeClip(page)));
    console.log('office-day.png');

    await openApp(page, { team: 'software-startup', theme: 'dark', query: '?hour=19.5' });
    await sleep(6000);
    writeFileSync(join(OUT, 'office-evening.png'), await page.screenshot(await officeClip(page)));
    console.log('office-evening.png');

    await openApp(page, { team: 'youtube-video-studio', theme: 'light', query: '?hour=15' });
    await sleep(3000);
    await page.eval(`(() => {
      const box = document.getElementById('task-input');
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      set.call(box, 'hi');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(300);
    await page.eval(`document.querySelector('.task-actions button[type=submit]').click()`);
    await page.waitFor(`!!document.querySelector('.task-question')`, 30_000);
    await sleep(3500); // the coordinator sits down and raises a hand
    await page.eval(`document.activeElement?.blur()`);
    writeFileSync(join(OUT, 'clarification.png'), await page.screenshot());
    console.log('clarification.png');
  } finally {
    await page.close();
  }
}

async function report() {
  const [taskId, agentName] = rest;
  const task = await fetch(`${base}/api/tasks/${taskId}`).then((r) => r.json());
  const page = await launch();
  try {
    await openApp(page, { team: task.teamId, taskId, theme: 'light', query: '?hour=11' });
    const tag = `document.querySelector('button.desk-tag[title="Open report of ${agentName}"]')`;
    await page.waitFor(`!!${tag}`);
    await sleep(3000); // scene settled
    await page.eval(`${tag}.click()`);
    await page.waitFor(`!!document.querySelector('.report .usage')`);
    await sleep(2500); // camera focus
    // Show the end of the report with its model / tokens / time line.
    await page.eval(`document.querySelector('.report .usage').scrollIntoView({ block: 'center' })`);
    await sleep(300);
    writeFileSync(join(OUT, 'report.png'), await page.screenshot());
    console.log('report.png');
  } finally {
    await page.close();
  }
}

/** A real mock run, recorded as task snapshots with their time since the task started. */
async function record() {
  const api = `${base}/api`;
  const post = (path, body) =>
    fetch(api + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => r.json());
  const { taskId } = await post('/tasks', {
    teamId: 'software-startup',
    prompt: 'A habit tracker for students who study together',
    lang: 'en',
  });
  const start = performance.now();
  const frames = [];
  const approved = new Set();
  const res = await fetch(`${api}/tasks/${taskId}/events`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const until = start + 17_000;
  // Keep one read in flight: a read that loses the race to the timer is reused, not lost.
  let pendingRead = reader.read();
  while (performance.now() < until) {
    const chunk = await Promise.race([pendingRead, sleep(200).then(() => null)]);
    if (chunk) pendingRead = reader.read();
    if (chunk?.done) break;
    if (chunk?.value) buffer += decoder.decode(chunk.value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const data = block.split('\n').find((l) => l.startsWith('data: '));
      if (!data) continue;
      const event = JSON.parse(data.slice(6));
      if (!event.task) continue; // keep-alive pings
      const t = (performance.now() - start) / 1000;
      frames.push({ t, task: event.task });
      // Approve the first report after a short look, so the next wave starts.
      for (const sub of event.task.subtasks) {
        if (sub.status === 'awaiting_review' && !approved.has(sub.id)) {
          approved.add(sub.id);
          setTimeout(() => void post(`/tasks/${taskId}/subtasks/${sub.id}/approve`), 1200);
        }
      }
    }
  }
  await reader.cancel();
  await post(`/tasks/${taskId}/cancel`);
  mkdirSync(WORK, { recursive: true });
  writeFileSync(join(WORK, 'timeline.json'), JSON.stringify(frames));
  console.log(`recorded ${frames.length} snapshots over ${frames.at(-1)?.t.toFixed(1)} s`);
}

async function gif() {
  const timeline = JSON.parse(readFileSync(join(WORK, 'timeline.json'), 'utf8'));
  const LEAD = Number(process.env.GIF_LEAD ?? 0.8); // calm office before the task is sent
  const SECONDS = Number(process.env.GIF_SECONDS ?? 14.2);
  const framesDir = join(WORK, 'frames');
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  const page = await launch();
  try {
    await openApp(page, { team: 'software-startup', theme: 'light', query: '?hour=11&capture=1' });
    await page.waitFor(`window.__officeCapture?.ready()`);
    await page.eval(`window.__officeCapture.setTask(null)`);
    await page.eval(`window.__officeCapture.step(45)`); // let everyone settle
    const clip = await officeClip(page);
    let next = 0;
    const total = Math.round((LEAD + SECONDS) * FPS);
    for (let i = 0; i < total; i++) {
      const taskTime = i / FPS - LEAD;
      while (next < timeline.length && timeline[next].t <= taskTime) {
        await page.eval(`window.__officeCapture.setTask(${JSON.stringify(timeline[next].task)})`);
        next++;
      }
      await page.eval(`window.__officeCapture.step(1)`);
      writeFileSync(
        join(framesDir, `f${String(i).padStart(4, '0')}.png`),
        await page.screenshot(clip),
      );
      if (i % 30 === 0) console.log(`frame ${i}/${total}`);
    }
  } finally {
    await page.close();
  }

  const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
  const width = Number(process.env.GIF_WIDTH ?? 960);
  const out = join(OUT, 'office.gif');
  const filter =
    `fps=${FPS},scale=${width}:-1:flags=lanczos,split[a][b];` +
    `[a]palettegen=max_colors=192:stats_mode=diff[p];` +
    `[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  const run = spawnSync(
    ffmpeg,
    [
      '-y',
      '-framerate',
      String(FPS),
      '-i',
      join(framesDir, 'f%04d.png'),
      '-filter_complex',
      filter,
      '-loop',
      '0',
      out,
    ],
    { stdio: 'inherit' },
  );
  if (run.status !== 0) throw new Error('ffmpeg failed');
  console.log(`office.gif: ${(readFileSync(out).length / 1024 / 1024).toFixed(2)} MB`);
}

const commands = { shots, report, record, gif };
if (!commands[command]) {
  console.error('usage: node scripts/capture/media.mjs <shots|report|record|gif> <base> [...]');
  process.exit(1);
}
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
await commands[command]();
