'use strict';

// ANSI color codes
const GOLD = '\x1b[1;33m';              // bold yellow
const GREEN = '\x1b[1;32m';             // bold green
const DIM = '\x1b[33m';                 // yellow (non-bold) for version
const WHITE = '\x1b[37m';
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const LOGO = [
  `  ███████╗██╗  ██╗███████╗██████╗ ██╗███████╗███████╗`,
  `  ██╔════╝██║  ██║██╔════╝██╔══██╗██║██╔════╝██╔════╝`,
  `  ███████╗███████║█████╗  ██████╔╝██║█████╗  █████╗  `,
  `  ╚════██║██╔══██║██╔══╝  ██╔══██╗██║██╔══╝  ██╔══╝  `,
  `  ███████║██║  ██║███████╗██║  ██║██║██║     ██║     `,
  `  ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝     ╚═╝     `,
];

const BADGE = `  ${GRAY}Automated test coverage. Fire and forget.${RESET}`;

function printBanner(version) {
  const v = version ? `  ${DIM}v${version}${RESET}` : '';
  console.log('');
  for (const line of LOGO) {
    console.log(`${GOLD}${line}${RESET}`);
  }
  console.log(v);
  console.log(BADGE);
  console.log('');
}

function printCompact() {
  console.log(`${GOLD}${BOLD}  SHERIFF${RESET} ${GRAY}— automated test coverage${RESET}`);
}

module.exports = { printBanner, printCompact, GOLD, GREEN, DIM, WHITE, GRAY, RESET, BOLD };
