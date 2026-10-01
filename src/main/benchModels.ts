import { loadApiKeyFromKeychain, hasApiKey } from './services/keytarStore';
import { classifyBatchWithRetry, JEV_MODEL, type FoodStatus } from './services/llm';

// Synthetic diagnostic set only. For saved real-event reviews, use `npm run eval:reviews`.
const CASES: Array<{ title: string; description: string; imageText: string; expected: FoodStatus }> = [
  { title: 'Club meeting', description: 'Free pizza and drinks provided.', imageText: '', expected: 'provided' },
  { title: 'Career fair', description: 'Free admission for all students.', imageText: '', expected: 'not_provided' },
  { title: 'Study group', description: 'Bring your own snacks.', imageText: '', expected: 'not_provided' },
  { title: 'Welcome social', description: '', imageText: 'FREE FOOD! Pizza and refreshments served.', expected: 'provided' },
  { title: 'Food drive', description: 'Donate canned food to the local pantry.', imageText: '', expected: 'not_provided' },
  { title: 'Fundraiser', description: 'Pizza slices for sale: $3 each.', imageText: '', expected: 'not_provided' },
  { title: 'Lunch talk', description: 'Lunch will be provided to attendees.', imageText: '', expected: 'provided' },
  { title: 'Restaurant outing', description: 'Meet at Chipotle. Everyone pays for their own order.', imageText: '', expected: 'not_provided' },
  { title: 'Coffee chat', description: 'Complimentary coffee and pastries for attendees.', imageText: '', expected: 'provided' },
  { title: 'Raffle', description: 'Win a Starbucks gift card. Free registration.', imageText: '', expected: 'not_provided' },
  { title: 'Workshop', description: 'Snacks may be available, details to be confirmed.', imageText: '', expected: 'uncertain' },
  { title: 'Nutrition lecture', description: 'Learn about healthy food and meal planning. No food served.', imageText: '', expected: 'not_provided' },
];

async function main(): Promise<void> {
  await loadApiKeyFromKeychain();
  if (!hasApiKey()) throw new Error('Save a TypeSafe API key in the desktop app Settings first.');
  const start = Date.now();
  let correct = 0;
  let falsePositives = 0;
  let missedFood = 0;
  for (let offset = 0; offset < CASES.length; offset += 5) {
    const batch = CASES.slice(offset, offset + 5);
    const results = await classifyBatchWithRetry(batch.map((event, index) => ({ ...event, index })));
    for (const result of results) {
      const event = batch[result.index];
      const match = result.foodStatus === event.expected;
      if (match) correct++;
      if (result.hasFood && event.expected !== 'provided') falsePositives++;
      if (!result.hasFood && event.expected === 'provided') missedFood++;
      console.log(`${match ? 'PASS' : 'FAIL'} ${event.title}: ${result.foodStatus} (expected ${event.expected}, confidence ${Math.round(result.confidence * 100)}%)`);
    }
  }
  console.log(`\n${JEV_MODEL}: ${correct}/${CASES.length} diagnostic cases matched (${Math.round(correct / CASES.length * 100)}%).`);
  console.log(`False food positives: ${falsePositives}; missed food cases: ${missedFood}; elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s.`);
  console.log('This is a synthetic diagnostic score. Real event accuracy needs a separate evidence review.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Jev evaluation failed.');
  process.exitCode = 1;
});
