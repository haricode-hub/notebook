#!/usr/bin/env bash
# Usage: ./loop.sh <level> [max_iterations]   (run inside WSL2 / Linux / a devcontainer)
LEVEL=${1:?usage: ./loop.sh <level> [max]}
MAX=${2:-60}
sed -i "s/^CURRENT_LEVEL = .*/CURRENT_LEVEL = $LEVEL/" .agents/LOOP_PROMPT.md
for i in $(seq 1 "$MAX"); do
  echo "=== level $LEVEL iteration $i ==="
  OUT=$(claude -p --dangerously-skip-permissions < .agents/LOOP_PROMPT.md 2>&1)
  echo "$OUT" | tail -15
  echo "$OUT" | grep -q "<promise>L${LEVEL}_COMPLETE</promise>" && { echo "LEVEL $LEVEL DONE"; break; }
  sleep 2
done
 