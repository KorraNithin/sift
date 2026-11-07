# Sift: deployment and run guide

Sift is one Node service: an Express API that also serves the built React app, backed by a SQLite file.
There is nothing else to install or run (no separate database server, queue or cache).

**GitHub:** `https://github.com/<your-username>/sift` (replace with the real URL)
**Live app:** add the link here if you deploy it

## 1. Run it locally

Requirements: **Node.js 20.12 or newer** (22 LTS recommended) and npm. No other tools are needed.

```bash
git clone https://github.com/<your-username>/sift.git
cd sift

npm install        # installs server and client (npm workspaces)
npm run seed       # creates server/data/sift.db with demo accounts, 3 requisitions and 50 fictional candidates
npm run dev        # API on :4000, web app on :5173 (hot reload)
```

Open **http://localhost:5173** and sign in with one of the demo accounts below (or use the one-click buttons on the login page).

`npm run setup` does the install and seed in one step.

### Production-style run (single process)

```bash
npm run build      # builds client/dist
npm start          # Express serves the API and the built app on http://localhost:4000
```

### Tests and formatting

```bash
npm test                 # 40 test cases: scoring, fairness, parsing, ingestion, API access control, consent and erasure
npm run format:check     # Prettier
```

### Reset the demo data

`npm run seed` wipes the database and re-creates the demo data. It is safe to run any time locally.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| `better-sqlite3` fails to install | Use Node 20 or 22 LTS. The package ships prebuilt binaries for them. On other versions it compiles and needs a C++ toolchain. |
| Port 4000 or 5173 already in use | Set `PORT=4100` before `npm run dev`, or stop the other process. |
| Login says "Request blocked" | The browser is talking to the API without the app's own header. Use the app at http://localhost:5173 (dev) or :4000 (production run), not by calling the API from another site or tool. |
| Login says "Too many attempts" | The login rate limit is 30 attempts per 15 minutes per IP. Restart the server to clear it. |
| Blank page at :4000 | Run `npm run build` first. Without `client/dist` the server only serves the API. |

## 2. Demo logins (fictional data only)

Password for every account: `Demo@1234`

| Role | Email | What to look at |
| --- | --- | --- |
| Recruiter | `recruiter@companya.test` | Requisitions, bulk upload, ranked list with evidence, pipeline, scorecard, submit to client |
| Client hiring manager (Orbit IT Services) | `client@orbit.test` | Mobile-friendly shortlist portal, shortlist, reject with reason, propose interview slot |
| Delivery head | `head@companya.test` | KPIs, weekly AI vs recruiter sample, audit log. Read-only elsewhere |
| Client (Northbank Operations) | `client@northbank.test` | Proves clients only see their own candidates |
| Client (Kiran Retail) | `client@kiranretail.test` | Has no submissions yet, shows the empty state |

## 3. Five-minute review path

1. Sign in as **recruiter**. Open **Senior Java Developer**. The three sample candidates from the brief are in the list (Ritika Bansal, Pooja Nair, Arjun Rawat).
2. Click a candidate. Read the **score and evidence** tab, then the **CV** tab (evidence lines are highlighted). Note the line about hidden attributes.
3. Go back, choose **Add CVs**, tick the consent box and upload everything in `sample-cvs/`. The result list shows each outcome:

   | File | Expected outcome |
   | --- | --- |
   | `Karan_Mehta_CV.pdf`, `Sneha_Iyer_CV.docx`, `Divya_Rao_CV.pdf`, `Rohit_Das_CV.docx`, `Imran_Qureshi_CV.pdf`, `Vikram_Singh_CV.txt` | Parsed and ranked |
   | `Karan_Mehta_resume_updated.docx` | Detected as already in this requisition (same email as the PDF), not duplicated |
   | `Meera_Pillai_scan.pdf` | Scanned image: no text, so it is **unscored** and listed under "Needs a manual look". Open it, paste the text, and it is scored |
   | `Suresh_Kumar_corrupt.pdf` | Failed with a clear message. The rest of the batch is unaffected |

4. Open the **Scorecard** tab, make a skill a must-have, save. Every CV is re-scored.
5. Open a candidate marked "Screened" and try **Submit to client** before opening the CV: it is blocked. Open the CV, then submit.
6. Sign in as **client@orbit.test** (use a phone-sized window). Review, shortlist, propose a slot, or reject (a reason is required).
7. Sign in as **head@companya.test**: Insights shows KPIs, the weekly sample and the audit log (who viewed what).
8. As recruiter, open a candidate's **Profile and privacy** tab to see the consent record and the erase action.

## 4. How it is deployed

Sift deploys as **one web service** with **one persistent disk**. The reference setup is [Render](https://render.com),
but any host that runs Node and offers a persistent volume works (Railway, Fly.io, a VPS).

> Status: this repository has been run and tested locally. It has not been deployed from the environment it was
> written in, so the steps below are the intended setup. Add the live URL at the top of this file and in the TDD once deployed.

**Render, step by step**

1. Push the repository to GitHub and keep it public.
2. Create a **Web Service** from the repo.
   - Build command: `npm ci --include=dev && npm run build`
   - Start command: `npm start`
   - Node version: 22 (set `NODE_VERSION=22`)
3. Add a **persistent disk** (1 GB is plenty), mounted at `/var/data`.
4. Set the environment variables below. Use a long random value for `JWT_SECRET`
   (for example `openssl rand -hex 32`).
5. Deploy. On first start, `SEED_DEMO=true` creates the demo data if the database is empty.
   Remove `SEED_DEMO` after the review so a real deployment starts empty.
6. Open the service URL and sign in with a demo account.

SQLite on one disk fits a single instance. Scaling beyond one instance means moving to PostgreSQL (see the TDD).

## 5. Environment variables

Names only. Never commit values. `.env.example` lists them.

| Variable | Required | Purpose | Default |
| --- | --- | --- | --- |
| `NODE_ENV` | Production | `production` makes `JWT_SECRET` mandatory | `development` |
| `JWT_SECRET` | **Production** | Signs session cookies | Dev-only fallback (blocked in production) |
| `PORT` | No | HTTP port | `4000` |
| `DB_PATH` | Production | SQLite file path, on the persistent disk, e.g. `/var/data/sift.db` | `server/data/sift.db` |
| `STORAGE_DIR` | Production | Where original CV files are stored, e.g. `/var/data/cvs` | `server/data/cvs` |
| `COOKIE_SECURE` | Production over HTTPS | Sets the `Secure` flag on the session cookie | `false` |
| `SEED_DEMO` | No | `true` seeds demo data when the database is empty | `false` |
| `VITE_SHOW_DEMO` | No (build time) | `false` removes the one-click demo logins from the bundle | shown |
| `ANTHROPIC_API_KEY` | No | Enables optional LLM-assisted JD extraction. Falls back to rules if empty or on any error | empty |
| `ANTHROPIC_MODEL` | No | Model used when the key is set | `claude-sonnet-5-5` |

## 6. Data and privacy notes for reviewers

- All candidates, names, emails and phone numbers are **fictional** (`example.com` addresses, invented names).
  The sample CVs in `sample-cvs/` were generated for this project.
- Original CV files and the database live under `server/data/`, which is git-ignored.
- Erasing a candidate removes their personal data and stored file. The audit log keeps IDs only, never personal data.
