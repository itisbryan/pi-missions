#!/bin/bash
set -euo pipefail

# Correctness checks — must pass for any experiment to be kept
# Only errors shown, success is silent

# 1. TypeScript compilation must pass
TSC_OUT=$(npx tsc --noEmit 2>&1 || true)
if echo "$TSC_OUT" | grep -q "error TS"; then
  echo "TypeScript errors:"
  echo "$TSC_OUT" | grep "error TS" | head -20
  exit 1
fi

# 2. Default export must exist
if ! grep -q "export default function" extensions/index.ts; then
  echo "FAIL: Missing default export in extensions/index.ts"
  exit 1
fi

# 3. All 12 files must exist
EXPECTED_FILES="commands config detector index mission-control planner progress-log protocol state tools types utils widget"
for name in $EXPECTED_FILES; do
  if [ ! -f "extensions/${name}.ts" ]; then
    echo "FAIL: Missing extensions/${name}.ts"
    exit 1
  fi
done

# 4. Bracket balance
for f in extensions/*.ts; do
  node -e "
    const fs=require('fs'),c=fs.readFileSync('$f','utf8');
    let b=0,p=0,k=0;
    for(const ch of c){if(ch==='{')b++;if(ch==='}')b--;if(ch==='(')p++;if(ch===')')p--;if(ch==='[')k++;if(ch===']')k--;}
    if(b||p||k){console.log('UNBALANCED: $f');process.exit(1);}
  " || exit 1
done

echo "All checks passed."
