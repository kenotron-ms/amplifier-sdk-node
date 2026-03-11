# Workspaces Configuration Implementation Plan

> **Execution:** Use the subagent-driven-development workflow to implement this plan.

**Goal:** Add npm workspaces configuration to root package.json so platform packages resolve locally during development.

**Architecture:** Add a `workspaces` field pointing to `packages/@amplifier/*` so npm creates symlinks in `node_modules/@amplifier/` for each platform package. This enables `require.resolve('@amplifier/sdk-darwin-arm64/package.json')` in `binary.ts` to find platform packages locally without publishing to a registry. A `.npmrc` with `force=true` is required because npm v11 enforces `os`/`cpu` constraints on workspace members and would otherwise reject platform packages that don't match the host.

**Tech Stack:** npm workspaces, package.json, .npmrc

> **Spec Review Warning:** This task's spec review loop exhausted after 3 iterations
> before reaching approval. The final verdict was APPROVED, but the reviewer flagged
> an out-of-spec file (`.npmrc`) that was deemed necessary to satisfy the acceptance
> criterion "`npm install` succeeds." Human reviewer should verify this is acceptable.

**Dependencies:** task-10-14-platform-packages (the 5 platform package skeletons under `packages/@amplifier/` must exist)

---

### Task 1: Add workspaces field to package.json

**Files:**
- Modify: `package.json` (add `workspaces` after `optionalDependencies` closing brace)

**Step 1: Add workspaces field**

Edit `package.json`. Change the closing of `optionalDependencies` from:

```json
    "@amplifier/sdk-win32-x64": "0.1.0"
  }
}
```

to:

```json
    "@amplifier/sdk-win32-x64": "0.1.0"
  },
  "workspaces": [
    "packages/@amplifier/*"
  ]
}
```

The only changes are: add a comma after the `optionalDependencies` closing brace, add the `workspaces` array, keep the final `}`.

**Step 2: Verify JSON is valid**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid')"
```
Expected: `valid`

**Step 3: Commit**
```bash
git add package.json
git commit -m "feat: add npm workspaces config for local platform package resolution

Add workspaces field to root package.json pointing to packages/@amplifier/*
so platform packages resolve locally during development via symlinks in
node_modules/@amplifier/."
```

---

### Task 2: Add .npmrc to handle cross-platform workspace members

**Files:**
- Create: `.npmrc`

**Step 1: Create .npmrc with force flag**

Create `.npmrc` in the project root with this exact content:

```
# Allow workspace packages with os/cpu constraints that don't match the current
# host platform (e.g. sdk-darwin-x64 on darwin/arm64). These are platform-
# specific binary packages; all five are always present as workspace members
# but only the matching one is used at runtime.
force=true
```

**Why this is needed:** Each platform package has `"os"` and `"cpu"` fields in its `package.json` (e.g., `"os": ["darwin"], "cpu": ["arm64"]`). npm v11's arborist enforces these constraints on workspace members and exits with `EBADPLATFORM` for packages that don't match the host. Since all 5 platform packages are always present as workspace members but only one matches the host, `force=true` is required.

**Step 2: Commit**
```bash
git add .npmrc
git commit -m "fix: add .npmrc force=true for cross-platform workspace members

npm v11 enforces os/cpu constraints on workspace members. Since all five
platform packages are present as workspaces but only one matches the host,
force=true is needed for npm install to succeed."
```

---

### Task 3: Verify workspace resolution and test suite

**Files:** (no changes — verification only)

**Step 1: Run npm install**

Run:
```bash
npm install --ignore-scripts
```
Expected: Exit 0. Output shows workspace packages being linked.

**Step 2: Verify symlinks exist**

Run:
```bash
ls -la node_modules/@amplifier/
```
Expected: 5 symlinks pointing to `../../packages/@amplifier/<name>`:
```
sdk-darwin-arm64 -> ../../packages/@amplifier/sdk-darwin-arm64
sdk-darwin-x64   -> ../../packages/@amplifier/sdk-darwin-x64
sdk-linux-arm64  -> ../../packages/@amplifier/sdk-linux-arm64
sdk-linux-x64    -> ../../packages/@amplifier/sdk-linux-x64
sdk-win32-x64    -> ../../packages/@amplifier/sdk-win32-x64
```

**Step 3: Run full test suite**

Run:
```bash
npx vitest run
```
Expected: All 8 test files pass (68 tests), exit 0. No regressions from workspace configuration.

---

**Acceptance Criteria Checklist:**
- [ ] `package.json` contains `"workspaces": ["packages/@amplifier/*"]`
- [ ] `npm install --ignore-scripts` succeeds (exit 0)
- [ ] All existing tests still pass