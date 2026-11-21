# GymOP upload data outline

This guide reflects the current validator in `lib/story1.ts`. The application expects
one CSV or XLSX upload for one gym and one week.

## Required columns

Use these exact column names (capitalization is flexible; spelling and wording are not):

| Column | Required value | Example |
|---|---|---|
| `week start date` | A real date formatted `YYYY-MM-DD`; every row in the file must use the same date | `2026-11-16` |
| `equipment name` | Non-empty equipment name | `Treadmill` |
| `number owned` | Whole number of 1 or more; keep the same count for a machine throughout the week | `10` |
| `time of day` | One of the five exact choices below | `Early morning` |
| `day type` | A weekday name, Monday through Sunday | `Monday` |
| `total people` | Whole number of 0 or more | `90` |
| `total minutes` | Whole number of 0 or more; must be 0 when total people is 0 | `1800` |

## Accepted time-of-day values

- `Early morning`
- `Morning`
- `Mid-day`
- `Evening`
- `Late-night`

The calculation specification assigns durations of 3, 3, 4, 3, and 3 hours respectively.

## Row rules

- Include one row per equipment + time-of-day + day combination. Do not duplicate that combination.
- Keep `number owned` consistent for the same equipment throughout the week.
- Use whole numbers for equipment count, people, and minutes.
- Do not use negative values, decimals, blanks, or formula cells.
- Do not add columns. The validator rejects every extra column, including personal information such as member names or IDs.
- Do not include member-level information. GymOP is designed for aggregate equipment usage only.
- One upload must contain only one `week start date`.
- The current parser accepts `.csv` and `.xlsx`; the current row limit is 5,000.

## Important current behavior to confirm with the team

The current code derives `dayCategory` as follows: Friday, Saturday, and Sunday are categorized as `weekend`; Monday through Thursday are categorized as `weekday`. This is what the application currently does, even though many conventional definitions treat Friday as a weekday. Confirm this product decision before changing the validator or the template.

## Example CSV header

```csv
week start date,equipment name,number owned,time of day,day type,total people,total minutes
```

The repository's `test-upload-week.csv` is an example populated file. It can be opened in Excel or Google Sheets to see the expected structure.
