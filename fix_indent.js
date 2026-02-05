const fs = require('fs');

const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

// Fix indentation for lines 2197-2536 (0-indexed: 2196-2535)
const fixed = lines.map((line, idx) => {
  // These lines have 2 extra spaces that need to be removed
  if (idx >= 2196 && idx <= 2535) {
    // Check if line starts with 6 spaces followed by typical code patterns
    if (line.match(/^      (} else if|const |console\.|\/\/|if |} else|return|setLastMove|shouldAdvanceTurn|} else if|const {|for |let |const \{|const au|const tower|const terr|const dx|const playerMeta|const sourceUnit|const tile|const barracks|const spawnTarget|const auStats|const claimKey)/)) {
      // Remove 2 spaces
      return line.substring(2);
    }
  }
  return line;
});

fs.writeFileSync('server.js', fixed.join('\n'));
console.log('Fixed indentation');
