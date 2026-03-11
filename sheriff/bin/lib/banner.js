'use strict';

// ANSI color codes
const GOLD = '\x1b[38;2;218;165;32m';   // goldenrod
const DIM = '\x1b[38;2;170;130;20m';    // darker gold for shadow
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

module.exports = { printBanner, printCompact, GOLD, DIM, WHITE, GRAY, RESET, BOLD };
