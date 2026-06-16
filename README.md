# Prompt Studio

A small web app for **writing, testing, and improving prompts** for a large
language model (LLM). You type a prompt, run it against a live model, see the
answer, tweak the wording, and compare versions side‑by‑side until you're happy.

It runs entirely on your own machine and talks to an LLM server that your team
hosts (a [llama.cpp](https://github.com/ggml-org/llama.cpp) server, which speaks
the same API as OpenAI). Nothing is sent to the public internet.

---

## Table of contents

- [Who this is for](#who-this-is-for)
- [The big idea in 60 seconds](#the-big-idea-in-60-seconds)
- [Key concepts](#key-concepts)
- [A guided tour of the screen](#a-guided-tour-of-the-screen)
- [How to use it — a typical session](#how-to-use-it--a-typical-session)
- [The settings explained (in plain words)](#the-settings-explained-in-plain-words)
- [Running the app](#running-the-app)
- [Troubleshooting](#troubleshooting)
- [For developers](#for-developers)

---

## Who this is for

You **do not need to be a programmer** to use Prompt Studio. If you write
prompts — for chatbots, summarisers, search helpers, anything — this tool helps
you do it more carefully: keep your prompts in one place, try changes safely,
and measure whether a change actually made the answer better.

The only technical part is the one‑time setup ([Running the app](#running-the-app)).
If someone has already started it for you, skip straight to
[A guided tour of the screen](#a-guided-tour-of-the-screen).

---

## The big idea in 60 seconds

Getting good results from an AI model is mostly about **how you ask**. The same
question phrased two different ways can give very different answers. So improving
a prompt is a loop:

> **write → run → read the answer → adjust → run again → compare**

Prompt Studio is built around that loop. It keeps every prompt you write, lets
you save **versions** as you experiment (so you never lose a wording that worked),
and lets you run **two versions head‑to‑head** to see which is better.

---

## Key concepts

Three words are worth learning before you start:

### Prompt
A **prompt** is the instruction you send to the AI. In this app a prompt is a
saved item with a **name** (e.g. `rag-keywords`), an optional **description**
(what it's for), and the actual **prompt text**. Your prompts are listed down
the left‑hand sidebar.

### Version
A **version** is one saved wording of a prompt's text. Every prompt starts with
one version. As you experiment you can **save a new version** to keep the old
wording around. This means you can always go back, and you can compare an old
wording against a new one. One version is always marked as the **current** one.

### Variable
Often you want the same prompt with one part swapped out each time — for example
"summarise *this* document" where the document changes. You mark that swappable
part with double curly braces, like `{{document}}` or `{{query}}`. These are
called **variables**.

When the app sees `{{query}}` in your prompt text, it automatically shows a small
input box labelled `query`. Whatever you type there gets dropped into the prompt
in place of `{{query}}` when you run it. You can have as many variables as you
like.

Example prompt text:

```
Generate 5 keywords for the following query: {{query}}.
Answer only in JSON format with an array of strings.
Respond in {{language}}.
```

This prompt has two variables, `query` and `language`, which you fill in before
each run.

---

## A guided tour of the screen

The window has two parts: the **sidebar** on the left and the **workspace** on
the right.

### The sidebar (left)
- **Collapse arrow** (top) — shrinks the sidebar to a thin strip of icons to give
  the workspace more room. Click it again to expand.
- **Overview / A/B Tester** — the two tabs that switch what the workspace shows
  (these appear once you've selected a prompt). More on each below.
- **New Prompt** — creates a new prompt (it asks you for a name first).
- **Prompt list** — every prompt you've created. Click one to open it. Hover over
  a prompt and a small 🗑 (trash) icon appears on the right to delete it.
- **Settings** (gear, bottom) — pick which **AI model** your runs use. See
  [Switching models](#switching-models). The currently selected model is shown
  under "Settings".

### The workspace — "Overview" tab
This is where you write and test a single prompt. It's split into two panels:

**Left panel — the prompt itself:**
- The prompt's **name** (click to rename) and **description**.
- **Prompt text** — the big editing box. Above it, "Editing: *version name*" tells
  you which version you're changing. If you've made edits that aren't saved yet,
  a small "• unsaved" marker appears.
- **Version history** — the list of saved versions. Click one to load it into the
  editor. Double‑click a version's name to rename it; click the dash next to it to
  add a short note. Hover to reveal a trash icon to delete that version.
- **Action bar** (sticky at the bottom):
  - **Save changes** — saves your edits *into the current version* (overwrites it).
    It's greyed out until you've actually changed something.
  - **Save as new version** — keeps the current version untouched and saves your
    edits as a brand‑new version (it asks for a name and optional note).

**Right panel — the Sandbox (where you test):**
- Optional **System prompt** — a background instruction that sets the model's role
  or tone (e.g. "You are a concise assistant"). Collapsed by default.
- **Variables** — input boxes for any `{{variables}}` in your prompt text.
- **Temperature, Top‑P, Top‑K, Max tokens** — settings that shape the answer
  (explained [below](#the-settings-explained-in-plain-words)).
- **Thinking mode** — lets supported models reason step‑by‑step before answering.
- **Run** — sends the prompt to the model. The answer appears underneath, along
  with how many tokens it used and how long it took. **Copy output** copies it.

You can hide the Sandbox with the little arrow on the divider between the panels,
giving the editor full width.

### The workspace — "A/B Tester" tab
This compares **two versions of the same prompt** at once. Pick a version for
side **A** and a version for side **B**, set the shared options once, and click
**Run both**. Both answers appear next to each other with their token counts and
timings, so you can judge which version did better under identical settings. The
👁 (eye) icon on each side shows the exact prompt text that was sent.

---

## How to use it — a typical session

1. **Create a prompt.** Click **New Prompt**, give it a name (e.g. `email-summary`).
2. **Write the prompt text** in the big box. Use `{{variables}}` for anything that
   changes from run to run.
3. **Fill in the variables** in the Sandbox on the right.
4. **Click Run.** Read the answer.
5. **Adjust the wording** and run again. Repeat until it's close.
6. **Save your progress.** When a wording is worth keeping, click
   **Save as new version** and name it (e.g. `more-concise`). This protects it so
   future experiments can't lose it.
7. **Compare.** Switch to the **A/B Tester** tab, put your old version on side A
   and the new one on side B, and **Run both** to confirm the new one is actually
   better.
8. **Keep the winner.** Back in Overview, select the version you prefer — it
   becomes the current one.

> **Tip:** "Save changes" overwrites the version you're editing; "Save as new
> version" branches off a fresh copy. When in doubt, use **Save as new version** —
> it never throws anything away.

---

## The settings explained (in plain words)

These live in the Sandbox (and in the A/B Tester's "Advanced" section). The
defaults are sensible — you can ignore most of them at first.

| Setting | What it does | When to change it |
|---|---|---|
| **Temperature** | How adventurous the model is. **Low (0–0.3)** = focused, repeatable, "safe" answers. **High (0.8–1.5)** = more creative and varied. | Lower it for factual/structured tasks; raise it for brainstorming or creative writing. |
| **Top‑P** | Another way to control variety, by limiting how much of the model's vocabulary it considers. `1.0` means "consider everything". | Usually leave at `1.0`. Advanced. |
| **Top‑K** | Similar to Top‑P — caps how many candidate words the model weighs at each step. | Usually leave at the default. Advanced. |
| **Max tokens** | The maximum **length** of the answer (a token is roughly ¾ of a word). | Raise it if answers get cut off; lower it to force brevity. |
| **Thinking mode** | Lets supported models "think" privately before answering, which can improve hard reasoning tasks (and makes them slower). | Turn on for tricky reasoning; off for simple, fast tasks. |
| **System prompt** | A separate, background instruction that frames *how* the model should behave, independent of the task itself. | Use it to set a role ("You are a translator"), tone, or output format. |

---

## Switching models

You can switch between AI models — **even ones hosted on different servers** —
without touching any config while the app is running:

1. Click **Settings** (the gear icon at the bottom of the sidebar).
2. Pick a model from the list — the checked one is active.
3. Click **Done**.

Every run from then on (in both Overview and A/B Tester) uses that model, and your
choice is remembered the next time you open the app.

The list of models is declared once in `backend/config.json` (set up during
[installation](#running-the-app)). If you add or change models there, click
**Refresh** in Settings to reload the list — no restart needed.

> Running the *same prompt* on *different models* is a great way to find the best
> (or cheapest/fastest) model for a task — switch the model and re-run.

---

## Running the app

> This is the one‑time technical setup. If a teammate has already set it up, you
> only need to know the address to open in your browser (usually
> **http://localhost:4700**).

### What you need
- **[Node.js](https://nodejs.org/)** version 18 or newer (this also installs
  `npm`). Check with `node --version` in a terminal.
- **Access to an LLM server** that speaks the OpenAI chat API — typically a
  `llama.cpp` server your team runs. You'll need its address.

### Steps

1. **Install the dependencies** (run once, from the project folder):
   ```bash
   npm run install:all
   ```

2. **List your models.** In the `backend` folder, copy the example config and
   edit it:
   ```bash
   cp backend/config.example.json backend/config.json
   ```
   In `backend/config.json`, add one entry per model. Each pairs a server URL with
   the model name that server expects; models may live on **different servers**:
   ```json
   {
     "port": 4701,
     "defaultModel": "Qwen 35B",
     "models": [
       { "label": "Qwen 35B",  "uri": "http://host-a:8009", "model": "Qwen3.6-35B-...gguf" },
       { "label": "Gemma 26B", "uri": "http://host-b:8010", "model": "gemma-4-26B-...gguf" }
     ]
   }
   ```
   - `label` is what you'll see and pick in the **Settings** menu (must be unique).
   - `uri` is that model's server address; `model` is the exact name it expects.
   - `defaultModel` (optional) is the label to start on.
   - `port` (optional, default `4701`) — the backend port. The frontend's dev
     proxy reads it from here automatically; just restart the app after changing it.

   For a single model, just list one entry. You can change this list anytime and
   hit **Refresh** in Settings — no restart needed.

3. **Start everything:**
   ```bash
   npm run dev
   ```
   This launches both the backend and the frontend together.

4. **Open the app** in your browser at **http://localhost:4700**.

To stop the app, press `Ctrl‑C` in the terminal.

Your prompts and versions are stored in a local database file at
`backend/data/prompt-studio.db`. It stays on your machine and is not committed to
git.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| A run shows **"Could not reach LLM server"** | The `uri` for the selected model (in `backend/config.json`) is wrong, or that server is down/unreachable. Confirm the address and that you can reach it from your machine. |
| Settings shows **"No models configured"** | `backend/config.json` is missing or has an empty `models` list. Copy `backend/config.example.json` and fill it in. |
| Settings shows a **"Could not read model catalog"** error | `backend/config.json` has a syntax error. Check it's valid JSON (commas, quotes, brackets). |
| A run shows **"Request timed out"** | The model took longer than 5 minutes (very large prompt, or a busy/slow server). Try a shorter prompt or a smaller "Max tokens". |
| The page won't open at `localhost:4700` | The app isn't running — start it with `npm run dev`. Make sure nothing else is using ports 4700/4701. |
| **`npm` not found** | Node.js isn't installed or isn't on your PATH. Install it from [nodejs.org](https://nodejs.org/). |

---

## For developers

A lightweight, fully local two‑process app.

**Stack**
- **Frontend:** Vue 3 + TypeScript + Vite, plain CSS. Dev server on **port 4700**,
  which proxies `/api/*` to the backend.
- **Backend:** Node.js + Express + TypeScript on **port 4701**. A thin REST API
  plus a proxy to the LLM server (so the model address never reaches the browser).
- **Database:** SQLite via [`node-sqlite3-wasm`](https://www.npmjs.com/package/node-sqlite3-wasm)
  (WASM build — no native compilation needed). One file at `backend/data/`.
- **LLM:** any OpenAI‑compatible chat endpoint (built for `llama.cpp`).

**Layout**
```
backend/
  src/
    index.ts            Express app + route wiring
    config.ts           Loads config.json (port + model catalog); resolves id → uri+model
    db/
      schema.ts         CREATE TABLE statements (prompts, versions)
      index.ts          DB connection + idempotent schema migrations
    routes/
      health.ts         GET  /api/health
      prompts.ts        list / create prompts
      promptDetail.ts   get one prompt, list/create its versions, patch, delete
      versions.ts       update (text/name/note/current) and delete a version
      llm.ts            GET /api/llm/models (catalog) + POST /api/llm/run (proxy)
frontend/
  src/
    App.vue             Root layout; loads prompt + versions into the editor store
    components/
      Sidebar.vue       Prompt list, module tabs, collapse, new/delete prompt, Settings
      SaveVersionModal.vue  "Save as new version" dialog
      SettingsModal.vue     Model picker (switch active LLM model)
    views/
      OverviewModule.vue  Two-panel Overview (editor + sandbox) with a collapse toggle
      LeftPanel.vue       Prompt metadata, editor, version history, save bar
      SandboxPanel.vue    LLM config + Run + rendered output
      ABTesterModule.vue  Side-by-side comparison of two versions
    store/
      app.ts            Shared: selected prompt id + prompt list
      editor.ts         Shared: active prompt/version, text, variables, output log
      settings.ts       Shared: available models + chosen model (localStorage)
    utils/
      variables.ts      {{variable}} detection + substitution
    api/index.ts        Typed fetch wrapper around the backend
```

**Data model** — just two tables. A `prompt` has many `versions`; one version per
prompt carries `is_current = 1`. Deleting a prompt cascades to its versions. See
`backend/src/db/schema.ts`.

**Run / build**
- `npm run dev` — backend (`tsx watch`) + frontend (`vite`) together.
- `npm run build --prefix frontend` / `--prefix backend` — production builds.

**Config** — one git‑ignored file, `backend/config.json` (see
`config.example.json`): the server `port` plus the model catalog the UI switches
between (each entry maps a `label`/id to a server `uri` + `model` name).
