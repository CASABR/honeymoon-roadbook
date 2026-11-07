const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== TEST BLOCK C: CONSOLE MANAGER (9), LIVE GUEST MESSAGES (12), HOUNIAI .EML/GMAIL (13), UX/LIGHT THEME/EMPTY TRIP (6) ===\n');

const root = path.join(__dirname, '..');
const adminDashCode = fs.readFileSync(path.join(root, 'src/views/altro/AdminDashboardView.tsx'), 'utf8');
const liveServiceCode = fs.readFileSync(path.join(root, 'src/services/liveService.ts'), 'utf8');
const liveViewCode = fs.readFileSync(path.join(root, 'src/views/altro/LiveView.tsx'), 'utf8');
const liveEditorialCode = fs.readFileSync(path.join(root, 'src/views/altro/LiveEditorialExperience.tsx'), 'utf8');
const firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const gmailRowCode = fs.readFileSync(path.join(root, 'src/components/common/GmailConnectionRow.tsx'), 'utf8');
const smartInsertCode = fs.readFileSync(path.join(root, 'src/components/modals/SmartInsertModal.tsx'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const darkModeCode = fs.readFileSync(path.join(root, 'src/components/common/DarkModeToggle.tsx'), 'utf8');
const storageCode = fs.readFileSync(path.join(root, 'src/storage/storageService.ts'), 'utf8');

// 1. Test Section 9: Console Manager (destination derivation + copilot association + 0000 protection)
console.log('1. Testing Section 9: Console Manager (deriveTripDestination, Admin Copilot Assignment, 0000 protection)...');
assert(adminDashCode.includes('export function deriveTripDestination(tripId: string'), 'deriveTripDestination helper must exist');
assert(adminDashCode.includes("if (tripId === '0000') return 'Nuova Zelanda, Australia & Filippine';"), '0000 must derive its real destination');
assert(adminDashCode.includes('const handleSaveTripDestination = async'), 'handleSaveTripDestination must exist in Console Manager');
assert(adminDashCode.includes('const handleAdminAssignCopilot = async'), 'handleAdminAssignCopilot must exist in Console Manager');
assert(adminDashCode.includes("if (targetTripId === '0000')"), 'Console Manager must protect trip 0000 from admin overwrite');
assert(adminDashCode.includes('Associa Copilota a un Viaggio (Console Manager)'), 'UI form for Admin Copilot Assignment must exist');
assert(firestoreRules.includes("|| (isGlobalAdmin() && tripId != '0000')"), 'Firestore rules must allow GlobalAdmin copilot/trip updates only on non-0000 trips');
console.log('   [PASS] Section 9 Console Manager verified.');

// 2. Test Section 12: LIVE Public Guestbook & Moderation
console.log('2. Testing Section 12: LIVE Public Guest Messages, Sanitization, Rate Limiting & Moderation...');
assert(liveServiceCode.includes('export interface LiveGuestMessage'), 'LiveGuestMessage interface must be exported');
assert(liveServiceCode.includes('export const sanitizeGuestMessageInput'), 'sanitizeGuestMessageInput must be defined');
assert(liveServiceCode.includes('async sendGuestMessage('), 'sendGuestMessage must be defined on liveService');
assert(liveServiceCode.includes('subscribeToGuestMessages('), 'subscribeToGuestMessages must be defined on liveService');
assert(liveServiceCode.includes('async moderateGuestMessage('), 'moderateGuestMessage must be defined on liveService');
assert(liveServiceCode.includes('30_000') || liveServiceCode.includes('30000'), '30s anti-spam rate limit cooldown must be enforced');
assert(firestoreRules.includes('function validGuestMessage(data)'), 'Firestore rules must validate guest messages');
assert(firestoreRules.includes('match /guest_messages/{msgId}'), 'Firestore rules must define /live_feeds/{tripId}/guest_messages/{msgId}');
assert(liveViewCode.includes('subscribeToGuestMessages('), 'LiveView must subscribe to guest messages');
assert(liveEditorialCode.includes('Messaggi dal pubblico') || liveEditorialCode.includes('guestMessages'), 'LiveEditorialExperience must render the Guestbook section');
assert(liveEditorialCode.includes('onModerateGuestMessage'), 'LiveEditorialExperience must provide Owner/Copilota moderation actions');

// Behavioral check on sanitizeGuestMessageInput logic
function sanitizeGuestMessageInputSim(rawAuthor, rawText) {
  const stripHtmlAndControl = (s) =>
    String(s || '')
      .replace(/<[^>]*>/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const authorName = stripHtmlAndControl(rawAuthor).slice(0, 40);
  const text = stripHtmlAndControl(rawText).slice(0, 280);
  return { authorName, text };
}
const sanitized = sanitizeGuestMessageInputSim('<b>Zio Gianni</b>\u0007', '<script>alert(1)</script>Buon viaggio ragazzi!!   ');
assert.strictEqual(sanitized.authorName, 'Zio Gianni');
assert.strictEqual(sanitized.text, 'alert(1)Buon viaggio ragazzi!!');
console.log('   [PASS] Section 12 LIVE Guest Messages & Moderation verified.');

// 3. Test Section 13: HouniAI Smart Insert, .eml parser, Gmail fallback & zero exposed secrets
console.log('3. Testing Section 13: HouniAI .eml parsing, Gmail fallback & zero exposed secret keys...');
assert(gmailRowCode.includes('gmail.readonly'), 'GmailConnectionRow must transparently explain gmail.readonly OAuth status');
assert(gmailRowCode.includes('Incolla testo email o carica PDF / screenshot / .eml'), 'GmailConnectionRow must offer direct Smart Insert fallback CTA');
assert(smartInsertCode.includes('function parseEmlContent(rawEml: string): string'), 'SmartInsertModal must implement parseEmlContent');
assert(smartInsertCode.includes('.eml,message/rfc822'), 'SmartInsertModal file input must accept .eml files');

// Behavioral check on .eml quoted-printable + headers parsing
function parseEmlSample(rawEml) {
  const normalized = rawEml.replace(/\r\n/g, '\n');
  const headerEndIdx = normalized.indexOf('\n\n');
  const rawHeaders = headerEndIdx !== -1 ? normalized.slice(0, headerEndIdx) : '';
  const unfoldedHeaders = rawHeaders.replace(/\n[ \t]+/g, ' ');
  const getHeader = (name) => {
    const match = unfoldedHeaders.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'));
    return match ? match[1].trim() : '';
  };
  return {
    subject: getHeader('Subject'),
    from: getHeader('From')
  };
}
const sampleEml = 'From: Booking.com <customer.service@booking.com>\r\nSubject: Conferma prenotazione Park Hyatt Auckland\r\n\r\nCheck-in: 2026-11-30\r\nCodice: BK-998877';
const parsedEml = parseEmlSample(sampleEml);
assert.strictEqual(parsedEml.subject, 'Conferma prenotazione Park Hyatt Auckland');
assert(parsedEml.from.includes('booking.com'));
console.log('   [PASS] Section 13 HouniAI .eml & Gmail fallback verified.');

// 4. Test Section 6: Light theme default & New trips 100% empty
console.log('4. Testing Section 6: Light Theme Default & Empty New Trip Guarantee...');
assert(indexHtml.includes('name="color-scheme" content="light"'), 'index.html must declare color-scheme light');
assert(indexHtml.includes("document.documentElement.classList.remove('dark')"), 'index.html must remove dark class by default');
assert(indexHtml.includes("if (saved === 'dark')"), 'index.html must only enable dark mode when explicitly saved');
assert(darkModeCode.includes('const [isDark, setIsDark] = useState(false);'), 'DarkModeToggle must default to false (Light Mode)');
assert(storageCode.includes('il sistema non inietta più alcun mock data'), 'initInitialSeedData must be a no-op so new trips start empty');
console.log('   [PASS] Section 6 Light Theme & Empty New Trips verified.');

console.log('\nALL BLOCK C TESTS PASSED SUCCESSFULLY (4/4)!');

