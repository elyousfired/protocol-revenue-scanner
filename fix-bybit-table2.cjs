const fs = require('fs');

let html = fs.readFileSync('public/index.html', 'utf-8');

const rowOld = `              <td class="py-3 px-4 text-right text-xs text-slate-400">
                <div>H: <span class="text-slate-200">\${formatSpotPrice(tok.high24h)}</span></div>
                <div>L: <span class="text-slate-500">\${formatSpotPrice(tok.low24h)}</span></div>
              </td>
              <td class="py-3 px-4 text-right text-xs">\${revDisplay}</td>`;

const rowNew = `              <td class="py-3 px-4 text-right text-xs font-bold text-amber-300">
                \${tok.mcap > 0 ? ((tok.volume24hUsd / tok.mcap) * 100).toFixed(1) + '%' : '<span class="text-slate-600 font-normal">N/A</span>'}
              </td>
              <td class="py-3 px-4">
                \${(() => {
                  const range = tok.high24h - tok.low24h;
                  const current = tok.price - tok.low24h;
                  const pct = range > 0 ? Math.max(0, Math.min(100, (current / range) * 100)) : 50;
                  const color = pct > 90 ? 'bg-rose-500' : (pct > 75 ? 'bg-amber-400' : 'bg-cyan-500');
                  return \`
                    <div class="space-y-1.5 w-full">
                      <div class="flex justify-between text-[9px] text-slate-500">
                        <span>L</span>
                        <span class="\${pct > 95 ? 'text-rose-400 font-bold' : ''}">\${pct.toFixed(0)}%</span>
                        <span>H</span>
                      </div>
                      <div class="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div class="h-full \${color} rounded-full" style="width: \${pct}%"></div>
                      </div>
                    </div>
                  \`;
                })()}
              </td>
              <td class="py-3 px-4 text-right text-xs">\${revDisplay}</td>`;

html = html.replace(rowOld, rowNew);

fs.writeFileSync('public/index.html', html);
console.log('Fixed replacement!');
