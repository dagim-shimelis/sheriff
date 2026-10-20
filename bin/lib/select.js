'use strict';

const readline = require('readline');
const path = require('path');
const pkg = require('../../package.json');
const { LOGO } = require('../../sheriff/bin/lib/banner');

const FRONTIER = [
  '     ·                  ✦                         ·         ',
  '                 ▄▄██████▄▄             ·                  ',
  '    ▄▄▄▄        ▐██████████▌                   ▄▄▄▄▄        ',
  '  ▄██████▄       ▀▀██████▀▀     ▄▄▄▄          ███████▄      ',
  '▄██████████▄▄              ▄▄███████▄▄     ▄██████████▄▄    ',
  '        ╷  ╷       ────────             ╷                   ',
  '       ╰┤╭─╯    ──         ─────       ╰┤╭╯   ──────────   ',
  '────────┴───────────                 ───┴───────────────────',
];

function select(question, choices, initial = 0, input = process.stdin, output = process.stdout) {
  return new Promise((resolve, reject) => {
    let selected = initial;
    const wasRaw = Boolean(input.isRaw);
    const wasPaused = input.readableFlowing !== true;
    const color = output.isTTY && !('NO_COLOR' in process.env) && process.env.TERM !== 'dumb';
    const gold = (text) => color ? `\x1b[38;2;236;193;121m${text}\x1b[0m` : text;
    const highlight = (text) => color ? `\x1b[48;2;236;193;121m\x1b[38;2;32;36;29m${text}\x1b[0m` : text;
    readline.emitKeypressEvents(input);

    const render = () => {
      const width = Math.max(1, (output.columns || 80) - 1);
      const height = output.rows || 24;
      const fit = (text) => Array.from(text).slice(0, width).join('');
      const center = (text, style = (value) => value) => {
        const clipped = fit(text);
        return ' '.repeat(Math.max(0, Math.floor((width - Array.from(clipped).length) / 2))) + style(clipped);
      };
      const menuWidth = Math.min(width, Math.max(...choices.map((choice) => choice.length)) + 5);
      const indent = ' '.repeat(Math.max(0, Math.floor((width - menuWidth) / 2)));
      const menu = choices.map((choice, index) => {
        const label = fit(` ${index === selected ? '›' : ' '} ${choice} `).padEnd(menuWidth);
        return indent + (index === selected ? highlight(label) : label);
      });
      const logoWidth = Math.max(...LOGO.map((line) => line.length));
      const sceneWidth = Math.max(...FRONTIER.map((line) => line.length));
      const showScene = width >= sceneWidth && height >= 24;
      const title = width >= logoWidth && height >= (showScene ? 34 : 24)
        ? LOGO.map((line) => center(line.padEnd(logoWidth), gold))
        : [center('SHERIFF', gold)];
      if (showScene) {
        title.push(...FRONTIER.map((line, index) => center(line.padEnd(sceneWidth), (text) => {
          const shade = index < 3 ? '236;193;121' : index < 5 ? '185;112;74' : '115;139;108';
          return color ? `\x1b[38;2;${shade}m${text}\x1b[0m` : text;
        })));
      }
      const body = height < 18 ? [center(question, gold), '', ...menu] : [
        ...title,
        '',
        center('Automated test coverage. Fire and forget.'),
        '',
        center(`Project: ${path.basename(process.cwd())}`),
        '',
        center(question, gold),
        '',
        ...menu,
      ];
      const top = Math.max(1, Math.floor((height - body.length - 3) / 2));
      const lines = [highlight(fit(` Sheriff setup  v${pkg.version}`).padEnd(width)), ...Array(top).fill(''), ...body];
      while (lines.length < height - 2) lines.push('');
      lines.push('', center('↑/↓ navigate   Enter select   Ctrl+C cancel'));
      output.write('\x1b[H\x1b[J' + lines.join('\n'));
    };
    const finish = (error) => {
      input.removeListener('keypress', onKey);
      input.removeListener('end', onEnd);
      input.removeListener('error', finish);
      output.removeListener('resize', render);
      input.setRawMode(wasRaw);
      if (wasPaused) input.pause();
      output.write('\x1b[?1049l\x1b[?25h');
      if (error) reject(error);
      else resolve(selected);
    };
    const onEnd = () => finish(new Error('Installation cancelled before a selection was made.'));
    const onKey = (_text, key = {}) => {
      if ((key.ctrl && ['c', 'd'].includes(key.name)) || key.name === 'escape') return onEnd();
      if (key.name === 'return') return finish();
      if (key.name === 'up') selected = (selected + choices.length - 1) % choices.length;
      else if (key.name === 'down') selected = (selected + 1) % choices.length;
      else return;
      render();
    };

    input.setRawMode(true);
    input.on('keypress', onKey);
    input.once('end', onEnd);
    input.once('error', finish);
    output.on('resize', render);
    input.resume();
    output.write('\x1b[?1049h\x1b[?25l');
    render();
  });
}

module.exports = { select };
