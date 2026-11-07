const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, '../firestore.rules.candidate');
let rules = fs.readFileSync(targetPath, 'utf8');

const oldMembers = rules.match(/match \/members\/\{uid\} \{[\s\S]*?match \/inviteTokens/);
if (!oldMembers) {
  console.error('Match old members non trovato!');
  process.exit(1);
}

const replacement = `match /members/{uid} {
        allow read: if isTripMember(tripId) || isGlobalAdmin();

        allow create: if isSignedIn()
                        && request.resource.data.get('uid', uid) == uid
                        && request.resource.data.get('role', '') in ['owner', 'copilota', 'viewer']
                        && (
                          ((exists(/databases/$(database)/documents/trips/$(tripId)) && (
                              uid == get(/databases/$(database)/documents/trips/$(tripId)).data.get('ownerUid', null)
                              || uid == get(/databases/$(database)/documents/trips/$(tripId)).data.get('ownerId', null)
                            ))
                            && request.resource.data.get('role', '') == 'owner'
                            && (isTripOwner(tripId) || uid == request.auth.uid))
                          ||
                          (isTripOwner(tripId) && request.resource.data.get('role', '') in ['copilota', 'viewer'])
                          ||
                          (
                            tripId != '0000'
                            && uid == request.auth.uid
                            && resource == null
                            && request.resource.data.get('role', '') in ['copilota', 'viewer']
                            && request.resource.data.get('inviteToken', '') != ''
                            && exists(/databases/$(database)/documents/trips/$(tripId)/invites/$(request.resource.data.get('inviteToken', 'none')))
                            && get(/databases/$(database)/documents/trips/$(tripId)/invites/$(request.resource.data.get('inviteToken', 'none'))).data.status == 'active'
                          )
                        );

        allow update: if isSignedIn()
                        && isTripOwner(tripId)
                        && resource.data.get('role', '') != 'owner'
                        && request.resource.data.get('role', '') in ['copilota', 'viewer'];

        allow delete: if isSignedIn()
                        && resource.data.role != 'owner'
                        && isTripOwner(tripId);
      }

      // -----------------------------------------------------------------------
      // 1.2 SOTTOCOLLEZIONE INVITE TOKENS: /trips/{tripId}/inviteTokens/{tokenId}
      // -----------------------------------------------------------------------
      match /inviteTokens`;

rules = rules.replace(oldMembers[0], replacement);
fs.writeFileSync(targetPath, rules, 'utf8');
console.log('Candidate rules aggiornate con successo!');

