# Gym Equipment Congestion Grader: Security Specification

No code is included. This describes what the system must guarantee. Assumption numbers (A1, A2, ...) refer to `requirements.md`.

## 1. What we are protecting

| Asset | Why it matters |
|---|---|
| The backend | You said nobody without the password may enter. |
| Each gym's usage data and floor plan | Your top worry is data leaking from one gym to another. |
| Recommendation accuracy | Your other top worry is a bad recommendation. Bad or tampered data causes bad advice. |

No personal member information is collected (see SEC-18), which removes a whole class of risk.

## 2. What could go wrong (threats)

1. Someone guesses or steals the backend password.
2. A manager from Gym A reads, changes, or deletes Gym B's data.
3. A bad spreadsheet or floor plan file harms the system or plants false numbers.
4. Someone uploads personal data we are not supposed to hold.
5. Data is quietly overwritten, so recommendations become wrong without anyone noticing.
6. Hidden text in a spreadsheet (for example an equipment name written as an instruction) tricks an AI part of the agent.
7. Secrets (passwords) end up in code, logs, or backups.

## 3. Security requirements (EARS)

### Sign-in and passwords

- **SEC-01** (ubiquitous) The system shall check the backend password on **every** backend request, not only on the sign-in page.
- **SEC-02** (unwanted) If a request reaches the backend without a valid sign-in, then the system shall refuse it and return no backend data.
- **SEC-03** (ubiquitous) The system shall require a manager to sign in to the front end before they can upload, view, or change anything (A1).
- **SEC-04** (ubiquitous) The system shall require passwords of at least 12 characters and shall store them only as salted, slow one-way hashes, never as readable text.
- **SEC-05** (unwanted) If there are 5 failed sign-ins within 15 minutes for the same account or from the same address, then the system shall block further attempts for 15 minutes.
- **SEC-06** (ubiquitous) The system shall give the same message for a wrong gym name and a wrong password, so attackers learn nothing.
- **SEC-07** (state) While a session is idle for 30 minutes, or has lasted 8 hours, the system shall end it; when a user signs out, the system shall end it immediately.
- **SEC-08** (ubiquitous) The system shall accept connections only over encrypted HTTPS and shall refuse plain HTTP.
- **SEC-09** (unwanted) If the backend password is missing or is a known default at startup, then the system shall refuse to start the backend (A2).
- **SEC-10** (ubiquitous) The system shall keep passwords and keys in protected settings, never in the source files or in the logs.

### Keeping gyms apart

- **SEC-11** (ubiquitous) The system shall decide which gym a request belongs to from the signed-in session on the server, never from anything the browser sends.
- **SEC-12** (unwanted) If a manager asks for another gym's data, floor plan, or limits, then the system shall answer "not found", exactly as for something that does not exist.
- **SEC-13** (ubiquitous) The system shall store floor plans privately, give them unguessable names, and serve them only to the gym that owns them.
- **SEC-14** (ubiquitous) The system shall never share saved screens or cached answers between gyms.
- **SEC-15** (unwanted) If an operator deletes or resets a gym, then the system shall change only that gym and nothing else.

### Files and typed input

- **SEC-16** (ubiquitous) The system shall check uploaded file type by its real contents, not its name, and accept only .xlsx, .csv (data, 5 MB, 5,000 rows) and PNG or JPG (floor plan, 10 MB) (A12, A13).
- **SEC-17** (ubiquitous) The system shall never run formulas or macros in an uploaded spreadsheet, and shall reject any cell that starts with `=`, `+`, `-` (when not a plain number), or `@`.
- **SEC-18** (unwanted) If a spreadsheet contains any column not on the allowed list (for example a member name or ID), then the system shall reject the whole file and explain that personal information is not accepted.
- **SEC-19** (ubiquitous) The system shall re-save every floor plan as a fresh image with hidden data removed, and shall refuse SVG and other image types.
- **SEC-20** (ubiquitous) The system shall never use an uploaded file name as a file location.
- **SEC-21** (ubiquitous) The system shall treat all typed or uploaded text (such as equipment names) as plain text, so it can never run as a script on a page or as a database command.
- **SEC-22** (ubiquitous) If any AI part helps write sentences, then the system shall treat uploaded text as data only, and shall only let it reword numbers the fixed rules produced (A14).
- **SEC-23** (ubiquitous) The system shall limit uploads to 10 per gym per hour.

### Protecting what we keep

- **SEC-24** (ubiquitous) The system shall encrypt stored data, floor plans, and backups.
- **SEC-25** (state) While a backup holds data older than 5 years, the system shall remove it on the same schedule as the live data (matches REQ-07).
- **SEC-26** (unwanted) If something fails, then the system shall show a plain-English message and shall not reveal file paths, database details, or program internals.

### Recording what happens

- **SEC-27** (event) When anyone signs in or fails to, uploads, replaces a week, changes a limit, uploads a floor plan, or when an operator creates, resets, or deletes a gym, the system shall record who, which gym, what, and when.
- **SEC-28** (ubiquitous) The system shall never write passwords or session keys to the record.
- **SEC-29** (ubiquitous) The system shall let a manager see their own gym's record of uploads, replaced weeks, and limit changes, so they can spot a bad change.

### Software upkeep

- **SEC-30** (ubiquitous) The system shall pass a check for known-vulnerable parts, with no unresolved critical findings, before any release.

## 4. Open items for you

- **A1:** confirm each gym gets its own manager password.
- **A2:** a single shared backend password cannot say who did what. Consider named operator accounts later.
- No password-recovery feature is specified; an operator resets passwords (REQ-32).
