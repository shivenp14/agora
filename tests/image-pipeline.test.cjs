const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTS(relativePath, mocks = {}) {
  const filename = path.resolve(relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : originalRequire(name);
  mod._compile(source, filename);
  return mod.exports;
}

test('image candidates rank full detail originals ahead of banners and discard placeholders', () => {
  const { selectImageCandidates, chooseLargestSrcset } = loadTS('src/main/services/imageCandidates.ts');
  const candidates = selectImageCandidates([
    { url: 'https://cdn.example/logo.png', source: 'detail', alt: 'Organization logo', width: 400, height: 200 },
    { url: 'https://cdn.example/flyer-thumb.jpg', source: 'detail', alt: 'Event flyer', width: 600, height: 300 },
    { url: 'https://cdn.example/flyer-full.jpg', source: 'original', alt: 'Event flyer', width: 1200, height: 1800 },
    { url: 'https://cdn.example/flyer-full.jpg', source: 'detail', alt: 'Event flyer', width: 1200, height: 1800 },
    { url: 'https://cdn.example/image.jpg', source: 'detail', alt: '', width: 20, height: 20 },
  ], 'https://cdn.example/list-banner.jpg');

  assert.deepEqual(candidates.map(({ url, source }) => [url, source]), [
    ['https://cdn.example/flyer-full.jpg', 'original'],
    ['https://cdn.example/flyer-thumb.jpg', 'detail'],
    ['https://cdn.example/list-banner.jpg', 'banner'],
  ]);
  const detailSources = selectImageCandidates([
    { url: 'https://cdn.example/detail-flyer.jpg', source: 'detail', alt: 'Flyer' },
    { url: 'https://cdn.example/large-srcset.jpg', source: 'srcset' },
    { url: 'https://cdn.example/original-link.jpg', source: 'link' },
    { url: 'https://cdn.example/source-original.jpg', source: 'original' },
  ], 'https://cdn.example/banner.jpg');
  assert.deepEqual(detailSources.map(({ source }) => source), ['original', 'detail', 'srcset', 'link', 'banner']);
  assert.equal(chooseLargestSrcset('small.jpg 400w, large.jpg 1400w, mid.jpg 2x'), 'large.jpg');

  const limited = selectImageCandidates(Array.from({ length: 10 }, (_, index) => ({
    url: `https://cdn.example/${index}.jpg`, source: 'detail',
  })));
  assert.equal(limited.length, 6);
  const withBannerFallback = selectImageCandidates(Array.from({ length: 10 }, (_, index) => ({
    url: `https://cdn.example/${index}.jpg`, source: 'detail',
  })), 'https://cdn.example/fallback-banner.jpg');
  assert.equal(withBannerFallback.length, 6);
  assert.equal(withBannerFallback.at(-1).source, 'banner');
});

test('full flyer alternatives survive small rendered thumbnail dimensions', () => {
  const { selectImageCandidates } = loadTS('src/main/services/imageCandidates.ts');
  const candidates = selectImageCandidates([
    { url: 'https://cdn.example/thumb.jpg', source: 'detail', width: 64, height: 64 },
    { url: 'https://cdn.example/full.jpg', source: 'original', width: 64, height: 64 },
    { url: 'https://cdn.example/linked.jpg', source: 'link', width: 64, height: 64 },
    { url: 'https://cdn.example/large.jpg', source: 'srcset', width: 64, height: 64 },
  ], 'https://cdn.example/banner.jpg');

  assert.deepEqual(candidates.map(({ url }) => url), [
    'https://cdn.example/full.jpg',
    'https://cdn.example/large.jpg',
    'https://cdn.example/linked.jpg',
    'https://cdn.example/banner.jpg',
  ]);
});

test('downloads stay bounded, skip a failed candidate and return stable evidence metadata', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agora-download-test-'));
  const calls = [];
  const axios = {
    async get(url, config) {
      calls.push({ url, config });
      await new Promise((resolve) => setTimeout(resolve, url.endsWith('/banner.jpg') ? 5 : 1));
      return {
        headers: { 'content-type': url.endsWith('/bad.jpg') ? 'text/html' : 'image/jpeg' },
        data: Buffer.from(url),
      };
    },
  };
  const { downloadImages } = loadTS('src/main/services/imageDownloadShared.ts', {
    axios,
    '../utils/retry': { retryWithBackoff: (operation) => operation() },
  });

  try {
    const images = await downloadImages([{
      id: 'event-1', imageUrl: 'https://cdn.example/banner.jpg',
      imageCandidates: [
        { url: 'https://cdn.example/bad.jpg', source: 'original' },
        { url: 'https://cdn.example/original.jpg', source: 'original' },
        { url: 'https://cdn.example/detail.jpg', source: 'detail' },
        { url: 'https://cdn.example/srcset.jpg', source: 'srcset' },
        { url: 'https://cdn.example/linked.jpg', source: 'link' },
        { url: 'https://cdn.example/banner.jpg', source: 'banner' },
        { url: 'https://cdn.example/ignored.jpg', source: 'original' },
      ],
    }], tempDir, () => {});

    const downloaded = images.get('event-1') || [];
    assert.equal(calls.length, 6);
    assert.equal(calls.every(({ config }) => config.timeout === 15000 && config.maxContentLength === 15 * 1024 * 1024), true);
    assert.deepEqual(downloaded.map((image) => image.source), ['original', 'detail', 'srcset', 'link', 'banner']);
    assert.deepEqual(downloaded.map((image) => image.url), [
      'https://cdn.example/original.jpg',
      'https://cdn.example/detail.jpg',
      'https://cdn.example/srcset.jpg',
      'https://cdn.example/linked.jpg',
      'https://cdn.example/banner.jpg',
    ]);
    assert.equal(downloaded.every((image) => /^[a-f0-9]{64}$/.test(image.sha256) && fs.existsSync(image.path)), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('OCR combines relevant images in order, deduplicates identical content and tolerates an image failure', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agora-ocr-test-'));
  process.env.TEMP = tempDir;
  const imageDir = path.join(tempDir, 'images');
  fs.mkdirSync(imageDir);
  const first = path.join(imageDir, 'first.png');
  const duplicate = path.join(imageDir, 'duplicate.png');
  const second = path.join(imageDir, 'second.png');
  const failing = path.join(imageDir, 'failing.png');
  fs.writeFileSync(first, 'same-image-content');
  fs.writeFileSync(duplicate, 'same-image-content');
  fs.writeFileSync(second, 'second-image-content');
  fs.writeFileSync(failing, 'failure-image-content');

  const recognized = [];
  const worker = {
    async setParameters() {},
    async recognize(imagePath) {
      recognized.push(imagePath);
      if (imagePath === failing) throw new Error('bad image');
      return { data: { text: imagePath === second ? 'SECOND FLYER\nShared line' : 'FIRST FLYER\nShared line' } };
    },
    async terminate() {},
  };
  const { processAllImages, terminateWorker } = loadTS('src/main/services/ocr.ts', {
    electron: { nativeImage: { createFromPath: () => ({ isEmpty: () => true }) } },
    'tesseract.js': { createWorker: async () => worker, PSM: { SINGLE_BLOCK: 6, SPARSE_TEXT: 11 } },
    '../utils/logger': { logger: { debug() {}, info() {}, warn() {} } },
  });

  try {
    const output = await processAllImages([
      { id: 'event-1', name: 'Event 1', localImagePath: first, localImagePaths: [first, duplicate, second, failing] },
    ]);
    assert.equal(output.get('event-1'), 'FIRST FLYER\nShared line\nSECOND FLYER');
    assert.equal(new Set(recognized).has(duplicate), false);
    assert.equal(recognized.filter((imagePath) => imagePath === first).length, 2);
    assert.equal(recognized.filter((imagePath) => imagePath === second).length, 2);
    assert.equal(recognized.filter((imagePath) => imagePath === failing).length, 1);
  } finally {
    await terminateWorker();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
