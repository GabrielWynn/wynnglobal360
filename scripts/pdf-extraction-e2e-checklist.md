# PDF Extraction — Manual E2E Checklist

Run this checklist **once per platform** with a real statement PDF before
trusting PDF uploads for that platform in production. Automated tests
(`npm run test:pdf-extraction`) cover schemas and normalisation, but only a
real PDF through the real Landing.ai API validates extraction quality.

## Prerequisites
- [ ] `LANDINGAI_API_KEY` set locally (`.env.local`) and in the Vercel project
- [ ] A usage alert configured in the Landing.ai dashboard (billing is per page parsed)
- [ ] A real commission statement PDF for the platform under test
- [ ] The same statement hand-checked: row count, 2–3 spot-check rows, grand total

## Per-platform checklist (repeat for RL360, FPI, Utmost, Hansard, …)

### Extraction
- [ ] Admin → Commission → Upload: select the platform, drop the PDF, Continue
- [ ] Extraction completes (long statements may take 1–2 minutes)
- [ ] Row count in the preview matches the hand-counted statement rows
      (no subtotal/total rows leaked in, no line items missed)
- [ ] Spot-check 2–3 rows against the PDF: policy number, holder name, date,
      type, amount (sign included for clawbacks), currency
- [ ] Any extraction warnings shown are understood and acceptable

### CSV fallback
- [ ] "Download CSV" produces a file named `{platform}-{file}-{date}.csv`
- [ ] The CSV re-uploads cleanly through the existing CSV flow (column mapping
      with canonical headers) — this is the manual-correction path

### Processing
- [ ] "Process N Rows" completes; result stats match expectations
      (total / saved / mapped / unmapped)
- [ ] Master File shows the new records with correct amounts and dates
- [ ] Sum of imported amounts for the batch matches the statement total
- [ ] `raw_commission_data.raw_data` contains the full extracted row (audit)
- [ ] Policies unknown to Azure appear in `unmapped_policies` as usual

### Failure handling
- [ ] Uploading a non-statement PDF returns a clear error (HTTP 422), nothing persisted
- [ ] Re-running the same upload after an extraction error works (retry is safe)

## Sign-off

| Platform | Statement date | Rows (PDF / extracted) | Total matches | Tested by | Date |
|----------|----------------|------------------------|---------------|-----------|------|
| RL360    |                |                        |               |           |      |
| FPI      |                |                        |               |           |      |
| Utmost   |                |                        |               |           |      |
| Hansard  |                |                        |               |           |      |
