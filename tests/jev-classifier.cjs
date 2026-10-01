const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
let apiKey = 'test-key';
function loadTS(relativePath, mocks = {}) {
  const filename = path.resolve(relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : originalRequire(name);
  mod._compile(source, filename);
  return mod.exports;
}
const retry = loadTS('src/main/utils/retry.ts');
const classifier = loadTS('src/main/services/llm.ts', {
  './keytarStore': { getApiKey: () => apiKey },
  '../utils/logger': { logger: { warn() {} } },
  '../utils/retry': retry,
});
const events = [
  { index: 0, title: 'Pizza provided', description: 'Free pizza for attendees.', imageText: '' },
  { index: 1, title: 'Career fair', description: 'Free admission. Bring your own lunch.', imageText: '' },
  { index: 2, title: 'Social', description: 'Refreshments may be available.', imageText: '' },
];
function answer(choice) {
  return { type: 'choice', choice, confidence: 0.9,
    probabilities: { provided: choice === 'provided' ? 0.9 : 0.05,
      not_provided: choice === 'not_provided' ? 0.9 : 0.05,
      uncertain: choice === 'uncertain' ? 0.9 : 0.05 } };
}
function response() {
  return { model: 'jev-1.13.0', answers: { food_0: answer('provided'),
    food_1: answer('not_provided'), food_2: answer('uncertain') } };
}
test('Jev HTTP adapter and response validation', async (t) => {
  await t.test('matches typed decisions by event ID, including uncertainty', () => {
    const results = classifier.parseJevResponse(response(), events);
    assert.deepEqual(results.map(r => r.hasFood), [true, false, false]);
    assert.deepEqual(results.map(r => r.foodStatus), ['provided', 'not_provided', 'uncertain']);
    assert.equal(results[0].confidence, 0.9);
    assert.match(results[2].reasoning, /could not determine/);
  });
  await t.test('rejects missing answers, invalid choices and malformed probabilities', () => {
    const missing = response(); delete missing.answers.food_1;
    assert.throws(() => classifier.parseJevResponse(missing, events), /missing event/);
    const unknown = response(); unknown.answers.food_0.choice = 'pizza';
    assert.throws(() => classifier.parseJevResponse(unknown, events), /invalid decision/);
    const bad = response(); bad.answers.food_0.probabilities.provided = 2;
    assert.throws(() => classifier.parseJevResponse(bad, events), /invalid probabilities/);
    const confidence = response(); confidence.answers.food_0.confidence = NaN;
    assert.throws(() => classifier.parseJevResponse(confidence, events), /invalid decision/);
  });
  await t.test('uses the official endpoint, isolated event questions and server-side authentication', async () => {
    const original = global.fetch;
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'jev-1.13.0');
      assert.equal(body.state.events.event_1.title, 'Career fair');
      assert.match(body.questions.food_1.instructions, /ONLY state.events.event_1/);
      assert.equal(body.questions.food_0.type, 'choice');
      assert.equal(options.redirect, 'error');
      return Response.json(response());
    };
    try { assert.equal((await classifier.classifyBatch(events)).length, 3); }
    finally { global.fetch = original; }
  });
  await t.test('missing key makes no HTTP request', async () => {
    apiKey = null;
    try { await assert.rejects(classifier.classifyBatch(events), /TypeSafe API key not configured/); }
    finally { apiKey = 'test-key'; }
  });
  await t.test('authentication errors are not retried or leaked', async () => {
    let calls = 0;
    const original = global.fetch;
    global.fetch = async () => { calls++; return new Response('sensitive provider error body', { status: 401 }); };
    try {
      await assert.rejects(classifier.classifyBatchWithRetry(events), /TypeSafe rejected/);
      assert.equal(calls, 1);
    } finally { global.fetch = original; }
  });
  await t.test('rate limits retry and recover', async () => {
    let calls = 0;
    const original = global.fetch;
    global.fetch = async () => ++calls === 1 ? new Response('', { status: 429 }) : Response.json(response());
    try { assert.equal((await classifier.classifyBatchWithRetry(events)).length, 3); assert.equal(calls, 2); }
    finally { global.fetch = original; }
  });
});
