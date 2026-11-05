# Sift

AI resume screening and a client shortlist portal for a staffing firm. Recruiters upload a pile of CVs against a job
and see the best first, with the exact CV line behind every score. Clients review shortlists on their phone.

- **Rank, with receipts.** Each score is a set of criteria, and each criterion quotes the line from the CV that earned it.
- **Fair by construction.** Name, gender, age, photo and marital status are removed before scoring. A test proves it.
- **Never auto-rejects.** The AI ranks. People decide. Low scorers stay searchable. A recruiter must open a CV before submitting it.
- **Client portal.** Masked contacts, shortlist, reject with a reason, or propose an interview slot.
- **DPDP Act 2023 aware.** Consent record per candidate, hiring-only purpose, erasure on request, and an audit log of who viewed what.

Start with [`deployment.md`](deployment.md) to run it. The design rationale is in the Technical Design Document.

```text
server/   Express API, SQLite, scoring engine, tests (node:test)
client/   React + Vite single-page app (recruiter, client and delivery-head views)
sample-cvs/   Fictional CVs for trying bulk upload (PDF, DOCX, TXT, a scan, a duplicate, a corrupt file)
```

Quick start: `npm install && npm run seed && npm run dev`, then open http://localhost:5173.
