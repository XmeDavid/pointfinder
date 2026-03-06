#!/bin/zsh
# Daily PointFinder Project Brainstorm
# Schedule via crontab: 30 4 * * * /path/to/daily-project-brainstorm.sh
#
# This script runs Claude Code in a git worktree to analyze the codebase
# for bugs, improvements, and creative ideas. Results are ready by ~6:30 AM.

set -euo pipefail

# Set up environment without sourcing full .zshrc (which tries to attach tmux)
export HOME="/Users/xmedavid"
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/openjdk/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Load NVM for node access (needed by Claude plugins)
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"

# Load Claude auth token from project .env
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export CLAUDE_CODE_OAUTH_TOKEN=$(grep CLAUDE_CODE_OAUTH_TOKEN "${PROJECT_DIR}/.env" | cut -d'=' -f2-)
DATE=$(date +%Y%m%d)
BRANCH_NAME="daily-review/${DATE}"
WORKTREE_DIR="${PROJECT_DIR}/.claude/worktrees/daily-review-${DATE}"
LOG_FILE="${PROJECT_DIR}/.claude/worktrees/daily-review-${DATE}.log"

# Ensure .claude/worktrees directory exists
mkdir -p "${PROJECT_DIR}/.claude/worktrees"

# Clean up previous worktree for today if it exists (re-run scenario)
if [ -d "${WORKTREE_DIR}" ]; then
    git -C "${PROJECT_DIR}" worktree remove "${WORKTREE_DIR}" --force 2>/dev/null || true
    git -C "${PROJECT_DIR}" branch -D "${BRANCH_NAME}" 2>/dev/null || true
fi

# Create worktree
cd "${PROJECT_DIR}"
git worktree add "${WORKTREE_DIR}" -b "${BRANCH_NAME}" HEAD

cd "${WORKTREE_DIR}"

PROMPT='IMPORTANT: You are running as an unattended scheduled task at 5:00 AM. There is no human present. Never wait for user input, never ask questions, never prompt for confirmation. Make all decisions autonomously. If something is ambiguous, pick the most reasonable option and document your reasoning in the report.

You are performing a daily review of the PointFinder project -- an NFC-based gaming platform for scouting organizations. You are already inside a git worktree branch, so all your changes are isolated.

Read the CLAUDE.md file in the project root first for full architectural context, including build and test commands.

## Phase 1: Run all tests and fix any failures

This is the highest priority. Do not move to Phase 2 until all tests pass.

1. Run the Docker test suite (backend + frontend):
   make test-docker

2. Run the E2E tests against production:
   cd e2e && npm install && npx playwright install chromium && ./run.sh all

3. If any tests fail:
   - Diagnose the root cause of each failure.
   - Fix the issue and commit the fix with a descriptive commit message.
   - Re-run the failing tests to confirm they pass.
   - Repeat until all tests are green.

## Phase 2: Improve existing tests

Once all tests pass, explore one meaningful improvement to the test suite. Pick whichever of these has the highest impact:

- Add missing test coverage for an untested critical path.
- Harden a flaky test.
- Add edge case coverage for a recently changed area.
- Improve E2E parity (check with: cd e2e && ./run.sh parity).

Commit any test improvements with descriptive commit messages.

## Phase 3: Creative codebase review

With tests green and improved, perform a creative analysis across these dimensions:

1. **Bug hunting**: Potential bugs, race conditions, null pointer risks, unhandled edge cases, security vulnerabilities (SQL injection, XSS, auth bypasses, insecure defaults).
2. **Code quality**: Code duplication, overly complex methods, missing error handling, inconsistent patterns, dead code.
3. **Architecture**: Module boundaries, dependency health, API design consistency, database schema concerns, migration risks.
4. **Performance**: N+1 queries, missing indexes, unbounded queries, memory leaks, unnecessary re-renders in React, large bundle concerns.
5. **Creative improvements**: Novel features, UX enhancements, developer experience improvements, tooling upgrades, and unconventional ideas.

For each finding, assess severity (critical / high / medium / low) and effort (small / medium / large).

If you identify critical or high-severity bugs with clear fixes, implement and commit them.

## Report

Write a structured markdown report named DAILY-REVIEW-'"${DATE}"'.md at the project root with:
- Executive summary (top 3-5 findings)
- Test results: which suites ran, pass/fail counts, what was fixed
- Test improvement: what was added or improved and why
- Codebase findings grouped by dimension
- For each finding: file path(s), line numbers, description, severity, effort, and suggested fix
- A "Creative Corner" section with at least 3 unconventional improvement ideas

After completing the review, print a summary of: test results, total findings by severity, number of fix commits made, and the branch name for review.

Do not push any branches to remote. Keep the report concise but actionable -- quality over quantity. Prioritize findings with real practical impact.'

# Run Claude Code
/opt/homebrew/bin/claude -p \
    --dangerously-skip-permissions \
    --model opus \
    "$PROMPT" \
    2>&1 | tee "${LOG_FILE}"

echo ""
echo "============================================"
echo "Daily review complete."
echo "Worktree: ${WORKTREE_DIR}"
echo "Branch:   ${BRANCH_NAME}"
echo "Log:      ${LOG_FILE}"
echo "============================================"
