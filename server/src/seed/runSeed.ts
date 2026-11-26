import { ensureDemoDataSeeded } from './demoData.js';

ensureDemoDataSeeded()
  .then(() => {
    console.log('Demo seed completed cleanly (is_demo = 1).');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Demo seed failed:', err);
    process.exit(1);
  });
