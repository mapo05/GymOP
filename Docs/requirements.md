# Gym Equipment Congestion Grader: Requirements

No code is included in this document. It describes what the system must do.

## 1. Who uses it

| Person | What they do |
|---|---|
| **Gym manager** (also covers gym owner) | Signs in to the front end for **their own gym only**. Uploads the weekly spreadsheet and the floor plan, sets per-machine limits, and reads grades, the map, and recommendations. |
| **Backend operator** | Anyone who holds the backend password. Sets up gyms and resets gym passwords. Never sees data from outside a task they are doing. |

## 2. How the numbers work (plain English)

For one machine type, in one time of day:

1. **People per hour** = total people ÷ hours in that time of day.
2. **Minutes per person** = total minutes ÷ total people.
3. **Points** = (minutes per person ÷ 5) × people per hour ÷ number of machines owned of that type.
4. A machine type is **backed up** when its points are **more than** its limit. The starting limit is **12**. A manager can change the limit for each machine type. Exactly 12 is *not* backed up.

Hours in each time of day: early morning 6am–9am = **3**, morning 9:01am–12pm = **3**, mid-day 12:01pm–4pm = **4**, evening 4:01pm–7pm = **3**, late-night 7:01pm–10pm = **3**.

## 3. Assumptions (every one I had to make)

| # | Assumption | Why it matters |
|---|---|---|
| A1 | **The front end also requires a sign-in.** You said only the backend needs a password, but managers upload data through the front end, and "data leaking between gyms" is a top worry. So each gym gets its own manager password. | Without this, anyone could upload to or read any gym. **Please confirm.** |
| A2 | There is **one shared backend password** (as you described), stored only in protected settings, never in the program itself. | Shared passwords cannot show who did what. Individual operator accounts would be safer. |
| A3 | **More than one gym exists** in the system. | Needed for the "no leaking between gyms" worry. |
| A4 | In "(minutes per person ÷ 5) × people", the "people" figure is **people per hour**, and the result is then **divided by the number of machines owned**. You described the rule per piece of equipment ("X/Y pieces"). | Changes which machines are flagged. **Please confirm.** |
| A5 | The spreadsheet has **one row per machine type per time of day** (and per weekday/weekend, see A6) with: week start date, equipment name, number owned, time of day, day type, total people, total minutes. | Defines what a "valid" file is. |
| A6 | Because each upload is a weekly average, the spreadsheet includes a **weekday** and a **weekend** row for each machine and time of day. The toggle then shows them separately or combined. When combined, weekdays count 5 parts and weekends count 2 parts. | The weekend toggle cannot work without this. **Please confirm.** |
| A7 | The five time bands touch each other with no gaps (9:00 to 9:01 is not a real gap). | Hours per band are 3, 3, 4, 3, 3. |
| A8 | "Live" map means it **updates whenever the data, limits, toggle, or time of day change**. It is not real-time sensor data, because data arrives weekly. | Sets expectations. |
| A9 | Recommendations use the **most recent week by default**. The manager can pick a range of weeks (for example 4 or 12) and the system averages the weekly values. | You said averages should be used; this is how I read it. |
| A10 | "Grade" means a **rank by points** within each time of day, plus a Backed up / Not backed up label. There are no letter grades. | Keeps to your two rules only. |
| A11 | The recommendation also says **how many extra machines** are needed: round up (points before dividing by machines owned ÷ limit), minus machines owned. | A simple, checkable number. |
| A12 | Floor plan is a **PNG or JPG up to 10 MB**. The manager places each machine on it by hand. | The system cannot guess machine positions. |
| A13 | Spreadsheet is **.xlsx or .csv, up to 5 MB and 5,000 rows**. | Limits abuse and mistakes. |
| A14 | The recommendation wording is produced by **fixed rules, not AI judgment**. If an AI writes the sentences, it may only reword numbers the rules already computed. | Prevents a "bad recommendation" from invented facts. |
| A15 | Data older than **2 weeks** triggers a warning on every screen. | A stale week can mislead. |
| A16 | The backend operator can create a gym, reset a gym's password, and delete a gym's data. That is all. | You did not list operator tasks. |

## 4. User stories and EARS criteria

EARS patterns used: *ubiquitous* ("The system shall"), *event* ("When"), *state* ("While"), *unwanted* ("If… then"), *optional* ("Where").

### Story 1: Upload weekly data
*As a gym manager, I want to upload this week's spreadsheet so my gym's picture stays current.*

- **REQ-01** (event) When a signed-in manager uploads a valid .xlsx or .csv file, the system shall save the data for that manager's gym and confirm in plain English how many rows were saved.
- **REQ-02** (ubiquitous) The system shall require these columns: week start date, equipment name, number owned, time of day, day type, total people, total minutes.
- **REQ-03** (unwanted) If a file has a problem, then the system shall save **nothing** and shall name the row and column and say how to fix it in plain English.
- **REQ-04** (unwanted) If a time of day is not one of the five fixed names, then the system shall reject the file and list the five allowed names.
- **REQ-05** (unwanted) If a number is negative, blank, or not a whole number, or if number owned is less than 1, or if minutes are above zero while people are zero, then the system shall reject the file and explain which value is wrong.
- **REQ-06** (event) When the uploaded week already exists for that gym, the system shall ask in plain English whether to replace it or cancel, and shall change nothing until the manager answers.
- **REQ-07** (state) While data is less than 5 years old, the system shall keep it; when data becomes older than 5 years, the system shall delete it.

