#!/bin/bash
set -uo pipefail

# ============================================================================
# pi-mission Extension Quality Benchmark
# ============================================================================

ISSUES=0

# --- 1. TypeScript compilation ---
TSC_OUTPUT=$(npx tsc --noEmit 2>&1 || true)
TSC_ERRORS=$(echo "$TSC_OUTPUT" | grep -c "error TS" || true)
if [ "$TSC_ERRORS" -gt 0 ]; then
  echo "TSC ERRORS: $TSC_ERRORS"
  echo "$TSC_OUTPUT" | grep "error TS" | head -10
fi
ISSUES=$((ISSUES + TSC_ERRORS))

# --- 2. Import resolution ---
IMPORT_ISSUES=0
for f in extensions/*.ts; do
  while IFS= read -r imp; do
    [ -z "$imp" ] && continue
    base="${imp%.ts}"
    if [ ! -f "extensions/${base}.ts" ]; then
      echo "MISSING IMPORT: $f -> extensions/${base}.ts"
      IMPORT_ISSUES=$((IMPORT_ISSUES + 1))
    fi
  done < <(grep -o 'from "\./[^"]*"' "$f" 2>/dev/null | sed 's/from "\.\/\(.*\)"/\1/' || true)
done
ISSUES=$((ISSUES + IMPORT_ISSUES))

# --- 3. Try/catch coverage ---
MISSING_TRYCATCH=0
CMD_HANDLERS=$(grep -c "handler: async" extensions/commands.ts || true)
CMD_TRYCATCH=$(grep -c "try {" extensions/commands.ts || true)
if [ "$CMD_TRYCATCH" -lt "$CMD_HANDLERS" ]; then
  echo "MISSING try/catch in commands.ts: $CMD_HANDLERS handlers but $CMD_TRYCATCH try blocks"
  MISSING_TRYCATCH=$((CMD_HANDLERS - CMD_TRYCATCH))
fi
# Count unique handler logic paths (shared helper counts as 1)
# restoreFromSession covers session_start/switch/fork/tree (1 try/catch)
# message_end and before_agent_start have their own (2 try/catches)
# Total expected: 3 try blocks for 6 pi.on handlers
IDX_TRYCATCH=$(grep -c "try {" extensions/index.ts || true)
if [ "$IDX_TRYCATCH" -lt 3 ]; then
  echo "MISSING try/catch in index.ts: expected at least 3, got $IDX_TRYCATCH"
  MISSING_TRYCATCH=$((MISSING_TRYCATCH + 3 - IDX_TRYCATCH))
fi
ISSUES=$((ISSUES + MISSING_TRYCATCH))

# --- 4. Bracket balance ---
BALANCE_ISSUES=0
for f in extensions/*.ts; do
  result=$(node -e "
    const fs=require('fs'),c=fs.readFileSync('$f','utf8');
    let b=0,p=0,k=0;
    for(const ch of c){if(ch==='{')b++;if(ch==='}')b--;if(ch==='(')p++;if(ch===')')p--;if(ch==='[')k++;if(ch===']')k--;}
    if(b||p||k){console.log('UNBALANCED: $f braces='+b+' parens='+p+' brackets='+k);process.exit(1);}
  " 2>&1 || true)
  if [ -n "$result" ]; then
    echo "$result"
    BALANCE_ISSUES=$((BALANCE_ISSUES + 1))
  fi
done
ISSUES=$((ISSUES + BALANCE_ISSUES))

# --- 5. Default export ---
if ! grep -q "export default function" extensions/index.ts; then
  echo "MISSING default export in index.ts"
  ISSUES=$((ISSUES + 1))
fi

# --- 6. Command/shortcut count ---
EXPECTED_CMDS=8
ACTUAL_CMDS=$(grep -c "pi.registerCommand" extensions/commands.ts || true)
if [ "$ACTUAL_CMDS" -ne "$EXPECTED_CMDS" ]; then
  echo "COMMAND COUNT: expected $EXPECTED_CMDS, got $ACTUAL_CMDS"
  ISSUES=$((ISSUES + 1))
fi
ACTUAL_SHORTCUTS=$(grep -c "pi.registerShortcut" extensions/commands.ts || true)
if [ "$ACTUAL_SHORTCUTS" -ne 1 ]; then
  echo "SHORTCUT COUNT: expected 1, got $ACTUAL_SHORTCUTS"
  ISSUES=$((ISSUES + 1))
fi

# --- 7. Event handler count ---
EXPECTED_EVENTS=7
ACTUAL_EVENTS=$(grep -c "pi.on(" extensions/index.ts || true)
if [ "$ACTUAL_EVENTS" -ne "$EXPECTED_EVENTS" ]; then
  echo "EVENT COUNT: expected $EXPECTED_EVENTS, got $ACTUAL_EVENTS"
  ISSUES=$((ISSUES + 1))
fi

# --- 8. File count ---
FILE_COUNT=$(ls extensions/*.ts 2>/dev/null | wc -l | tr -d ' ')
if [ "$FILE_COUNT" -ne 13 ]; then
  echo "FILE COUNT: expected 13, got $FILE_COUNT"
  ISSUES=$((ISSUES + 1))
fi

# --- 9. Check for console.log (should use console.error for debug) ---
CONSOLE_LOGS=$(grep -rn "console\.log(" extensions/*.ts | grep -v "// " | wc -l | tr -d ' ')

# --- 10. Unguarded optional property access (milestones, validationAssertions) ---
UNGUARDED=0
for f in extensions/*.ts; do
  # Check for .milestones. without ?. and not inside an if-guard
  while IFS= read -r line; do
    linenum=$(echo "$line" | cut -d: -f1)
    # Check if previous 5 lines contain a guard
    guard=$(sed -n "$((linenum>20 ? linenum-20 : 1)),${linenum}p" "$f" | grep -c "if.*milestones\|milestones &&\|!state.milestones\|for.*milestones" || true)
    if [ "$guard" -eq 0 ]; then
      echo "UNGUARDED milestones access: $f:$linenum"
      UNGUARDED=$((UNGUARDED + 1))
    fi
  done < <(grep -n "state\.milestones\." "$f" 2>/dev/null | grep -v "?\." || true)
done
ISSUES=$((ISSUES + UNGUARDED))

# --- 11. Total lines ---
TOTAL_LINES=$(cat extensions/*.ts | wc -l | tr -d ' ')

# --- Output ---
echo ""
echo "METRIC issues=$ISSUES"
echo "METRIC tsc_errors=$TSC_ERRORS"
echo "METRIC import_issues=$IMPORT_ISSUES"
echo "METRIC balance_issues=$BALANCE_ISSUES"
echo "METRIC trycatch_missing=$MISSING_TRYCATCH"
echo "METRIC total_lines=$TOTAL_LINES"
echo "METRIC file_count=$FILE_COUNT"
echo "METRIC commands=$ACTUAL_CMDS"
echo "METRIC console_logs=$CONSOLE_LOGS"
echo "METRIC unguarded=$UNGUARDED"
