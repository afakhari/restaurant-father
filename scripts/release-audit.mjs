// A deterministic release gate for the deliverables expected in the submission.
// It does NOT claim that a public deployment or an applicant-recorded video exists.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const checks = [
  ['README.md', ['docker compose up --build', 'Architecture', 'Security']],
  ['SCOPE.md', ['Customer problem', 'User journey', 'Domain and product boundaries', 'Risk register']],
  ['DECISIONS.md', ['Decision:', 'Alternative:', 'Trade-off:', 'REVISIT']],
  ['AI_USAGE.md', ['Tools used', 'rejected', 'How generated code was checked', 'Architecture decisions']],
  ['HANDOVER.md', ['محدودیت‌های شناخته‌شده', 'پنج قابلیت', '۱۰ رستوران', '۱٬۰۰۰', '۱۰۰٬۰۰۰']],
  ['AI_PROMPTS.md', ['Actual user instructions', 'runtime system prompt']],
  ['SUBMISSION_CHECKLIST.md', ['Live Demo URL', 'Demo Login', 'walkthrough']],
  ['docs/UX_BLUEPRINT.fa.md', ['Service Blueprint']],
  ['docs/UX_AUDIT.fa.md', ['۳۲۰', '۳۹۰', '۷۶۸', '۱۰۲۴', '۱۴۴۰']],
  ['DEPLOY.md', ['HTTPS']],
  ['SECURITY.md', ['cross-restaurant', 'Lost updates']],
  ['WALKTHROUGH.md', ['7–8 minutes']],
];
let failed = 0;
for (const [file, sections] of checks) {
  const location = path.join(root, file);
  if (!fs.existsSync(location)) { console.error(`MISSING: ${file}`); failed++; continue; }
  const text = fs.readFileSync(location,'utf8');
  if (text.trim().length < 150) { console.error(`EMPTY/INCOMPLETE: ${file}`); failed++; continue; }
  for (const section of sections) if (!text.toLowerCase().includes(section.toLowerCase())) {
    console.error(`MISSING SECTION: ${file} → ${section}`); failed++;
  }
}
const impl = fs.readFileSync(path.join(root,'src/public/app.js'),'utf8');
const css = fs.readFileSync(path.join(root,'src/public/styles.css'),'utf8');
for (const must of ['hall-steps','mobile-draft-bar','action-dialog','sync-status']) {
  if (!impl.includes(must) || !css.includes(must)) {console.error(`MISSING UX FEATURE: ${must}`);failed++;}
}
if(failed) {console.error(`RELEASE_AUDIT_FAILED: ${failed} finding(s)`);process.exitCode=1;}
else console.log(`RELEASE_AUDIT_PASS: ${checks.length} complete documentation files and 4 key UX safeguards`);
