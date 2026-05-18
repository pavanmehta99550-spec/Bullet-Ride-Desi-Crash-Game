# Security Specification - Desi Crash Game

## Data Invariants
1. A user can only read and write their own profile information.
2. `walletBalance` can only be updated by the user if it's within game logic bounds (though real apps should do balance logic server-side or via Functions, for this prompt I will implement client-side sync with safe rules).
3. `createdAt` is immutable.
4. Game history records can only be created by the user they belong to and are immutable once created.
5. `uid` in the document must match the creator's Auth UID.

## The Dirty Dozen (Malicious Payloads)

1. **Identity Theft (Profile)**: Attempting to update another user's balance.
   - Path: `/users/target_uid`
   - Payload: `{ walletBalance: 9999999 }`
   - Actor: `malicious_uid`
   - Result: `PERMISSION_DENIED`

2. **Identity Spoofing (Creation)**: Creating a profile with a `uid` that doesn't match the Auth UID.
   - Path: `/users/attacker_uid`
   - Payload: `{ uid: 'other_uid', email: '...', walletBalance: 5000 }`
   - Result: `PERMISSION_DENIED`

3. **Balance Inflation (Update)**: Attempting to update balance without decreasing it after a loss (Logic check).
   - *Note: Rules can't easily check game logic, but we can prevent shadow fields.*

4. **Shadow Field Injection**: Adding `isAdmin: true` to a profile.
   - Payload: `{ walletBalance: 5000, isAdmin: true }`
   - Result: `PERMISSION_DENIED` (due to `hasOnly` keys check).

5. **History Poisoning**: Creating a history record for another user.
   - Path: `/users/victim_uid/history/fake_game`
   - Result: `PERMISSION_DENIED`

6. **Immutability Breach**: Changing `createdAt` timestamp.
   - Result: `PERMISSION_DENIED`

7. **Resource Exhaustion**: Writing a 1MB string to `displayName`.
   - Result: `PERMISSION_DENIED` (due to `.size()` check).

8. **ID Poisoning**: Using a 2KB string as a document ID.
   - Result: `PERMISSION_DENIED` (due to `isValidId` check).

9. **Unauthenticated Write**: Trying to create a profile without being logged in.
   - Result: `PERMISSION_DENIED`

10. **State Shortcutting (History)**: Updating a game result after it was saved.
    - Result: `PERMISSION_DENIED` (History should be create-only).

11. **PII Leak**: A user trying to list all users to find emails.
    - Result: `PERMISSION_DENIED`

12. **Timestamp Fraud**: Providing a future timestamp in `createdAt` instead of `request.time`.
    - Result: `PERMISSION_DENIED`
