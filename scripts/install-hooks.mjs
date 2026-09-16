#!/usr/bin/env node
// Points git at scripts/hooks/ so the name guard runs before every commit. Safe to re-run.
import { execFileSync } from 'node:child_process';
execFileSync('git', ['config', 'core.hooksPath', 'scripts/hooks'], { stdio: 'inherit' });
console.log('Git hooks installed: scripts/hooks/pre-commit runs the name guard before each commit.');
console.log('Undo with: git config --unset core.hooksPath');
