# WC2026 Bracket Pool — Design Decisions

## Firestore Security Rules

### Why config and bracket allow open writes

There is no Firebase Auth in this app — users identify by name only, and the
admin is identified by a client-side passcode. Firestore has no way to
cryptographically verify who is making a write, so `/config` and `/bracket`
cannot be meaningfully locked at the rules level without introducing Auth.
Writes to these collections are controlled solely by the in-app passcode check.
For a private family pool this is an acceptable trust model.

### Submission ownership check

Submissions are stored at `/submissions/{userName}` where the document ID is
the user's name. The rule requires that `request.resource.data.userName == user`
(the `userName` field in the written document must match the document ID). This
prevents one user from accidentally or casually overwriting another's bracket.
It does not prevent deliberate impersonation (someone typing another person's
name) — that is an inherent limitation of the no-auth model.

### Deadline enforcement

`isBeforeDeadline()` reads `/config/main.deadline` (a Firestore Timestamp) via
`get()` inside the rule and compares it against `request.time` (the server
clock, not anything the client can spoof). If no deadline is set the function
returns `true` so submissions are open. Once the deadline passes, all normal
submission writes are rejected at the database level, not just hidden in the UI.

### Post-deadline prop-points exception

After the deadline the admin needs to write `propPoints` to submission documents
for manual prop grading. The rule allows this via `isPropPointsOnlyUpdate()`,
which checks that the resulting document's `picks` and `props` fields are
unchanged from what is already stored (`request.resource.data.picks ==
resource.data.picks` and same for `props`). If either field differs, the write
is denied even if it also contains `propPoints`.

**`request.writeFields` was tried first and abandoned.** It appeared to allow
writes it should have denied in isolated SDK testing. The
`resource.data == request.resource.data` field-comparison approach was verified
correct with a controlled two-step test (seed with clean doc, run tests with
deadline in the past, read doc state before and after each write to confirm no
contamination). Do not switch back to `request.writeFields`.

### Full rules (for reference)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /config/{doc} {
      allow read:  if true;
      allow write: if true;
    }

    match /bracket/{doc} {
      allow read:  if true;
      allow write: if true;
    }

    match /submissions/{user} {
      allow read: if true;
      allow write: if (request.resource.data.userName == user && isBeforeDeadline())
                   || isPropPointsOnlyUpdate(user);
    }

    function isBeforeDeadline() {
      let cfgExists = exists(/databases/$(database)/documents/config/main);
      let deadline  = cfgExists
        ? get(/databases/$(database)/documents/config/main).data.deadline
        : null;
      return deadline == null || request.time < deadline;
    }

    function isPropPointsOnlyUpdate(user) {
      return resource != null
          && request.resource.data.userName == user
          && request.resource.data.picks == resource.data.picks
          && request.resource.data.props == resource.data.props;
    }
  }
}
```