### Story 2: Understand what is busy
*As a gym manager, I want each machine scored by time of day so I can see what gets backed up.*

- **REQ-08** (ubiquitous) The system shall use these fixed hours per time of day: early morning 3, morning 3, mid-day 4, evening 3, late-night 3.
- **REQ-09** (ubiquitous) The system shall calculate people per hour as total people divided by the hours in that time of day.
- **REQ-10** (ubiquitous) The system shall calculate minutes per person as total minutes divided by total people, and shall treat it as 0 when total people is 0.
- **REQ-11** (ubiquitous) The system shall calculate points as (minutes per person ÷ 5) × people per hour ÷ number of machines owned.
- **REQ-12** (event) When points are **more than** a machine's limit, the system shall label that machine type "Backed up" for that time of day; at or below the limit it shall label it "Not backed up".
- **REQ-13** (ubiquitous) The system shall start every machine type with a limit of 12.
- **REQ-14** (event) When a manager sets a new limit for a machine type, the system shall accept a number above 0, apply it to that gym's results straight away, and reject any other value with a plain-English message.
- **REQ-15** (ubiquitous) The system shall rank all machine types by points, highest first, within each time of day.
- **REQ-16** (event) When the manager turns the weekend toggle to "separate", the system shall show weekday and weekend results side by side; when set to "same", it shall combine them (weekdays 5 parts, weekends 2 parts).
- **REQ-17** (event) When the manager chooses a range of weeks, the system shall average the weekly totals across that range before scoring.

### Story 3: Get a recommendation
*As a gym manager, I want a plain recommendation so I know when to add capacity.*

- **REQ-18** (event) When a machine type is backed up in a time of day, the system shall show a sentence such as "Add capacity for [machine] during [time of day]."
- **REQ-19** (event) When a recommendation is shown, the system shall also show how many extra machines are needed, rounded up, as described in A11.
- **REQ-20** (ubiquitous) The system shall show, with every recommendation, the numbers behind it: people per hour, minutes per person, points, limit, and number owned.
- **REQ-21** (state) While no machine is backed up in the chosen view, the system shall say so plainly instead of showing an empty screen.
- **REQ-22** (state) While the newest uploaded week is more than 2 weeks old, the system shall show a warning that the data is old.
- **REQ-23** (ubiquitous) The system shall produce recommendations from fixed rules applied to validated data only.

### Story 4: See it on the floor plan
*As a gym manager, I want a map of my floor showing backed-up machines.*

- **REQ-24** (event) When a manager uploads a PNG or JPG floor plan up to 10 MB, the system shall store it for that gym and show it.
- **REQ-25** (event) When a manager places a machine on the floor plan, the system shall remember its position.
- **REQ-26** (state) While a time of day is selected, the system shall show each placed machine on the map as backed up or not.
- **REQ-27** (event) When data, a limit, the weekend toggle, the week range, or the time of day changes, the system shall refresh the map without the manager reloading the page.
- **REQ-28** (ubiquitous) The system shall mark backed-up machines with both a color and a text label or icon, so the map does not rely on color alone.
- **REQ-29** (ubiquitous) The system shall show a list of all machine types next to the map with their status.
- **REQ-30** (state) While a gym has no floor plan, the system shall show the list and tell the manager in plain English to upload a floor plan.

### Story 5: Run the system
*As a backend operator, I want to set up gyms safely.*

- **REQ-31** (event) When a signed-in operator creates a gym, the system shall create that gym with its own manager password.
- **REQ-32** (event) When a signed-in operator resets a gym's password, the system shall make the old password stop working immediately.
- **REQ-33** (event) When a signed-in operator deletes a gym's data, the system shall ask for confirmation first and shall remove that gym's data, including its floor plan.

### Story 6: Plain English everywhere
- **REQ-34** (ubiquitous) The system shall write every question, message, and error in common English, with no codes or technical terms, saying what happened and what to do next.

## 5. Non-goals

The system will **not**:

- Record or store anything about individual members (names, IDs, check-in times, photos).
- Handle payments, billing, or subscriptions.
- Read data live from sensors, door counters, or machine software.
- Place orders for, price, or choose specific equipment brands.
- Predict future busyness or use machine learning to guess; it only applies the fixed rules above.
- Show letter grades or any scoring other than points, rank, and backed-up status.
- Offer mobile apps, email alerts, or text notifications.
- Let managers see or compare other gyms.
- Let a manager change the five time-of-day hours.
- Detect where machines are on a floor plan automatically.
- Provide individual named accounts for the backend (see A2).
